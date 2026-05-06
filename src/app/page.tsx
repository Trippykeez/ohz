import { initSchema, getDb } from '../db/client.ts';
import { loadDashboard } from '../lib/queries.ts';
import { AlertBand } from './components/AlertBand.tsx';
import { BundleHeadline, HeadlineFallback } from './components/BundleHeadline.tsx';
import { SuggestionList } from './components/SuggestionList.tsx';
import { OutcomesFeed } from './components/OutcomesFeed.tsx';

export const dynamic = 'force-dynamic';

const DEMO_SHOP_ID = 'shop_demo_beauty';

interface ShopRow {
  id: string;
  name: string;
}

function listShops(): ShopRow[] {
  return getDb()
    .prepare(`SELECT id, name FROM shops ORDER BY connected_at DESC`)
    .all() as ShopRow[];
}

function resolveShopId(requested: string | undefined, shops: ShopRow[]): string | null {
  if (requested && shops.some(s => s.id === requested)) return requested;
  if (shops.some(s => s.id === DEMO_SHOP_ID)) return DEMO_SHOP_ID;
  return shops[0]?.id ?? null;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  initSchema();
  const params = await searchParams;
  const shops = listShops();
  const shopId = resolveShopId(params.shop, shops);

  if (!shopId) {
    return (
      <main className="container">
        <div className="topbar">
          <h1>ohz · Bundle Optimizer</h1>
          <span className="meta">No shop connected</span>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Bring your sales data</h2>
          <p>
            Import a TikTok Shop order export to start mining your bundle affinity.{' '}
            <a href="/import">Open the importer →</a>
          </p>
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            Or run <code>npm run db:reset</code> to seed the demo beauty shop.
          </p>
        </div>
      </main>
    );
  }

  const data = loadDashboard(shopId);
  if (!data.shop) {
    return (
      <main className="container">
        <div className="topbar">
          <h1>ohz · Bundle Optimizer</h1>
          <a className="meta" href="/import">Import sales data →</a>
        </div>
        <div className="card">
          <p>Shop not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="topbar">
        <h1>ohz · {data.shop.name}</h1>
        <span className="meta">
          {data.totalProducts} SKUs · {data.totalOrders90d} orders / 90d · vertical:{' '}
          {data.shop.vertical}
        </span>
      </div>

      {shops.length > 1 && (
        <div className="shop-switcher" style={{ marginBottom: 14 }}>
          <span>Shop:</span>
          {shops.map(s => (
            <a
              key={s.id}
              href={`/?shop=${encodeURIComponent(s.id)}`}
              style={{ fontWeight: s.id === shopId ? 700 : 400, color: s.id === shopId ? 'var(--text)' : undefined }}
            >
              {s.name}
            </a>
          ))}
          <a href="/import">+ import</a>
        </div>
      )}

      {shops.length <= 1 && (
        <div className="shop-switcher" style={{ marginBottom: 14 }}>
          <a href="/import">Import sales data →</a>
        </div>
      )}

      <AlertBand alerts={data.alerts} />

      {data.headline ? (
        <BundleHeadline data={data.headline} />
      ) : (
        <HeadlineFallback totalOrders={data.totalOrders90d} />
      )}

      <section className="section">
        <h3>Worth Testing — pre-live brief</h3>
        <SuggestionList
          items={data.worthTesting}
          emptyMessage="Nothing in the worth-testing tier today. Try the explore tab for directional patterns."
        />
      </section>

      <section className="section">
        <h3>Explore — experimental patterns</h3>
        <SuggestionList
          items={data.experimental}
          emptyMessage="No experimental candidates. The engine surfaces these as more orders land."
        />
      </section>

      <section className="section">
        <h3>Recent outcomes</h3>
        <OutcomesFeed items={data.recentOutcomes} />
      </section>
    </main>
  );
}
