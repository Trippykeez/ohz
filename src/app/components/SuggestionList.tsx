import type { DashboardSuggestion } from '../../lib/queries.ts';
import { OutcomeButtons } from './OutcomeButtons.tsx';
import { WhyThis } from './WhyThis.tsx';

export function SuggestionList({
  items,
  emptyMessage,
}: {
  items: DashboardSuggestion[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }
  return (
    <div className="list">
      {items.map(s => (
        <div key={s.suggestion.id} className="suggestion-row">
          <div className="row-head">
            <div className="row-titles">
              {s.products.map(p => p.title).join('  +  ')}
              <span className={`tier-pill ${s.suggestion.confidence_tier}`}>
                {s.suggestion.confidence_tier.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="row-meta">
              lift {s.suggestion.affinity_lift.toFixed(2)} · score {s.suggestion.score.toFixed(2)} ·{' '}
              {s.suggestion.archetype.replace(/_/g, ' ')}
            </div>
          </div>
          <details>
            <summary>Why this?</summary>
            <WhyThis why={s.why} />
            <OutcomeButtons
              suggestionId={s.suggestion.id}
              initialStatus={s.outcome?.status ?? null}
            />
          </details>
        </div>
      ))}
    </div>
  );
}
