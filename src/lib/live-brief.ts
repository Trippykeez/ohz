// Build the data for a pre-live brief: the one-screen plan a seller takes
// into a live show. Everything here is derived from data already in the DB —
// no new ingestion. We deliberately keep projections conservative and
// transparent so the brief can claim "$ lift" without overpromising.

import { getDb } from '../db/client.ts';
import { archetypeHeadline } from '../engine/archetypes.ts';
import type {
  BundleArchetype,
  ConfidenceTier,
  ProductRow,
  SuggestionRow,
  WhyThis,
} from './types.ts';

export interface LiveBriefBundle {
  suggestionId: string;
  archetype: BundleArchetype;
  tier: ConfidenceTier;
  products: ProductRow[];
  why: WhyThis;
  affinityLift: number;        // raw observed lift (e.g. 2.4)
  coOccurrences: number;
  support: number;
}

export interface InventoryReadiness {
  productId: string;
  title: string;
  stockQty: number;
  velocityPerDay: number;
  daysLeft: number | null;     // null when velocity unknown / zero
  status: 'ample' | 'watch' | 'critical' | 'untracked';
}

export interface LiveProjection {
  expectedLiveOrders: number;        // total bundle adoptions during a 1h live
  projectedUnits: number;            // total units of bundle members sold
  projectedRevenue: number;          // gross revenue $
  projectedMarginLift: number;       // $ margin above baseline solo sales
  baselineMargin: number;            // $ if items had sold solo at typical rate
  attachRate: number;                // 0..1, share of live orders that take the bundle
}

export interface OrderEvent {
  // The full timeline is precomputed server-side and replayed by the
  // ShowSimulator client component. Determinism makes the demo look the
  // same every time you show it.
  atSecond: number;
  buyerName: string;
  productTitle: string;
  qty: number;
  amount: number;             // $ for this single order
  isBundleHit: boolean;       // featured bundle vs walk-in solo
}

export interface LivePlan {
  durationSeconds: number;
  startingViewers: number;
  peakViewers: number;
  events: OrderEvent[];
  totalRevenue: number;
  totalBundleAdoptions: number;
}

export interface LiveBrief {
  shop: { id: string; name: string; vertical: string };
  bundle: LiveBriefBundle;
  backup: LiveBriefBundle | null;
  talkingPoints: string[];
  projection: LiveProjection;
  inventory: InventoryReadiness[];
  hasInventoryData: boolean;
  plan: LivePlan;
}

const DEFAULT_LIVE_DURATION_S = 30;            // simulator runtime
const ASSUMED_LIVE_ORDER_COUNT = 80;            // typical live show order count
const SIMULATED_ORDERS_PER_SHOW = 22;          // events emitted in the demo

const BUYER_NAMES = [
  'Aisha M.', 'Bianca R.', 'Carmen L.', 'Dae-shawn', 'Elena T.',
  'Faye K.', 'Gigi P.', 'Hannah V.', 'Imani S.', 'Jada B.',
  'Kayla R.', 'Leah O.', 'Maya C.', 'Nia W.', 'Olivia D.',
  'Paige H.', 'Quinn A.', 'Rosa F.', 'Sloane G.', 'Tyra J.',
  'Uma N.', 'Vera Z.', 'Willow E.', 'Xiomara', 'Yara I.', 'Zoe Q.',
];

export function loadLiveBrief(args: {
  shopId: string;
  suggestionId?: string;
}): LiveBrief | null {
  const db = getDb();
  const shop = db
    .prepare(`SELECT id, name, vertical FROM shops WHERE id = ?`)
    .get(args.shopId) as { id: string; name: string; vertical: string } | undefined;
  if (!shop) return null;

  const allSuggestions = db
    .prepare(`SELECT * FROM suggestions WHERE shop_id = ? ORDER BY score DESC`)
    .all(args.shopId) as SuggestionRow[];
  if (allSuggestions.length === 0) return null;

  const featured = args.suggestionId
    ? allSuggestions.find(s => s.id === args.suggestionId) ?? allSuggestions.find(s => s.is_headline === 1) ?? allSuggestions[0]
    : allSuggestions.find(s => s.is_headline === 1) ?? allSuggestions[0];

  const products = db
    .prepare(`SELECT * FROM products WHERE shop_id = ?`)
    .all(args.shopId) as ProductRow[];
  const productById = new Map(products.map(p => [p.id, p]));

  const itemRows = db
    .prepare(`SELECT suggestion_id, product_id FROM suggestion_items WHERE suggestion_id IN (${allSuggestions.map(() => '?').join(',')})`)
    .all(...allSuggestions.map(s => s.id)) as { suggestion_id: string; product_id: string }[];
  const itemsBySuggestion = new Map<string, string[]>();
  for (const r of itemRows) {
    const arr = itemsBySuggestion.get(r.suggestion_id) ?? [];
    arr.push(r.product_id);
    itemsBySuggestion.set(r.suggestion_id, arr);
  }

  const enrich = (s: SuggestionRow): LiveBriefBundle => {
    const ids = itemsBySuggestion.get(s.id) ?? [];
    const bundleProducts = ids.map(id => productById.get(id)).filter(Boolean) as ProductRow[];
    const why = JSON.parse(s.why_json) as WhyThis;
    // Recover the raw lift from the why-this (engine stores it in a
    // human-readable string). Falling back to inferring from support if not
    // present.
    const liftMatch = why.metrics.find(m => /lift/i.test(m.label))?.value.match(/([\d.]+)\s*x/i);
    const affinityLift = liftMatch ? Number(liftMatch[1]) : 1 + s.affinity_lift;
    return {
      suggestionId: s.id,
      archetype: s.archetype,
      tier: s.confidence_tier,
      products: bundleProducts,
      why,
      affinityLift,
      coOccurrences: s.co_occurrences,
      support: s.support,
    };
  };

  const featuredBundle = enrich(featured);

  const featuredIds = new Set(featuredBundle.products.map(p => p.id));
  const backupRow = allSuggestions.find(
    s =>
      s.id !== featured.id &&
      s.confidence_tier !== 'experimental' &&
      !(itemsBySuggestion.get(s.id) ?? []).some(id => featuredIds.has(id)),
  );
  const backup = backupRow ? enrich(backupRow) : null;

  const velocityByProduct = computeVelocity(args.shopId);

  const inventory = featuredBundle.products.map<InventoryReadiness>(p => {
    const v = velocityByProduct.get(p.id) ?? 0;
    if (p.stock_qty <= 0 && v === 0) {
      return {
        productId: p.id,
        title: p.title,
        stockQty: 0,
        velocityPerDay: 0,
        daysLeft: null,
        status: 'untracked',
      };
    }
    if (p.stock_qty <= 0) {
      return {
        productId: p.id,
        title: p.title,
        stockQty: 0,
        velocityPerDay: v,
        daysLeft: null,
        status: 'untracked',
      };
    }
    const daysLeft = v > 0 ? p.stock_qty / v : Infinity;
    let status: InventoryReadiness['status'] = 'ample';
    if (daysLeft < 3) status = 'critical';
    else if (daysLeft < 7) status = 'watch';
    return {
      productId: p.id,
      title: p.title,
      stockQty: p.stock_qty,
      velocityPerDay: v,
      daysLeft: isFinite(daysLeft) ? daysLeft : null,
      status,
    };
  });
  const hasInventoryData = inventory.some(r => r.status !== 'untracked');

  const projection = projectLiveLift(featuredBundle);
  const talkingPoints = generateTalkingPoints(featuredBundle, projection);
  const plan = planLiveShow(featuredBundle, products, projection, args.shopId);

  return {
    shop,
    bundle: featuredBundle,
    backup,
    talkingPoints,
    projection,
    inventory,
    hasInventoryData,
    plan,
  };
}

function computeVelocity(shopId: string): Map<string, number> {
  const db = getDb();
  const sevenDayStart = Date.now() - 7 * 24 * 3600 * 1000;
  const rows = db
    .prepare(
      `SELECT oi.product_id AS product_id, COUNT(*) AS n
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.shop_id = ? AND o.ordered_at >= ?
        GROUP BY oi.product_id`,
    )
    .all(shopId, sevenDayStart) as { product_id: string; n: number }[];
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.product_id, r.n / 7);
  return out;
}

function projectLiveLift(bundle: LiveBriefBundle): LiveProjection {
  const bundleRevenue = bundle.products.reduce((s, p) => s + p.unit_price, 0);
  const bundleMargin = bundle.products.reduce((s, p) => s + (p.unit_price - p.unit_cost), 0);

  // Attach rate scales with lift: bundles that are already co-purchased ~2x
  // above chance attach better when called out explicitly. Floor + ceiling
  // keep the projection sane on very low or very high lift values.
  const liftFactor = Math.max(1, Math.min(bundle.affinityLift, 4));
  const baseAttach = 0.08; // 8% of orders take a featured bundle on a typical live
  const attachRate = Math.min(0.45, baseAttach * liftFactor);

  const expectedLiveOrders = Math.round(ASSUMED_LIVE_ORDER_COUNT * attachRate);
  const projectedUnits = expectedLiveOrders * bundle.products.length;
  const projectedRevenue = expectedLiveOrders * bundleRevenue;

  // Conservative baseline: half of these orders would have happened anyway,
  // and only on the highest-margin item. Bundle lift = current margin minus
  // that baseline.
  const heroMargin = bundle.products.reduce(
    (m, p) => Math.max(m, p.unit_price - p.unit_cost),
    0,
  );
  const baselineMargin = expectedLiveOrders * 0.5 * heroMargin;
  const projectedMarginLift = expectedLiveOrders * bundleMargin - baselineMargin;

  return {
    expectedLiveOrders,
    projectedUnits,
    projectedRevenue,
    projectedMarginLift,
    baselineMargin,
    attachRate,
  };
}

function generateTalkingPoints(
  bundle: LiveBriefBundle,
  projection: LiveProjection,
): string[] {
  const titles = bundle.products.map(p => p.title);
  const [a, b, c] = titles;
  const liftPct = Math.round((bundle.affinityLift - 1) * 100);
  const headline = archetypeHeadline(bundle.archetype, bundle.products);

  const lines: string[] = [];
  lines.push(`Open: "${headline}."`);

  switch (bundle.archetype) {
    case 'complementary':
      lines.push(
        `Hook: "Y'all — if you're using ${a}, ${b} is the missing piece. I'll show you why in a sec."`,
      );
      break;
    case 'volume_pack':
      lines.push(
        `Hook: "Stock up moment — I'm bundling ${titles.join(' + ')} for one live only. Save when you grab the set."`,
      );
      break;
    case 'tier_up':
      lines.push(
        `Hook: "If you've been on the fence about ${a}, here's what comes when you grab it with ${b}. Way more value."`,
      );
      break;
    case 'discovery':
      lines.push(
        `Hook: "Y'all already love ${a}. Tonight I'm dropping ${b ?? 'the new one'} so you can try the new drop without committing."`,
      );
      break;
    case 'clearance_recovery':
      lines.push(
        `Hook: "Last call on ${a} — only a few left. Pairing it with ${b} for tonight's live."`,
      );
      break;
  }

  if (liftPct > 0) {
    lines.push(
      `Proof point: "${bundle.coOccurrences} of you already grabbed these together — they're co-purchased ${liftPct}% above what you'd expect by chance."`,
    );
  }

  if (c) {
    lines.push(
      `Upsell: "Add ${c} to round it out — that's the full routine."`,
    );
  }

  lines.push(
    `Call-to-action: "Drop a 🔥 in chat or type BUNDLE if you want one — I'll pin the link."`,
  );

  if (projection.expectedLiveOrders >= 8) {
    lines.push(
      `Urgency: "First ${Math.min(20, projection.expectedLiveOrders + 5)} orders ship tonight."`,
    );
  }

  return lines;
}

function planLiveShow(
  bundle: LiveBriefBundle,
  products: ProductRow[],
  projection: LiveProjection,
  shopId: string,
): LivePlan {
  const seed = hashString(shopId + bundle.suggestionId);
  const rng = mulberry32(seed);
  const events: OrderEvent[] = [];
  const dur = DEFAULT_LIVE_DURATION_S;

  // Bundle adoptions cluster near the middle of the live (peak attention).
  const totalEvents = SIMULATED_ORDERS_PER_SHOW;
  const bundleEvents = Math.max(
    3,
    Math.min(
      totalEvents - 4,
      Math.round(totalEvents * Math.min(0.6, projection.attachRate * 3)),
    ),
  );

  const bundleRevenue = bundle.products.reduce((s, p) => s + p.unit_price, 0);
  const bundleTitle = bundle.products.map(p => p.title).join(' + ');

  // Schedule bundle events with a beta-like distribution centered around 60%
  // of the show duration.
  for (let i = 0; i < bundleEvents; i++) {
    const t = clampSecond(beta(rng, 2.4, 1.6) * dur, dur);
    events.push({
      atSecond: t,
      buyerName: BUYER_NAMES[Math.floor(rng() * BUYER_NAMES.length)],
      productTitle: bundleTitle,
      qty: 1,
      amount: bundleRevenue,
      isBundleHit: true,
    });
  }

  // Walk-in solo orders for color — pick from the rest of the catalog with
  // some weight on cheaper items (typical live impulse buys).
  const otherProducts = products
    .filter(p => !bundle.products.some(bp => bp.id === p.id))
    .sort((a, b) => a.unit_price - b.unit_price);
  const soloEvents = totalEvents - bundleEvents;
  for (let i = 0; i < soloEvents; i++) {
    const t = clampSecond(rng() * dur, dur);
    const p = otherProducts[Math.floor(rng() * otherProducts.length)] ?? bundle.products[0];
    events.push({
      atSecond: t,
      buyerName: BUYER_NAMES[Math.floor(rng() * BUYER_NAMES.length)],
      productTitle: p.title,
      qty: 1,
      amount: p.unit_price,
      isBundleHit: false,
    });
  }

  events.sort((a, b) => a.atSecond - b.atSecond);

  const totalRevenue = events.reduce((s, e) => s + e.amount * e.qty, 0);
  const totalBundleAdoptions = events.filter(e => e.isBundleHit).length;

  return {
    durationSeconds: dur,
    startingViewers: 240 + Math.floor(rng() * 80),
    peakViewers: 380 + Math.floor(rng() * 220),
    events,
    totalRevenue,
    totalBundleAdoptions,
  };
}

function clampSecond(t: number, max: number): number {
  // Round to one decimal so animation timing feels organic without sub-frame noise.
  const v = Math.max(0.5, Math.min(max - 0.5, t));
  return Math.round(v * 10) / 10;
}

// Beta-ish: two uniform draws raised to alpha/beta gives a usable shape for
// our purposes without a full numerical implementation.
function beta(rng: () => number, alpha: number, betaP: number): number {
  const x = Math.pow(rng(), 1 / alpha);
  const y = Math.pow(rng(), 1 / betaP);
  return x / (x + y);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
