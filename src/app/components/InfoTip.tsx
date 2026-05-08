// Tiny "i" badge with an explanation that appears on hover/focus.
// CSS-only — keyboard-accessible via tabindex + :focus-within. No JS needed,
// so this stays a server component and can be dropped in anywhere.

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} aria-label={text}>
      <span className="info-icon" aria-hidden>i</span>
      <span className="info-bubble" role="tooltip">{text}</span>
    </span>
  );
}

// Explanations for the metrics produced by `buildWhyThis` in
// src/engine/pipeline.ts. Keyed off the human-readable label so we don't
// have to refactor the engine output to add help text.
export const WHY_THIS_TIPS: Record<string, string> = {
  'Co-purchased in':
    'Number of orders in the last 90 days that contained every member of this bundle. The percentage is "support" — the share of all orders the bundle appears in.',
  'Lift vs. chance':
    'How much more often these items are bought together than chance predicts. 1.0× = independent. 2.0× = bought together twice as often as independent purchase rates would suggest.',
  'Combined unit margin':
    'Sum of (unit_price − unit_cost) across the bundle. The dollar profit you keep when one bundle is sold at full price.',
  'Inventory pressure':
    'Score component that rewards bundles whose members are aging past ~30 days or sitting on >100 units of stock. High = good candidate to move slow-moving stock.',
  'Trend alignment':
    'Score component that rewards bundles where at least one member is heating up on TikTok Creative Center signals (hashtags, sounds, top products by category).',
  'Cannibalization risk':
    'Penalty applied when a bundle member already sells very well solo. Promoting the bundle could displace existing high-margin solo sales rather than adding incremental revenue.',
};
