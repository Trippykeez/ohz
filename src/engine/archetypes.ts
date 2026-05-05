import type { BundleArchetype, ProductRow } from '../lib/types.ts';

// Archetype detection drives UX framing — a complementary bundle and a
// clearance recovery suggestion need different headlines, even at the same
// score. Heuristic v1; revisit when sellers start labeling outcomes.

export function detectArchetype(products: ProductRow[]): BundleArchetype {
  if (products.length < 2) return 'complementary';

  const skus = new Set(products.map(p => p.sku));
  const categories = new Set(products.map(p => p.category));

  // Volume pack: same SKU repeated (n/a in our schema since orders dedupe by
  // product_id) — fall through unless titles indicate "duo / trio / pack".
  const titleBlob = products.map(p => p.title.toLowerCase()).join(' ');
  if (/\b(duo|trio|pack|bundle|set)\b/.test(titleBlob) && categories.size === 1) return 'volume_pack';

  // Discovery: a hero (highest priced or trendiest) paired with a clearly
  // smaller / sample-shaped item. Check this before clearance recovery so a
  // "Mini …" sample paired with its hero gets the right framing even if the
  // sample SKU is overstocked.
  const sortedByPrice = [...products].sort((a, b) => b.unit_price - a.unit_price);
  const hero = sortedByPrice[0];
  const others = sortedByPrice.slice(1);
  const hasSampleByName = others.some(p => /\b(mini|sample|travel|trial)\b/i.test(p.title));
  const hasSampleByPrice = others.some(p => p.unit_price <= hero.unit_price * 0.5);
  if ((hasSampleByName || hasSampleByPrice) && hero.trend_score >= 0.5) return 'discovery';

  // Clearance recovery: at least one member is aging hard (60+ days) paired
  // with a trending item. Stock-only signal isn't enough — a fresh SKU with
  // high stock is just inventory, not dead stock.
  const hasDead = products.some(p => p.days_in_stock >= 60);
  const hasHot = products.some(p => p.trend_score >= 0.6);
  if (hasDead && hasHot) return 'clearance_recovery';

  // Tier-up: a higher-priced "pro / kit / set" alongside a base item in the
  // same category family.
  if (/\b(pro|kit|set|premium|deluxe)\b/i.test(hero.title)) return 'tier_up';

  // Default: complementary across categories.
  return 'complementary';
}

export function archetypeHeadline(archetype: BundleArchetype, products: ProductRow[]): string {
  const titles = products.map(p => p.title).join(' + ');
  switch (archetype) {
    case 'complementary':
      return `Feature ${titles} together in your next live`;
    case 'volume_pack':
      return `Bundle ${titles} as a value pack — buyers are already grouping these`;
    case 'tier_up':
      return `Upsell ${titles} — pair the hero with the kit`;
    case 'discovery':
      return `Drop ${titles} — let the hero carry the new SKU`;
    case 'clearance_recovery':
      return `Pair ${titles} — move stagnant stock alongside a hot seller`;
  }
}
