'use client';

import { useState } from 'react';

interface ImportSummary {
  shopId: string;
  productCount: number;
  orderCount: number;
  itemCount: number;
  ordersSkippedCancelled: number;
  windowStart: number | null;
  windowEnd: number | null;
}

interface ParseDiagnostics {
  totalRows: number;
  acceptedRows: number;
  skippedNoOrderId: number;
  skippedNoSku: number;
  skippedBadDate: number;
  skippedBadPrice: number;
  unmappedFields: string[];
  delimiter: string;
  headerColumns: string[];
}

interface PipelineResult {
  totalOrders: number;
  candidatesMined: number;
  suggestionsPersisted: number;
  headlineSuggestionId: string | null;
  alertsPersisted: number;
}

type Result =
  | { ok: true; summary: ImportSummary; diagnostics: ParseDiagnostics; pipeline: PipelineResult }
  | { ok: false; error: string; unmapped?: string[]; headerColumns?: string[] };

export function UploadForm() {
  const [shopName, setShopName] = useState('');
  const [vertical, setVertical] = useState('beauty');
  const [marginPct, setMarginPct] = useState(65);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !shopName.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('shop_name', shopName.trim());
      fd.append('vertical', vertical.trim() || 'beauty');
      fd.append('margin_pct', String(Math.max(0, Math.min(100, marginPct)) / 100));
      const res = await fetch('/api/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: json.error ?? 'Import failed', unmapped: json.unmapped, headerColumns: json.headerColumns });
      } else {
        setResult({ ok: true, ...json });
      }
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Shop name">
        <input
          required
          value={shopName}
          onChange={e => setShopName(e.target.value)}
          placeholder="Lush Beauty Co"
          className="text-input"
        />
      </Field>

      <Field label="Vertical">
        <select
          value={vertical}
          onChange={e => setVertical(e.target.value)}
          className="text-input"
        >
          <option value="beauty">beauty</option>
          <option value="supplements">supplements</option>
          <option value="fashion_accessories">fashion accessories</option>
          <option value="baby">baby</option>
          <option value="other">other</option>
        </select>
      </Field>

      <Field
        label="Typical gross margin (%)"
        hint="Used to derive per-item cost (cost = price × (1 − margin)). 65% is a reasonable beauty default; tune to your real gross."
      >
        <input
          type="number"
          min={0}
          max={95}
          step={1}
          value={marginPct}
          onChange={e => setMarginPct(Number(e.target.value))}
          className="text-input"
          style={{ width: 120 }}
        />
      </Field>

      <Field label="CSV file" hint="Order export from TikTok Shop Seller Center (CSV).">
        <input
          type="file"
          accept=".csv,text/csv,text/plain,application/vnd.ms-excel"
          required
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>

      <div>
        <button className="btn primary" type="submit" disabled={submitting || !file || !shopName.trim()}>
          {submitting ? 'Importing & analyzing…' : 'Import & analyze'}
        </button>
      </div>

      {result && !result.ok && (
        <div className="alert critical" style={{ marginTop: 8 }}>
          <span className="pill">Error</span>
          <div>
            <div className="title">{result.error}</div>
            {result.unmapped && result.unmapped.length > 0 && (
              <div className="body">
                Missing columns: <strong>{result.unmapped.join(', ')}</strong>.
                {result.headerColumns && (
                  <> Detected headers: {result.headerColumns.join(', ')}.</>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {result && result.ok && (
        <div className="card" style={{ marginTop: 8, borderColor: 'var(--good)' }}>
          <div className="label" style={{ color: 'var(--good)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
            Import complete
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>{result.summary.orderCount}</strong> orders ·{' '}
            <strong>{result.summary.itemCount}</strong> line items ·{' '}
            <strong>{result.summary.productCount}</strong> SKUs
            {result.summary.ordersSkippedCancelled > 0 && (
              <span style={{ color: 'var(--text-dim)' }}>
                {' '}· {result.summary.ordersSkippedCancelled} cancelled/refunded skipped
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, color: 'var(--text-dim)', fontSize: 13 }}>
            Engine mined {result.pipeline.candidatesMined} candidate bundles, persisted{' '}
            {result.pipeline.suggestionsPersisted}.{' '}
            {result.pipeline.headlineSuggestionId
              ? 'Strong-tier headline ready.'
              : 'No Strong-tier bundle qualified — dashboard will show fallback content.'}
          </div>
          <div style={{ marginTop: 12 }}>
            <a className="btn primary" href={`/?shop=${encodeURIComponent(result.summary.shopId)}`}>
              Open dashboard →
            </a>
          </div>
        </div>
      )}
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hint}</span>}
    </label>
  );
}
