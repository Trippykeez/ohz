import { getDb } from '../db/client.ts';
import type {
  AlertRow,
  ProductRow,
  SuggestionRow,
  WhyThis,
} from './types.ts';

export interface DashboardSuggestion {
  suggestion: SuggestionRow;
  products: ProductRow[];
  why: WhyThis;
  outcome: { status: 'adopted' | 'ignored' | 'modified'; recorded_at: number } | null;
}

export interface DashboardData {
  shop: { id: string; name: string; vertical: string } | null;
  totalOrders90d: number;
  totalProducts: number;
  alerts: AlertRow[];
  headline: DashboardSuggestion | null;
  worthTesting: DashboardSuggestion[];
  experimental: DashboardSuggestion[];
  recentOutcomes: {
    suggestion_id: string;
    status: string;
    recorded_at: number;
    bundle_titles: string[];
  }[];
}

export function loadDashboard(shopId: string): DashboardData {
  const db = getDb();
  const shop = db
    .prepare(`SELECT id, name, vertical FROM shops WHERE id = ?`)
    .get(shopId) as DashboardData['shop'];
  if (!shop) {
    return {
      shop: null,
      totalOrders90d: 0,
      totalProducts: 0,
      alerts: [],
      headline: null,
      worthTesting: [],
      experimental: [],
      recentOutcomes: [],
    };
  }

  const ninetyDaysAgo = Date.now() - 90 * 24 * 3600 * 1000;
  const orderCount = (db
    .prepare(`SELECT COUNT(*) AS n FROM orders WHERE shop_id = ? AND ordered_at >= ?`)
    .get(shopId, ninetyDaysAgo) as { n: number }).n;
  const productCount = (db
    .prepare(`SELECT COUNT(*) AS n FROM products WHERE shop_id = ?`)
    .get(shopId) as { n: number }).n;

  const alerts = db
    .prepare(
      `SELECT * FROM alerts WHERE shop_id = ? AND dismissed_at IS NULL ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
         generated_at DESC`,
    )
    .all(shopId) as AlertRow[];

  const suggestions = db
    .prepare(`SELECT * FROM suggestions WHERE shop_id = ? ORDER BY score DESC`)
    .all(shopId) as SuggestionRow[];

  const productsByShop = db
    .prepare(`SELECT * FROM products WHERE shop_id = ?`)
    .all(shopId) as ProductRow[];
  const productById = new Map(productsByShop.map(p => [p.id, p]));

  const itemRows = suggestions.length
    ? (db
        .prepare(
          `SELECT suggestion_id, product_id FROM suggestion_items WHERE suggestion_id IN (${suggestions
            .map(() => '?')
            .join(',')})`,
        )
        .all(...suggestions.map(s => s.id)) as { suggestion_id: string; product_id: string }[])
    : [];
  const itemsBySuggestion = new Map<string, string[]>();
  for (const r of itemRows) {
    const arr = itemsBySuggestion.get(r.suggestion_id) ?? [];
    arr.push(r.product_id);
    itemsBySuggestion.set(r.suggestion_id, arr);
  }

  const outcomeRows = suggestions.length
    ? (db
        .prepare(
          `SELECT o1.* FROM suggestion_outcomes o1
             JOIN (SELECT suggestion_id, MAX(recorded_at) AS m FROM suggestion_outcomes GROUP BY suggestion_id) o2
             ON o1.suggestion_id = o2.suggestion_id AND o1.recorded_at = o2.m
            WHERE o1.suggestion_id IN (${suggestions.map(() => '?').join(',')})`,
        )
        .all(...suggestions.map(s => s.id)) as { suggestion_id: string; status: 'adopted' | 'ignored' | 'modified'; recorded_at: number }[])
    : [];
  const outcomeBySuggestion = new Map(outcomeRows.map(r => [r.suggestion_id, r]));

  const enrich = (s: SuggestionRow): DashboardSuggestion => {
    const ids = itemsBySuggestion.get(s.id) ?? [];
    const products = ids.map(id => productById.get(id)).filter(Boolean) as ProductRow[];
    const why = JSON.parse(s.why_json) as WhyThis;
    const outcome = outcomeBySuggestion.get(s.id) ?? null;
    return { suggestion: s, products, why, outcome: outcome ? { status: outcome.status, recorded_at: outcome.recorded_at } : null };
  };

  const headlineRow = suggestions.find(s => s.is_headline === 1) ?? null;
  const headline = headlineRow ? enrich(headlineRow) : null;
  const worthTesting = suggestions
    .filter(s => s.confidence_tier === 'worth_testing' && s.id !== headlineRow?.id)
    .map(enrich);
  const experimental = suggestions
    .filter(s => s.confidence_tier === 'experimental')
    .map(enrich);

  // recent outcomes feed (last 10 across the shop)
  const recentRaw = db
    .prepare(
      `SELECT o.suggestion_id, o.status, o.recorded_at
         FROM suggestion_outcomes o
         JOIN suggestions s ON s.id = o.suggestion_id
        WHERE s.shop_id = ?
        ORDER BY o.recorded_at DESC LIMIT 10`,
    )
    .all(shopId) as { suggestion_id: string; status: string; recorded_at: number }[];
  const recentOutcomes = recentRaw.map(r => ({
    ...r,
    bundle_titles: (itemsBySuggestion.get(r.suggestion_id) ?? [])
      .map(id => productById.get(id)?.title ?? '')
      .filter(Boolean),
  }));

  return {
    shop,
    totalOrders90d: orderCount,
    totalProducts: productCount,
    alerts,
    headline,
    worthTesting,
    experimental,
    recentOutcomes,
  };
}
