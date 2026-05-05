import type { DashboardData } from '../../lib/queries.ts';

export function OutcomesFeed({ items }: { items: DashboardData['recentOutcomes'] }) {
  if (items.length === 0) {
    return <div className="empty">No outcomes logged yet. Adopt or modify a suggestion to start training the ranker.</div>;
  }
  return (
    <ul className="outcomes-feed">
      {items.map(r => (
        <li key={`${r.suggestion_id}-${r.recorded_at}`}>
          <strong style={{ color: r.status === 'adopted' ? 'var(--good)' : r.status === 'modified' ? 'var(--info)' : 'var(--text-dim)' }}>
            {r.status}
          </strong>{' '}
          — {r.bundle_titles.join(' + ')} <span style={{ opacity: 0.6 }}>({timeAgo(r.recorded_at)})</span>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
