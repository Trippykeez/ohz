// Persist parsed TikTok Shop order rows into the schema the engine reads.
//
// What we have from a sales export: order timestamps, SKU, product name,
// quantity, unit price.
//
// What we don't have: per-SKU cost, on-hand stock, age-in-stock, trend
// signal. Cost is derived from a user-supplied gross-margin assumption
// (cost = price * (1 - margin_pct)). Stock and trend default to neutral
// values so those terms in the score function don't bias the ranking; the
// engine still produces real affinity_lift and margin_uplift, which are
// the wedge for v1.
//
// Re-importing for the same shop name is a clean replace: orders, items,
// products, suggestions, and alerts for that shop are wiped before the
// new rows land. Outcomes are kept (they reference suggestion ids that
// no longer exist after a regenerate, but they live independently for the
// future learning-to-rank model).

import { getDb, initSchema } from '../db/client.ts';
import type { ParsedOrderRow } from './parser.ts';

export interface ImportOptions {
  shopName: string;
  vertical: string;
  marginPct: number;       // 0..1; cost = price * (1 - marginPct)
  replaceExisting?: boolean; // default true
}

export interface ImportSummary {
  shopId: string;
  productCount: number;
  orderCount: number;
  itemCount: number;
  ordersSkippedCancelled: number;
  windowStart: number | null;
  windowEnd: number | null;
}

const CANCELLED_STATUS_RE = /(cancel|refund|return|void|fail)/i;

export function slugifyShopId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `shop_${slug || 'unnamed'}`;
}

export function importParsedRows(
  rows: ParsedOrderRow[],
  opts: ImportOptions,
): ImportSummary {
  initSchema();
  const db = getDb();
  const now = Date.now();
  const shopId = slugifyShopId(opts.shopName);
  const margin = Math.max(0, Math.min(opts.marginPct, 0.95));
  const replaceExisting = opts.replaceExisting !== false;

  // Group rows into orders, dropping cancelled/refunded ones.
  type OrderAgg = {
    id: string;
    orderedAt: number;
    items: Map<string, { qty: number; unitPrice: number; productName: string }>;
    cancelled: boolean;
  };
  const orders = new Map<string, OrderAgg>();
  for (const row of rows) {
    const cancelled = CANCELLED_STATUS_RE.test(row.status);
    let agg = orders.get(row.orderId);
    if (!agg) {
      agg = { id: row.orderId, orderedAt: row.orderedAt, items: new Map(), cancelled };
      orders.set(row.orderId, agg);
    }
    if (cancelled) agg.cancelled = true;
    // Use earliest timestamp seen for this order.
    if (row.orderedAt < agg.orderedAt) agg.orderedAt = row.orderedAt;
    const existing = agg.items.get(row.sku);
    if (existing) {
      existing.qty += row.qty;
    } else {
      agg.items.set(row.sku, {
        qty: row.qty,
        unitPrice: row.unitPrice,
        productName: row.productName,
      });
    }
  }

  let ordersSkippedCancelled = 0;
  const liveOrders: OrderAgg[] = [];
  for (const o of orders.values()) {
    if (o.cancelled) ordersSkippedCancelled++;
    else if (o.items.size > 0) liveOrders.push(o);
  }

  // Build per-SKU product info from accepted line items. Latest-observed
  // unit price wins (a seller's pricing today is more useful than a price
  // they used 60 days ago). Title is taken from the most recent occurrence
  // as well.
  type ProductAgg = {
    sku: string;
    title: string;
    latestPrice: number;
    latestSeenAt: number;
    earliestSeenAt: number;
  };
  const productAggs = new Map<string, ProductAgg>();
  for (const o of liveOrders) {
    for (const [sku, line] of o.items) {
      const cur = productAggs.get(sku);
      if (!cur) {
        productAggs.set(sku, {
          sku,
          title: line.productName,
          latestPrice: line.unitPrice,
          latestSeenAt: o.orderedAt,
          earliestSeenAt: o.orderedAt,
        });
        continue;
      }
      if (o.orderedAt > cur.latestSeenAt) {
        cur.latestSeenAt = o.orderedAt;
        cur.latestPrice = line.unitPrice;
        cur.title = line.productName;
      }
      if (o.orderedAt < cur.earliestSeenAt) cur.earliestSeenAt = o.orderedAt;
    }
  }

  let windowStart: number | null = null;
  let windowEnd: number | null = null;
  for (const o of liveOrders) {
    if (windowStart === null || o.orderedAt < windowStart) windowStart = o.orderedAt;
    if (windowEnd === null || o.orderedAt > windowEnd) windowEnd = o.orderedAt;
  }

  const productIdBySku = new Map<string, string>();
  for (const sku of productAggs.keys()) {
    productIdBySku.set(sku, `prod_${shopId}_${hashKey(sku)}`);
  }

  let itemCount = 0;
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO shops (id, name, vertical, connected_at) VALUES (?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, vertical = excluded.vertical`,
    ).run(shopId, opts.shopName, opts.vertical, now);

    if (replaceExisting) {
      // Wipe prior data for this shop. Outcomes are independent of suggestion
      // existence, so they survive — see comment at the top of the file.
      db.prepare(
        `DELETE FROM suggestion_items WHERE suggestion_id IN (SELECT id FROM suggestions WHERE shop_id = ?)`,
      ).run(shopId);
      db.prepare(`DELETE FROM suggestions WHERE shop_id = ?`).run(shopId);
      db.prepare(`DELETE FROM alerts WHERE shop_id = ?`).run(shopId);
      db.prepare(
        `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = ?)`,
      ).run(shopId);
      db.prepare(`DELETE FROM orders WHERE shop_id = ?`).run(shopId);
      db.prepare(`DELETE FROM products WHERE shop_id = ?`).run(shopId);
    }

    const insertProduct = db.prepare(`
      INSERT INTO products
        (id, shop_id, sku, title, category, unit_price, unit_cost, stock_qty, days_in_stock, trend_score, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const p of productAggs.values()) {
      const id = productIdBySku.get(p.sku)!;
      const cost = round2(p.latestPrice * (1 - margin));
      // No real stock or trend signal in a sales-only export — keep them
      // neutral so the engine ranks on affinity + margin alone.
      insertProduct.run(
        id,
        shopId,
        p.sku,
        p.title,
        'uncategorized',
        round2(p.latestPrice),
        cost,
        0,
        30,
        0,
        now,
      );
    }

    const insertOrder = db.prepare(
      `INSERT INTO orders (id, shop_id, ordered_at, total) VALUES (?,?,?,?)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, qty, unit_price, unit_cost) VALUES (?,?,?,?,?)`,
    );
    for (const o of liveOrders) {
      let total = 0;
      for (const line of o.items.values()) total += line.unitPrice * line.qty;
      // Order ids in the export can collide with ids from a previous shop —
      // namespace them so foreign keys to `orders` stay shop-scoped.
      const orderId = `${shopId}__${o.id}`;
      insertOrder.run(orderId, shopId, o.orderedAt, round2(total));
      for (const [sku, line] of o.items) {
        const productId = productIdBySku.get(sku)!;
        const unitCost = round2(line.unitPrice * (1 - margin));
        insertItem.run(orderId, productId, line.qty, round2(line.unitPrice), unitCost);
        itemCount++;
      }
    }
  });
  tx();

  return {
    shopId,
    productCount: productAggs.size,
    orderCount: liveOrders.length,
    itemCount,
    ordersSkippedCancelled,
    windowStart,
    windowEnd,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Stable, short hash for SKU → product id. djb2; collisions in the same shop
// are extremely unlikely at SKU-set sizes we care about (<10k).
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
