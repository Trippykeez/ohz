import { initSchema, getDb } from '../../db/client.ts';
import { loadLiveBrief } from '../../lib/live-brief.ts';
import { ShowSimulator } from './ShowSimulator.tsx';

export const dynamic = 'force-dynamic';

const DEMO_SHOP_ID = 'shop_demo_beauty';

function fmt$(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function tierLabel(tier: 'strong' | 'worth_testing' | 'experimental'): string {
  return tier === 'worth_testing' ? 'Worth testing' : tier[0].toUpperCase() + tier.slice(1);
}

export default async function LiveBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; bundle?: string }>;
}) {
  initSchema();
  const params = await searchParams;
  const db = getDb();

  const shopId = (() => {
    if (params.shop && (db.prepare(`SELECT 1 FROM shops WHERE id = ?`).get(params.shop) as unknown))
      return params.shop;
    if (db.prepare(`SELECT 1 FROM shops WHERE id = ?`).get(DEMO_SHOP_ID) as unknown)
      return DEMO_SHOP_ID;
    return (db.prepare(`SELECT id FROM shops ORDER BY connected_at DESC LIMIT 1`).get() as { id: string } | undefined)?.id;
  })();

  if (!shopId) {
    return (
      <main className="container">
        <div className="topbar">
          <h1>ohz · Live brief</h1>
          <a href="/" className="meta">Back to dashboard</a>
        </div>
        <div className="card">
          <p>No shop available. Import sales data first.</p>
        </div>
      </main>
    );
  }

  const brief = loadLiveBrief({ shopId, suggestionId: params.bundle });
  if (!brief) {
    return (
      <main className="container">
        <div className="topbar">
          <h1>ohz · Live brief</h1>
          <a href={`/?shop=${encodeURIComponent(shopId)}`} className="meta">Back to dashboard</a>
        </div>
        <div className="card">
          <p>No bundle suggestions yet for this shop. Run the engine first.</p>
        </div>
      </main>
    );
  }

  const { bundle, backup, talkingPoints, projection, inventory, hasInventoryData, plan, shop } = brief;
  const titles = bundle.products.map(p => p.title);
  const liftPct = Math.round((bundle.affinityLift - 1) * 100);

  return (
    <main className="container live-brief-page">
      <div className="topbar">
        <h1>ohz · Live brief</h1>
        <a href={`/?shop=${encodeURIComponent(shop.id)}`} className="meta">← Dashboard</a>
      </div>

      <div className="brief-grid">
        <div className="phone-frame">
          <div className="phone-screen">
            <div className="phone-status">
              <span>9:41</span>
              <span>{shop.name}</span>
            </div>
            <div className="phone-body">
              <div className="phone-eyebrow">Tonight&apos;s live · {bundle.archetype.replace(/_/g, ' ')}</div>
              <h2 className="phone-headline">{bundle.why.rationale}</h2>
              <div className="phone-chips">
                {titles.map(t => (
                  <span className="chip" key={t}>{t}</span>
                ))}
              </div>

              <div className="phone-stats">
                <div>
                  <div className="stat-num">{fmt$(projection.projectedRevenue)}</div>
                  <div className="stat-lbl">projected revenue</div>
                </div>
                <div>
                  <div className="stat-num good">+{fmt$(projection.projectedMarginLift)}</div>
                  <div className="stat-lbl">margin lift over solo</div>
                </div>
                <div>
                  <div className="stat-num">{projection.expectedLiveOrders}</div>
                  <div className="stat-lbl">expected adoptions</div>
                </div>
                <div>
                  <div className="stat-num">{liftPct > 0 ? `+${liftPct}%` : `${liftPct}%`}</div>
                  <div className="stat-lbl">co-purchase lift</div>
                </div>
              </div>

              <div className="phone-section">
                <div className="phone-section-h">Talking points</div>
                <ol className="talk-script">
                  {talkingPoints.map((line, i) => <li key={i}>{line}</li>)}
                </ol>
              </div>

              <div className="phone-section">
                <div className="phone-section-h">Inventory readiness</div>
                {hasInventoryData ? (
                  <ul className="inv-list">
                    {inventory.map(r => (
                      <li key={r.productId} className={`inv-row inv-${r.status}`}>
                        <span className="inv-title">{r.title}</span>
                        <span className="inv-meta">
                          {r.status === 'untracked'
                            ? 'untracked'
                            : `${r.stockQty} units · ${r.daysLeft !== null ? r.daysLeft.toFixed(1) + 'd left' : 'idle'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="inv-untracked">
                    Inventory feed not connected — units left unknown. Hook up TikTok Shop inventory to enable stockout alerts mid-live.
                  </div>
                )}
              </div>

              {backup && (
                <div className="phone-section">
                  <div className="phone-section-h">If something stocks out — backup bundle</div>
                  <div className="backup-row">
                    <div className="backup-titles">{backup.products.map(p => p.title).join(' + ')}</div>
                    <div className="backup-meta">
                      <span className={`tier-pill ${backup.tier}`}>{tierLabel(backup.tier)}</span>
                      <span className="backup-lift">lift {backup.affinityLift.toFixed(2)}×</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="phone-section phone-cta">
                <ShowSimulator plan={plan} bundleTitle={titles.join(' + ')} shopName={shop.name} />
              </div>
            </div>
          </div>
        </div>

        <aside className="brief-side">
          <div className="card">
            <div className="label" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Why this bundle
            </div>
            <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-dim)' }}>
              The engine surfaced this from {bundle.coOccurrences} co-purchases in the last 90 days
              — that&apos;s {fmtPct(bundle.support)} of all orders, co-occurring{' '}
              {liftPct > 0 ? `${liftPct}% above` : 'roughly at'} chance.
            </p>
            <div className="metrics" style={{ marginTop: 12 }}>
              {bundle.why.metrics.map(m => (
                <div key={m.label} style={{ display: 'contents' }}>
                  <span className="label">{m.label}</span>
                  <span className="value">{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="label" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Projection math
            </div>
            <ul className="projection-math">
              <li>Assumed live orders: <strong>80</strong> (tunable)</li>
              <li>Bundle attach rate: <strong>{fmtPct(projection.attachRate)}</strong> (scales with affinity lift)</li>
              <li>Bundle adoptions: <strong>{projection.expectedLiveOrders}</strong></li>
              <li>Bundle revenue: <strong>{fmt$(projection.projectedRevenue)}</strong></li>
              <li>Baseline solo margin: <strong>{fmt$(projection.baselineMargin)}</strong></li>
              <li className="lift-line">
                Margin lift: <strong>+{fmt$(projection.projectedMarginLift)}</strong>
              </li>
            </ul>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, marginBottom: 0 }}>
              Conservative — assumes half of bundle adopters would have bought the hero solo anyway.
            </p>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="label" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Print or share
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
              Press <kbd>Cmd</kbd>+<kbd>P</kbd> to save this brief as a PDF. The phone view is
              optimized for portrait paper.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
