import type { AlertRow } from '../../lib/types.ts';

export function AlertBand({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="alert-band" aria-label="Active alerts">
      {alerts.map(a => (
        <div key={a.id} className={`alert ${a.severity}`}>
          <span className="pill">{a.kind.replace(/_/g, ' ')}</span>
          <div>
            <div className="title">{a.title}</div>
            <div className="body">{a.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
