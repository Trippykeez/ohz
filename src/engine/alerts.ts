import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.ts';
import type { ProductRow } from '../lib/types.ts';

// The alert band sits above the bundle headline. CLAUDE.md: empty 95% of
// days. Generate alerts only on real signals, never to fill space.

export interface AlertCandidate {
  kind: 'stockout_risk' | 'price_war' | 'trend_window' | 'bundle_decay';
  severity: 'info' | 'warn' | 'critical';
  title: string;
  body: string;
  product_id: string | null;
}

export function generateAlerts(opts: {
  shopId: string;
  products: ProductRow[];
  headlineProductIds: string[];
  velocityByProduct: Map<string, number>; // orders/day on rolling 7-day window
}): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const headlineSet = new Set(opts.headlineProductIds);

  for (const p of opts.products) {
    // Stockout risk on a featured bundle member: stock will run out within
    // ~4 days at current velocity.
    if (headlineSet.has(p.id)) {
      const v = opts.velocityByProduct.get(p.id) ?? 0;
      if (v > 0 && p.stock_qty / v < 4) {
        out.push({
          kind: 'stockout_risk',
          severity: 'critical',
          title: `Stockout risk on ${p.title}`,
          body: `Only ~${Math.round(p.stock_qty / Math.max(v, 0.1))} days of stock left at current pace. Restock or swap the bundle before your next live.`,
          product_id: p.id,
        });
      }
    }

    // Trend window: an item is heating up AND we have stock to ride it.
    if (p.trend_score >= 0.75 && p.stock_qty >= 50) {
      out.push({
        kind: 'trend_window',
        severity: 'info',
        title: `${p.title} is trending`,
        body: `Trend score ${p.trend_score.toFixed(2)} on Creative Center. You have ${p.stock_qty} units — push it in this week's lives.`,
        product_id: p.id,
      });
    }
  }

  return out;
}

export function persistAlerts(shopId: string, alerts: AlertCandidate[]): void {
  const db = getDb();
  const now = Date.now();
  // Replace today's alerts so the band reflects current state.
  db.prepare(`UPDATE alerts SET dismissed_at = ? WHERE shop_id = ? AND dismissed_at IS NULL`).run(now, shopId);
  const insert = db.prepare(`
    INSERT INTO alerts (id, shop_id, kind, severity, title, body, product_id, generated_at)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const tx = db.transaction(() => {
    for (const a of alerts) {
      insert.run(randomUUID(), shopId, a.kind, a.severity, a.title, a.body, a.product_id, now);
    }
  });
  tx();
}
