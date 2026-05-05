import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.ts';
import { mineFrequentItemsets } from './affinity.ts';
import { classifyTier, scoreBundle } from './scoring.ts';
import { archetypeHeadline, detectArchetype } from './archetypes.ts';
import { generateAlerts, persistAlerts } from './alerts.ts';
import type { ProductRow, WhyThis } from '../lib/types.ts';

const MIN_SUPPORT = 0.012;     // ~1.2% of orders — adjusted for shop scale
const MIN_LIFT = 1.3;          // pairs that co-occur ≥30% above chance
const MAX_SUGGESTIONS = 12;    // dashboard surfaces top N
const ROLLING_WINDOW_DAYS = 90;

export interface PipelineResult {
  shopId: string;
  totalOrders: number;
  candidatesMined: number;
  suggestionsPersisted: number;
  headlineSuggestionId: string | null;
  alertsPersisted: number;
}

export function runPipeline(shopId: string): PipelineResult {
  const db = getDb();
  const now = Date.now();
  const windowStart = now - ROLLING_WINDOW_DAYS * 24 * 3600 * 1000;

  const products = db
    .prepare<[string], ProductRow>(`SELECT * FROM products WHERE shop_id = ? ORDER BY id`)
    .all(shopId) as ProductRow[];
  const productById = new Map(products.map(p => [p.id, p]));

  const orderRows = db
    .prepare<[string, number], { id: string; total: number }>(
      `SELECT id, total FROM orders WHERE shop_id = ? AND ordered_at >= ?`,
    )
    .all(shopId, windowStart);
  const orderIds = orderRows.map(r => r.id);
  const totalOrders = orderIds.length;
  const shopAvgOrderValue =
    orderRows.reduce((s, r) => s + r.total, 0) / Math.max(totalOrders, 1);

  // Build transactions.
  const itemsByOrder = new Map<string, Set<string>>();
  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT order_id, product_id FROM order_items WHERE order_id IN (${placeholders})`)
      .all(...orderIds) as { order_id: string; product_id: string }[];
    for (const r of rows) {
      let s = itemsByOrder.get(r.order_id);
      if (!s) {
        s = new Set();
        itemsByOrder.set(r.order_id, s);
      }
      s.add(r.product_id);
    }
  }
  const transactions = [...itemsByOrder.values()];

  // Per-product support and rolling 7-day velocity (used for alerts).
  const productCounts = new Map<string, number>();
  for (const tx of transactions) for (const id of tx) productCounts.set(id, (productCounts.get(id) ?? 0) + 1);
  const productSupport = new Map<string, number>();
  for (const [id, c] of productCounts) productSupport.set(id, c / Math.max(totalOrders, 1));

  const sevenDayStart = now - 7 * 24 * 3600 * 1000;
  const velocityRows = db
    .prepare<[string, number], { product_id: string; n: number }>(
      `SELECT oi.product_id AS product_id, COUNT(*) AS n
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.shop_id = ? AND o.ordered_at >= ?
        GROUP BY oi.product_id`,
    )
    .all(shopId, sevenDayStart);
  const velocityByProduct = new Map<string, number>();
  for (const r of velocityRows) velocityByProduct.set(r.product_id, r.n / 7);

  // Mine frequent itemsets.
  const itemsets = mineFrequentItemsets(transactions, MIN_SUPPORT, MIN_LIFT);

  // Score each candidate.
  type Scored = {
    items: string[];
    products: ProductRow[];
    score: ReturnType<typeof scoreBundle>;
    co_occurrences: number;
    support: number;
    lift: number;
  };
  const scored: Scored[] = [];
  for (const it of itemsets) {
    const bundleProducts = it.items.map(id => productById.get(id)).filter(Boolean) as ProductRow[];
    if (bundleProducts.length !== it.items.length) continue;

    const score = scoreBundle(
      {
        productSupport,
        itemSupport: it.support,
        lift: it.lift,
        bundleProducts,
        shopAvgOrderValue,
      },
    );
    scored.push({
      items: it.items,
      products: bundleProducts,
      score,
      co_occurrences: it.count,
      support: it.support,
      lift: it.lift,
    });
  }

  scored.sort((a, b) => b.score.score - a.score.score);
  const top = scored.slice(0, MAX_SUGGESTIONS);

  // Replace prior suggestions for this shop. Outcomes are kept (they reference
  // suggestion ids), but for v1 we treat each pipeline run as a fresh batch.
  const txWipe = db.transaction(() => {
    db.prepare(`DELETE FROM suggestion_items WHERE suggestion_id IN (SELECT id FROM suggestions WHERE shop_id = ?)`).run(shopId);
    db.prepare(`DELETE FROM suggestions WHERE shop_id = ?`).run(shopId);
  });
  txWipe();

  // Pick headline: only a Strong tier suggestion is allowed in the headline.
  // No fallback bundle — UI shows fallback content if there's no Strong.
  let headlineId: string | null = null;
  const insertSuggestion = db.prepare(`
    INSERT INTO suggestions (
      id, shop_id, archetype, confidence_tier, score,
      affinity_lift, margin_uplift, inventory_pressure, trend_alignment, cannibalization_risk,
      support, co_occurrences, why_json, generated_at, is_headline
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insertSuggestionItem = db.prepare(
    `INSERT INTO suggestion_items (suggestion_id, product_id) VALUES (?,?)`,
  );

  const txWrite = db.transaction(() => {
    for (const s of top) {
      const tier = classifyTier({
        lift: s.lift,
        coOccurrences: s.co_occurrences,
        totalOrders,
        score: s.score.score,
      });
      const archetype = detectArchetype(s.products);
      const why = buildWhyThis({
        products: s.products,
        lift: s.lift,
        support: s.support,
        coOccurrences: s.co_occurrences,
        totalOrders,
        archetype,
        scoreOut: s.score,
      });

      const id = `sug_${randomUUID().slice(0, 8)}`;
      const isHeadline = !headlineId && tier === 'strong' ? 1 : 0;
      if (isHeadline) headlineId = id;

      insertSuggestion.run(
        id,
        shopId,
        archetype,
        tier,
        s.score.score,
        s.score.affinity_lift,
        s.score.margin_uplift,
        s.score.inventory_pressure,
        s.score.trend_alignment,
        s.score.cannibalization_risk,
        s.support,
        s.co_occurrences,
        JSON.stringify(why),
        now,
        isHeadline,
      );
      for (const productId of s.items) insertSuggestionItem.run(id, productId);
    }
  });
  txWrite();

  // Alerts on the headline (if any).
  let alertsPersisted = 0;
  if (headlineId) {
    const headlineProducts = top.find(s =>
      JSON.stringify(s.items) ===
      JSON.stringify(
        (db.prepare(`SELECT product_id FROM suggestion_items WHERE suggestion_id = ?`).all(headlineId) as {
          product_id: string;
        }[]).map(r => r.product_id),
      ),
    )?.items ?? [];
    const alerts = generateAlerts({
      shopId,
      products,
      headlineProductIds: headlineProducts,
      velocityByProduct,
    });
    persistAlerts(shopId, alerts);
    alertsPersisted = alerts.length;
  } else {
    persistAlerts(shopId, []);
  }

  return {
    shopId,
    totalOrders,
    candidatesMined: itemsets.length,
    suggestionsPersisted: top.length,
    headlineSuggestionId: headlineId,
    alertsPersisted,
  };
}

function buildWhyThis(args: {
  products: ProductRow[];
  lift: number;
  support: number;
  coOccurrences: number;
  totalOrders: number;
  archetype: ReturnType<typeof detectArchetype>;
  scoreOut: ReturnType<typeof scoreBundle>;
}): WhyThis {
  const { products, lift, support, coOccurrences, totalOrders, archetype, scoreOut } = args;
  const projectedLift = Math.round((lift - 1) * 100);
  const headline = archetypeHeadline(archetype, products);
  const margin = products.reduce((s, p) => s + (p.unit_price - p.unit_cost), 0);

  const metrics: WhyThis['metrics'] = [
    { label: 'Co-purchased in', value: `${coOccurrences} of ${totalOrders} orders (${(support * 100).toFixed(1)}%)` },
    { label: 'Lift vs. chance', value: `${lift.toFixed(2)}× — ${projectedLift > 0 ? '+' : ''}${projectedLift}% above independent purchase rate` },
    { label: 'Combined unit margin', value: `$${margin.toFixed(2)}` },
    { label: 'Inventory pressure', value: scoreOut.inventory_pressure >= 0.4 ? 'High — moves aging stock' : scoreOut.inventory_pressure >= 0.15 ? 'Moderate' : 'Low' },
    { label: 'Trend alignment', value: scoreOut.trend_alignment >= 0.6 ? 'Heating up on Creative Center' : scoreOut.trend_alignment >= 0.3 ? 'Steady' : 'No trend signal' },
    { label: 'Cannibalization risk', value: scoreOut.cannibalization_risk >= 0.3 ? 'Watch — may displace solo sales' : 'Low' },
  ];

  // Cross-shop comparison is a stub until ~50+ shops per vertical exist —
  // CLAUDE.md flags privacy model as an open question, so this string is
  // intentionally vague and dataset-free.
  const similar_shops =
    archetype === 'complementary' || archetype === 'discovery'
      ? 'Beauty shops your size frequently bundle category pairs like this.'
      : undefined;

  return { rationale: headline, metrics, similar_shops };
}
