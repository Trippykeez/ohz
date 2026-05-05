import { initSchema } from '../db/client.ts';
import { loadDashboard } from '../lib/queries.ts';
import { AlertBand } from './components/AlertBand.tsx';
import { BundleHeadline, HeadlineFallback } from './components/BundleHeadline.tsx';
import { SuggestionList } from './components/SuggestionList.tsx';
import { OutcomesFeed } from './components/OutcomesFeed.tsx';

export const dynamic = 'force-dynamic';

const SHOP_ID = 'shop_demo_beauty';

export default function Page() {
  initSchema();
  const data = loadDashboard(SHOP_ID);

  if (!data.shop) {
    return (
      <main className="container">
        <div className="topbar">
          <h1>ohz · Bundle Optimizer</h1>
          <span className="meta">No shop connected</span>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Connect a TikTok Shop to begin</h2>
          <p>
            For the MVP, run <code>npm run db:reset</code> then <code>npm run engine:run</code> to
            seed the demo beauty shop and generate suggestions. Real OAuth + Partner API ingestion
            replaces this onboarding step in v1.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="topbar">
        <h1>ohz · {data.shop.name}</h1>
        <span className="meta">
          {data.totalProducts} SKUs · {data.totalOrders90d} orders / 90d · vertical: {data.shop.vertical}
        </span>
      </div>

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
