import type { WhyThis as WhyThisData } from '../../lib/types.ts';

export function WhyThis({ why }: { why: WhyThisData }) {
  return (
    <div>
      <div className="metrics">
        {why.metrics.map(m => (
          <div key={m.label}>
            <div className="label">{m.label}</div>
            <div className="value">{m.value}</div>
          </div>
        ))}
      </div>
      {why.similar_shops && <div className="similar">{why.similar_shops}</div>}
    </div>
  );
}
