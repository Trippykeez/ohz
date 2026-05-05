import { randomUUID } from 'node:crypto';
import { getDb, initSchema } from './client.ts';
import { mulberry32, pickWeighted, randInt } from '../lib/random.ts';

// Demo beauty shop loosely inspired by the reference customer profile.
// 50 SKUs across complementary categories, 90 days of orders, baked-in
// affinity patterns so the engine surfaces a believable mix of bundle
// archetypes.

const SHOP_ID = 'shop_demo_beauty';
const SHOP_NAME = 'Demo Beauty Co';
const VERTICAL = 'beauty';

interface SeedProduct {
  sku: string;
  title: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  age: number;
  trend: number;
}

const PRODUCTS: SeedProduct[] = [
  // Lashes
  { sku: 'LSH-001', title: 'Volume Mascara — Black',     category: 'lashes',  price: 18, cost: 4,  stock: 220, age: 30,  trend: 0.2 },
  { sku: 'LSH-002', title: 'Magnetic Lash Liner',        category: 'lashes',  price: 22, cost: 6,  stock: 140, age: 18,  trend: 0.55 },
  { sku: 'LSH-003', title: 'Magnetic Lashes — Wispy',    category: 'lashes',  price: 26, cost: 8,  stock: 90,  age: 15,  trend: 0.7 },
  { sku: 'LSH-004', title: 'Lash Curler',                category: 'tools',   price: 12, cost: 3,  stock: 60,  age: 60,  trend: 0.1 },
  { sku: 'LSH-005', title: 'Lash Serum — Boost',         category: 'lashes',  price: 32, cost: 7,  stock: 75,  age: 22,  trend: 0.4 },
  // Brows
  { sku: 'BRW-001', title: 'Brow Pomade — Soft Brown',   category: 'brows',   price: 19, cost: 5,  stock: 110, age: 25,  trend: 0.3 },
  { sku: 'BRW-002', title: 'Micro Brow Pencil',          category: 'brows',   price: 16, cost: 4,  stock: 130, age: 25,  trend: 0.25 },
  { sku: 'BRW-003', title: 'Brow Gel — Clear',           category: 'brows',   price: 14, cost: 3,  stock: 95,  age: 30,  trend: 0.15 },
  { sku: 'BRW-004', title: 'Brow Lamination Kit',        category: 'brows',   price: 38, cost: 11, stock: 40,  age: 12,  trend: 0.6 },
  // Lips
  { sku: 'LIP-001', title: 'Lip Oil — Cherry',           category: 'lips',    price: 15, cost: 3,  stock: 180, age: 14,  trend: 0.65 },
  { sku: 'LIP-002', title: 'Lip Oil — Peach',            category: 'lips',    price: 15, cost: 3,  stock: 160, age: 14,  trend: 0.6 },
  { sku: 'LIP-003', title: 'Lip Liner — Nude',           category: 'lips',    price: 13, cost: 3,  stock: 140, age: 35,  trend: 0.2 },
  { sku: 'LIP-004', title: 'Lip Liner — Rose',           category: 'lips',    price: 13, cost: 3,  stock: 130, age: 35,  trend: 0.2 },
  { sku: 'LIP-005', title: 'Plumping Gloss',             category: 'lips',    price: 17, cost: 4,  stock: 70,  age: 16,  trend: 0.45 },
  { sku: 'LIP-006', title: 'Matte Liquid Lip — Brick',   category: 'lips',    price: 16, cost: 4,  stock: 85,  age: 40,  trend: 0.1 },
  { sku: 'LIP-007', title: 'Tinted Lip Balm',            category: 'lips',    price: 11, cost: 2,  stock: 200, age: 25,  trend: 0.3 },
  // Face base
  { sku: 'FCE-001', title: 'Demi Matte Foundation',      category: 'face',    price: 34, cost: 9,  stock: 150, age: 22,  trend: 0.35 },
  { sku: 'FCE-002', title: 'Setting Spray — Dewy',       category: 'face',    price: 24, cost: 6,  stock: 120, age: 22,  trend: 0.3 },
  { sku: 'FCE-003', title: 'Concealer — Light',          category: 'face',    price: 21, cost: 5,  stock: 95,  age: 20,  trend: 0.2 },
  { sku: 'FCE-004', title: 'Concealer — Medium',         category: 'face',    price: 21, cost: 5,  stock: 90,  age: 20,  trend: 0.2 },
  { sku: 'FCE-005', title: 'Pressed Powder',             category: 'face',    price: 22, cost: 6,  stock: 70,  age: 50,  trend: 0.1 },
  { sku: 'FCE-006', title: 'Skin Tint — Glow',           category: 'face',    price: 28, cost: 7,  stock: 80,  age: 12,  trend: 0.55 },
  // Cheek
  { sku: 'CHK-001', title: 'Cream Blush — Petal',        category: 'cheek',   price: 18, cost: 4,  stock: 110, age: 18,  trend: 0.5 },
  { sku: 'CHK-002', title: 'Cream Blush — Coral',        category: 'cheek',   price: 18, cost: 4,  stock: 100, age: 18,  trend: 0.5 },
  { sku: 'CHK-003', title: 'Liquid Bronzer',             category: 'cheek',   price: 20, cost: 5,  stock: 95,  age: 15,  trend: 0.5 },
  { sku: 'CHK-004', title: 'Cream Highlighter',          category: 'cheek',   price: 19, cost: 5,  stock: 80,  age: 28,  trend: 0.3 },
  { sku: 'CHK-005', title: 'Powder Blush — Mauve',       category: 'cheek',   price: 17, cost: 4,  stock: 65,  age: 55,  trend: 0.05 },
  // Skin / hero
  { sku: 'SKN-001', title: 'Glow Serum',                 category: 'skin',    price: 42, cost: 10, stock: 130, age: 8,   trend: 0.85 },
  { sku: 'SKN-002', title: 'Mini Glow Drops',            category: 'skin',    price: 14, cost: 3,  stock: 220, age: 6,   trend: 0.6 },
  { sku: 'SKN-003', title: 'Hydrating Toner',            category: 'skin',    price: 26, cost: 6,  stock: 90,  age: 25,  trend: 0.3 },
  { sku: 'SKN-004', title: 'Niacinamide Booster',        category: 'skin',    price: 28, cost: 7,  stock: 85,  age: 20,  trend: 0.4 },
  { sku: 'SKN-005', title: 'Eye Cream — Cooling',        category: 'skin',    price: 32, cost: 8,  stock: 70,  age: 35,  trend: 0.25 },
  // Tools
  { sku: 'TLS-001', title: 'Face Brush Set — 8pc',       category: 'tools',   price: 38, cost: 10, stock: 55,  age: 30,  trend: 0.3 },
  { sku: 'TLS-002', title: 'Pro Travel Bag',             category: 'tools',   price: 24, cost: 6,  stock: 45,  age: 30,  trend: 0.2 },
  { sku: 'TLS-003', title: 'Beauty Sponge Duo',          category: 'tools',   price: 12, cost: 2,  stock: 160, age: 20,  trend: 0.25 },
  { sku: 'TLS-004', title: 'Mini Brush Trio',            category: 'tools',   price: 16, cost: 3,  stock: 90,  age: 18,  trend: 0.3 },
  // Slow movers / clearance candidates
  { sku: 'EYE-001', title: 'Eyeshadow Quad — Sunset',    category: 'eyes',    price: 22, cost: 6,  stock: 180, age: 95,  trend: 0.05 },
  { sku: 'EYE-002', title: 'Eyeshadow Quad — Smoky',     category: 'eyes',    price: 22, cost: 6,  stock: 160, age: 95,  trend: 0.05 },
  { sku: 'EYE-003', title: 'Glitter Liner — Gold',       category: 'eyes',    price: 14, cost: 3,  stock: 140, age: 80,  trend: 0.1 },
  { sku: 'EYE-004', title: 'Pencil Liner — Black',       category: 'eyes',    price: 12, cost: 3,  stock: 110, age: 35,  trend: 0.2 },
  // Sets
  { sku: 'SET-001', title: 'Everyday Glam Set',          category: 'sets',    price: 64, cost: 22, stock: 30,  age: 14,  trend: 0.4 },
  { sku: 'SET-002', title: 'Brow Builder Kit',           category: 'sets',    price: 48, cost: 17, stock: 25,  age: 14,  trend: 0.35 },
  { sku: 'SET-003', title: 'Lip Lover Trio',             category: 'sets',    price: 36, cost: 12, stock: 40,  age: 18,  trend: 0.5 },
  // Misc fillers
  { sku: 'NLS-001', title: 'Press-On Nails — Almond',    category: 'nails',   price: 14, cost: 3,  stock: 90,  age: 20,  trend: 0.4 },
  { sku: 'NLS-002', title: 'Nail Glue Pro',              category: 'nails',   price: 8,  cost: 2,  stock: 130, age: 25,  trend: 0.2 },
  { sku: 'FRG-001', title: 'Body Mist — Vanilla',        category: 'fragrance', price: 22, cost: 5, stock: 70, age: 40,  trend: 0.15 },
  { sku: 'FRG-002', title: 'Body Mist — Coconut',        category: 'fragrance', price: 22, cost: 5, stock: 60, age: 40,  trend: 0.15 },
  { sku: 'BTH-001', title: 'Body Scrub — Sugar',         category: 'body',    price: 24, cost: 6,  stock: 55,  age: 45,  trend: 0.1 },
  { sku: 'BTH-002', title: 'Body Butter — Shea',         category: 'body',    price: 26, cost: 6,  stock: 50,  age: 45,  trend: 0.1 },
];

// Affinity templates: items that tend to be co-purchased. Each template lists
// member SKUs and a co-purchase weight. Some baskets draw from a template,
// others are random — so the engine sees realistic noise.
const AFFINITY_TEMPLATES: { skus: string[]; weight: number; basketSize?: [number, number] }[] = [
  { skus: ['LSH-001', 'LSH-002'], weight: 9 },                          // mascara + lash liner
  { skus: ['LSH-002', 'LSH-003'], weight: 7 },                          // lash liner + magnetic lashes
  { skus: ['BRW-001', 'BRW-002', 'BRW-003'], weight: 6 },               // brow trio
  { skus: ['LIP-001', 'LIP-003'], weight: 6 },                          // lip oil + nude liner
  { skus: ['LIP-002', 'LIP-004'], weight: 5 },                          // peach oil + rose liner
  { skus: ['FCE-001', 'FCE-002'], weight: 11 },                         // foundation + setting spray (strong)
  { skus: ['FCE-001', 'FCE-003'], weight: 4 },                          // foundation + concealer light
  { skus: ['FCE-001', 'FCE-004'], weight: 4 },                          // foundation + concealer medium
  { skus: ['CHK-001', 'CHK-003'], weight: 6 },                          // blush + bronzer
  { skus: ['CHK-002', 'CHK-003'], weight: 5 },                          // coral blush + bronzer
  { skus: ['TLS-001', 'TLS-002'], weight: 4 },                          // brush set + travel bag (tier-up)
  { skus: ['SKN-001', 'SKN-002'], weight: 7 },                          // hero serum + sample (discovery)
  { skus: ['SKN-001', 'EYE-001'], weight: 3 },                          // hot SKU drags clearance quad
  { skus: ['NLS-001', 'NLS-002'], weight: 8 },                          // press-ons + glue
  { skus: ['LSH-001', 'LSH-002', 'FCE-002'], weight: 3 },               // triple
  { skus: ['BRW-001', 'BRW-002'], weight: 8 },                          // brow pomade + pencil
];

export function seed(opts: { reset?: boolean } = {}): { shopId: string; productCount: number; orderCount: number } {
  initSchema();
  const db = getDb();

  if (opts.reset) {
    db.exec(`
      DELETE FROM suggestion_outcomes;
      DELETE FROM suggestion_items;
      DELETE FROM suggestions;
      DELETE FROM alerts;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM products;
      DELETE FROM shops;
    `);
  }

  const now = Date.now();
  const insertShop = db.prepare(`INSERT OR REPLACE INTO shops (id,name,vertical,connected_at) VALUES (?,?,?,?)`);
  insertShop.run(SHOP_ID, SHOP_NAME, VERTICAL, now);

  const insertProduct = db.prepare(`
    INSERT OR REPLACE INTO products
      (id, shop_id, sku, title, category, unit_price, unit_cost, stock_qty, days_in_stock, trend_score, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  const productIdBySku = new Map<string, string>();
  for (const p of PRODUCTS) {
    const id = `prod_${p.sku.toLowerCase().replace(/-/g, '_')}`;
    productIdBySku.set(p.sku, id);
    insertProduct.run(id, SHOP_ID, p.sku, p.title, p.category, p.price, p.cost, p.stock, p.age, p.trend, now);
  }

  const insertOrder = db.prepare(`INSERT INTO orders (id,shop_id,ordered_at,total) VALUES (?,?,?,?)`);
  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id,product_id,qty,unit_price,unit_cost) VALUES (?,?,?,?,?)
  `);

  const rng = mulberry32(20260505);
  const allProductSkus = PRODUCTS.map(p => p.sku);
  const productSoloWeight = PRODUCTS.map(p => 1 + p.trend * 3); // trendy SKUs are bought more
  const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;
  const ORDER_COUNT = 720;

  const tx = db.transaction(() => {
    for (let i = 0; i < ORDER_COUNT; i++) {
      const orderId = `ord_${i.toString().padStart(5, '0')}`;
      const orderedAt = now - Math.floor(rng() * NINETY_DAYS_MS);

      // 60% template-driven baskets, 40% random
      const useTemplate = rng() < 0.6;
      const skus = new Set<string>();

      if (useTemplate) {
        const template = pickWeighted(rng, AFFINITY_TEMPLATES, AFFINITY_TEMPLATES.map(t => t.weight));
        for (const sku of template.skus) skus.add(sku);
        // 40% of template baskets pick up one extra random item
        if (rng() < 0.4) skus.add(pickWeighted(rng, allProductSkus, productSoloWeight));
      } else {
        const size = randInt(rng, 1, 3);
        for (let k = 0; k < size; k++) {
          skus.add(pickWeighted(rng, allProductSkus, productSoloWeight));
        }
      }

      let total = 0;
      const items: { sku: string; qty: number; price: number; cost: number }[] = [];
      for (const sku of skus) {
        const p = PRODUCTS.find(x => x.sku === sku)!;
        const qty = rng() < 0.85 ? 1 : 2;
        total += p.price * qty;
        items.push({ sku, qty, price: p.price, cost: p.cost });
      }
      insertOrder.run(orderId, SHOP_ID, orderedAt, total);
      for (const it of items) {
        insertItem.run(orderId, productIdBySku.get(it.sku)!, it.qty, it.price, it.cost);
      }
    }
  });
  tx();

  return { shopId: SHOP_ID, productCount: PRODUCTS.length, orderCount: ORDER_COUNT };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const result = seed({ reset: true });
  console.log(`seeded shop=${result.shopId} products=${result.productCount} orders=${result.orderCount}`);
}
