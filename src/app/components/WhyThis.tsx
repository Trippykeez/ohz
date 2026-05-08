import type { WhyThis as WhyThisData } from '../../lib/types.ts';
import { InfoTip, WHY_THIS_TIPS } from './InfoTip.tsx';

export function WhyThis({ why }: { why: WhyThisData }) {
  return (
    <div>
      <div className="metrics">
        {why.metrics.map(m => (
          <div key={m.label}>
            <div className="label">
              {m.label}
              {WHY_THIS_TIPS[m.label] && <InfoTip text={WHY_THIS_TIPS[m.label]} />}
            </div>
            <div className="value">{m.value}</div>
          </div>
        ))}
      </div>
      {why.similar_shops && <div className="similar">{why.similar_shops}</div>}
    </div>
  );
}
