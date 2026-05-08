'use client';

import { useEffect, useRef, useState } from 'react';

interface OrderEvent {
  atSecond: number;
  buyerName: string;
  productTitle: string;
  qty: number;
  amount: number;
  isBundleHit: boolean;
}

interface LivePlan {
  durationSeconds: number;
  startingViewers: number;
  peakViewers: number;
  events: OrderEvent[];
  totalRevenue: number;
  totalBundleAdoptions: number;
}

interface OrderInFeed extends OrderEvent {
  key: number;
}

type Phase = 'idle' | 'running' | 'done';

const CURRENCY = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function ShowSimulator({
  plan,
  bundleTitle,
  shopName,
}: {
  plan: LivePlan;
  bundleTitle: string;
  shopName: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [bundleHits, setBundleHits] = useState(0);
  const [viewers, setViewers] = useState(plan.startingViewers);
  const [feed, setFeed] = useState<OrderInFeed[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const nextEventIdxRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const eventKeyRef = useRef(0);

  useEffect(() => {
    if (phase !== 'running') return;

    const tick = (now: number) => {
      const startedAt = startedAtRef.current ?? now;
      startedAtRef.current = startedAt;
      const t = (now - startedAt) / 1000;
      const clamped = Math.min(t, plan.durationSeconds);
      setElapsed(clamped);

      // Viewer count grows toward peak then plateaus.
      const progress = clamped / plan.durationSeconds;
      const v = Math.round(
        plan.startingViewers + (plan.peakViewers - plan.startingViewers) * Math.min(1, progress * 1.4),
      );
      // Add a little jitter so it feels alive.
      setViewers(v + Math.floor(Math.sin(now / 220) * 6));

      // Fire any events whose time has come.
      while (
        nextEventIdxRef.current < plan.events.length &&
        plan.events[nextEventIdxRef.current].atSecond <= clamped
      ) {
        const e = plan.events[nextEventIdxRef.current];
        nextEventIdxRef.current += 1;
        eventKeyRef.current += 1;
        const k = eventKeyRef.current;
        setFeed(prev => [{ ...e, key: k }, ...prev].slice(0, 8));
        setRevenue(r => r + e.amount * e.qty);
        if (e.isBundleHit) setBundleHits(n => n + 1);
      }

      if (clamped >= plan.durationSeconds) {
        setPhase('done');
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, plan]);

  function start() {
    setPhase('running');
    setElapsed(0);
    setRevenue(0);
    setBundleHits(0);
    setFeed([]);
    setViewers(plan.startingViewers);
    startedAtRef.current = null;
    nextEventIdxRef.current = 0;
    eventKeyRef.current = 0;
  }

  function reset() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase('idle');
    setElapsed(0);
    setRevenue(0);
    setBundleHits(0);
    setFeed([]);
    setViewers(plan.startingViewers);
  }

  if (phase === 'idle') {
    return (
      <div className="sim-cta">
        <div className="sim-cta-h">Run the live</div>
        <p className="sim-cta-b">
          Watch a 30-second simulation of tonight&apos;s show with this bundle as the headline.
          Orders, revenue, and viewer count update in real time.
        </p>
        <button className="btn primary" onClick={start}>▶ Go live (demo)</button>
      </div>
    );
  }

  const remaining = Math.max(0, plan.durationSeconds - elapsed);

  return (
    <div className="sim">
      <div className="sim-header">
        <div className="sim-live">
          <span className="sim-live-dot" /> LIVE
        </div>
        <div className="sim-viewers">
          <span aria-hidden>👁</span> {viewers.toLocaleString()}
        </div>
        <div className="sim-clock">{remaining.toFixed(1)}s</div>
      </div>

      <div className="sim-stage">
        <div className="sim-shop">@{shopName.toLowerCase().replace(/[^a-z0-9]+/g, '')}</div>
        <div className="sim-featuring">
          <span className="sim-featuring-l">Featuring</span>
          <div className="sim-featuring-t">{bundleTitle}</div>
        </div>
        <div className="sim-progress">
          <div
            className="sim-progress-fill"
            style={{ width: `${Math.min(100, (elapsed / plan.durationSeconds) * 100)}%` }}
          />
        </div>
      </div>

      <div className="sim-revenue-row">
        <div>
          <div className="sim-rev-num">{CURRENCY(revenue)}</div>
          <div className="sim-rev-lbl">live revenue</div>
        </div>
        <div>
          <div className="sim-rev-num good">{bundleHits}</div>
          <div className="sim-rev-lbl">bundle adoptions</div>
        </div>
      </div>

      <div className="sim-feed">
        {feed.length === 0 && <div className="sim-feed-empty">Waiting for orders…</div>}
        {feed.map(e => (
          <div key={e.key} className={`sim-order ${e.isBundleHit ? 'bundle' : ''}`}>
            <div className="sim-order-name">{e.buyerName}</div>
            <div className="sim-order-prod">
              {e.isBundleHit && <span className="sim-bundle-tag">BUNDLE</span>}
              {e.productTitle}
            </div>
            <div className="sim-order-amt">{CURRENCY(e.amount)}</div>
          </div>
        ))}
      </div>

      {phase === 'done' && (
        <div className="sim-summary">
          <div className="sim-summary-h">Live ended</div>
          <div className="sim-summary-row">
            <span>Total revenue</span>
            <strong>{CURRENCY(revenue)}</strong>
          </div>
          <div className="sim-summary-row">
            <span>Bundle adoptions</span>
            <strong>{bundleHits} of {plan.totalBundleAdoptions}</strong>
          </div>
          <div className="sim-summary-row">
            <span>Peak viewers</span>
            <strong>{plan.peakViewers.toLocaleString()}</strong>
          </div>
          <button className="btn" onClick={reset} style={{ marginTop: 10 }}>Run again</button>
        </div>
      )}
    </div>
  );
}
