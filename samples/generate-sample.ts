// Generate a synthetic TikTok-Shop-shaped order export. Used to produce
// `samples/sample_orders.csv` for the import flow demo. Deterministic via a
// fixed seed so the committed CSV is stable.
//
// Usage: tsx samples/generate-sample.ts > samples/sample_orders.csv

import { mulberry32, pickWeighted, randInt } from '../src/lib/random.ts';

interface SeedSku {
  sku: string;
  name: string;
  price: number;
}

const SKUS: SeedSku[] = [
  { sku: 'LSH-MASCARA-01', name: 'Volume Mascara — Black',     price: 18 },
  { sku: 'LSH-LINER-02',   name: 'Magnetic Lash Liner',        price: 22 },
  { sku: 'LSH-LASH-03',    name: 'Magnetic Lashes — Wispy',    price: 26 },
  { sku: 'FCE-FOUND-01',   name: 'Demi Matte Foundation',      price: 34 },
  { sku: 'FCE-SPRAY-02',   name: 'Setting Spray — Dewy',       price: 24 },
  { sku: 'FCE-CONC-03',    name: 'Concealer — Light',          price: 21 },
  { sku: 'LIP-OIL-01',     name: 'Lip Oil — Cherry',           price: 15 },
  { sku: 'LIP-LINER-02',   name: 'Lip Liner — Nude',           price: 13 },
  { sku: 'CHK-BLUSH-01',   name: 'Cream Blush — Petal',        price: 18 },
  { sku: 'CHK-BRONZ-02',   name: 'Liquid Bronzer',             price: 20 },
  { sku: 'SKN-SERUM-01',   name: 'Glow Serum',                 price: 42 },
  { sku: 'SKN-MINI-02',    name: 'Mini Glow Drops',            price: 14 },
];

// Pairs (and one triple) that the engine should surface as bundles.
const TEMPLATES: { skus: string[]; weight: number }[] = [
  { skus: ['LSH-MASCARA-01', 'LSH-LINER-02'], weight: 12 },
  { skus: ['LSH-LINER-02', 'LSH-LASH-03'], weight: 8 },
  { skus: ['FCE-FOUND-01', 'FCE-SPRAY-02'], weight: 14 },
  { skus: ['FCE-FOUND-01', 'FCE-CONC-03'], weight: 6 },
  { skus: ['LIP-OIL-01', 'LIP-LINER-02'], weight: 8 },
  { skus: ['CHK-BLUSH-01', 'CHK-BRONZ-02'], weight: 9 },
  { skus: ['SKN-SERUM-01', 'SKN-MINI-02'], weight: 10 },
  { skus: ['LSH-MASCARA-01', 'LSH-LINER-02', 'FCE-SPRAY-02'], weight: 4 },
];

const ORDER_COUNT = 800;
const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;

function pad(n: number, len: number): string {
  return n.toString().padStart(len, '0');
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`;
}

function csvCell(s: string | number): string {
  const v = String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function main(): void {
  const rng = mulberry32(20260506);
  const now = Date.UTC(2026, 4, 6, 12, 0, 0); // 2026-05-06T12:00:00Z, deterministic
  const headers = [
    'Order ID',
    'Order Status',
    'Created Time',
    'Seller SKU',
    'Product Name',
    'Quantity',
    'SKU Unit Original Price',
  ];
  const lines: string[] = [headers.join(',')];

  const allSkus = SKUS.map(s => s.sku);
  const skuByCode = new Map(SKUS.map(s => [s.sku, s]));
  const soloWeights = SKUS.map(() => 1);

  for (let i = 0; i < ORDER_COUNT; i++) {
    const orderId = `TT${pad(i + 1, 6)}`;
    const orderedAt = now - Math.floor(rng() * NINETY_DAYS_MS);
    const status = rng() < 0.04 ? 'Cancelled' : 'Completed';

    const skus = new Set<string>();
    if (rng() < 0.7) {
      const tmpl = pickWeighted(rng, TEMPLATES, TEMPLATES.map(t => t.weight));
      for (const s of tmpl.skus) skus.add(s);
      if (rng() < 0.25) skus.add(pickWeighted(rng, allSkus, soloWeights));
    } else {
      const size = randInt(rng, 1, 3);
      for (let k = 0; k < size; k++) skus.add(pickWeighted(rng, allSkus, soloWeights));
    }

    for (const sku of skus) {
      const p = skuByCode.get(sku)!;
      const qty = rng() < 0.88 ? 1 : 2;
      lines.push(
        [
          csvCell(orderId),
          csvCell(status),
          csvCell(fmtTime(orderedAt)),
          csvCell(sku),
          csvCell(p.name),
          csvCell(qty),
          csvCell(p.price.toFixed(2)),
        ].join(','),
      );
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

main();
