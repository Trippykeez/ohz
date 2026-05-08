import type { DashboardSuggestion } from '../../lib/queries.ts';
import { OutcomeButtons } from './OutcomeButtons.tsx';
import { WhyThis } from './WhyThis.tsx';

export function BundleHeadline({ data }: { data: DashboardSuggestion }) {
  const { suggestion, products, why } = data;
  const briefHref = `/live-brief?shop=${encodeURIComponent(suggestion.shop_id)}&bundle=${encodeURIComponent(suggestion.id)}`;
  return (
    <div className="card headline">
      <div className="label">Today&apos;s bundle</div>
      <h2>{why.rationale}</h2>
      <div className="titles">
        {products.map(p => (
          <span key={p.id} className="chip">
            {p.title}
          </span>
        ))}
      </div>
      <WhyThis why={why} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <OutcomeButtons suggestionId={suggestion.id} initialStatus={data.outcome?.status ?? null} />
        <a className="btn primary" href={briefHref}>Open live brief →</a>
      </div>
    </div>
  );
}

export function HeadlineFallback({
  topProductTitle,
  totalOrders,
}: {
  topProductTitle?: string;
  totalOrders: number;
}) {
  return (
    <div className="card fallback">
      <div className="label" style={{ color: 'var(--text-dim)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
        Today&apos;s heartbeat
      </div>
      <h2>No high-confidence bundle today.</h2>
      <p>
        We&apos;re holding the headline slot rather than promoting a weaker suggestion.{' '}
        {topProductTitle
          ? `Your top performer this week is ${topProductTitle} — keep featuring it.`
          : `Once you have ~50+ orders of signal, daily bundle suggestions unlock.`}
      </p>
      <p style={{ fontSize: 13 }}>
        {totalOrders} orders observed in the last 90 days. Browse Worth Testing and Explore for
        directional patterns.
      </p>
    </div>
  );
}
