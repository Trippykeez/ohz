// Bundle scoring per CLAUDE.md:
//   Score(B) = w1·affinity_lift + w2·margin_uplift + w3·inventory_pressure
//            + w4·trend_alignment − w5·cannibalization_risk

import type { ConfidenceTier, ProductRow } from '../lib/types.ts';

// Default weights — per-shop tunable later as the system learns each
// seller's optimization preference.
export const DEFAULT_WEIGHTS = {
  affinity: 1.2,
  margin: 1.0,
  inventory: 0.6,
  trend: 0.5,
  cannibalization: 0.8,
};

export interface ScoreInputs {
  productSupport: Map<string, number>;
  itemSupport: number;
  lift: number;
  bundleProducts: ProductRow[];
  shopAvgOrderValue: number;
}

export interface ScoreOutput {
  score: number;
  affinity_lift: number;
  margin_uplift: number;
  inventory_pressure: number;
  trend_alignment: number;
  cannibalization_risk: number;
}

export function scoreBundle(input: ScoreInputs, weights = DEFAULT_WEIGHTS): ScoreOutput {
  const { lift, bundleProducts, productSupport, itemSupport, shopAvgOrderValue } = input;

  // affinity_lift normalized: lift of 1 is independence, 2 is meaningful, 5+ is exceptional.
  // Map to ~[0..1] via tanh of (lift - 1).
  const affinity_lift = Math.tanh(Math.max(0, lift - 1) / 2);

  // margin_uplift: bundle margin minus what these items would have made sold solo,
  // expressed as fraction of avg order value.
  const bundleRevenue = bundleProducts.reduce((s, p) => s + p.unit_price, 0);
  const bundleMargin = bundleProducts.reduce((s, p) => s + (p.unit_price - p.unit_cost), 0);
  // Conservative assumption: solo conversion would have been ~50% per item
  // (sellers say 'sold half as often when not bundled' is realistic for the
  // weaker member of the bundle). Tunable later.
  const soloMargin = bundleProducts.reduce((s, p) => s + (p.unit_price - p.unit_cost) * 0.5, 0);
  const marginDelta = bundleMargin - soloMargin;
  const margin_uplift = Math.tanh(marginDelta / Math.max(shopAvgOrderValue, 1));

  // inventory_pressure: max stock-aging signal across members. Items aging
  // past ~45 days OR sitting on >150 units of stock contribute.
  let inventoryPeak = 0;
  for (const p of bundleProducts) {
    const ageSig = Math.min(1, Math.max(0, (p.days_in_stock - 30) / 90));
    const stockSig = Math.min(1, Math.max(0, (p.stock_qty - 100) / 200));
    inventoryPeak = Math.max(inventoryPeak, 0.6 * ageSig + 0.4 * stockSig);
  }
  const inventory_pressure = inventoryPeak;

  // trend_alignment: at least one item heating up on Creative Center signals.
  const trend_alignment = bundleProducts.reduce((m, p) => Math.max(m, p.trend_score), 0);

  // cannibalization_risk: penalty when at least one member already sells very
  // well solo (high individual support relative to bundle support). If solo
  // demand is >5x bundle demand on the strongest member, the bundle mostly
  // displaces existing high-margin sales.
  let strongestSoloRatio = 0;
  for (const p of bundleProducts) {
    const sup = productSupport.get(p.id) ?? 0;
    if (sup > 0) strongestSoloRatio = Math.max(strongestSoloRatio, sup / Math.max(itemSupport, 1e-6));
  }
  const cannibalization_risk = Math.tanh(Math.max(0, strongestSoloRatio - 3) / 4);

  const score =
    weights.affinity * affinity_lift +
    weights.margin * margin_uplift +
    weights.inventory * inventory_pressure +
    weights.trend * trend_alignment -
    weights.cannibalization * cannibalization_risk;

  return {
    score,
    affinity_lift,
    margin_uplift,
    inventory_pressure,
    trend_alignment,
    cannibalization_risk,
  };
}

// Confidence tier maps to surface (push/headline vs explore tab). Thresholds
// are deliberately strict — fewer, higher-quality pings build trust faster
// than volume builds engagement.
export function classifyTier(args: {
  lift: number;
  coOccurrences: number;
  totalOrders: number;
  score: number;
}): ConfidenceTier {
  const { lift, coOccurrences, totalOrders, score } = args;
  const support = coOccurrences / Math.max(totalOrders, 1);

  if (lift >= 2.0 && support >= 0.04 && coOccurrences >= 25 && score >= 1.2) return 'strong';
  if (lift >= 1.5 && support >= 0.015 && coOccurrences >= 10) return 'worth_testing';
  return 'experimental';
}
