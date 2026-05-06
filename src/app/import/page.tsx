import { initSchema, getDb } from '../../db/client.ts';
import { UploadForm } from './UploadForm.tsx';

export const dynamic = 'force-dynamic';

interface ShopRow {
  id: string;
  name: string;
  vertical: string;
  connected_at: number;
  order_count: number;
}

function listShops(): ShopRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.name, s.vertical, s.connected_at,
              (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) AS order_count
         FROM shops s
        ORDER BY s.connected_at DESC`,
    )
    .all() as ShopRow[];
}

export default function ImportPage() {
  initSchema();
  const shops = listShops();

  return (
    <main className="container">
      <div className="topbar">
        <h1>ohz · Import sales data</h1>
        <a href="/" className="meta">Back to dashboard</a>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Upload a TikTok Shop order export</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          Export your orders from TikTok Shop Seller Center as CSV (Orders → Manage Orders →
          Export). Drop the file below, set your shop&apos;s typical gross margin so we can derive
          per-item cost, and we&apos;ll import the data and run the bundle engine.
        </p>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Required columns (we match by name, aliases supported): Order ID, Created Time, Seller
          SKU, Product Name, Quantity, SKU Unit Original Price. Order Status is optional —
          cancelled and refunded rows are skipped automatically.
        </p>
        <UploadForm />
      </div>

      {shops.length > 0 && (
        <section className="section">
          <h3>Imported shops</h3>
          <div className="list">
            {shops.map(s => (
              <div key={s.id} className="suggestion-row">
                <div className="row-head">
                  <div className="row-titles">
                    <a href={`/?shop=${encodeURIComponent(s.id)}`}>{s.name}</a>
                  </div>
                  <div className="row-meta">
                    {s.order_count} orders · {s.vertical} ·{' '}
                    {new Date(s.connected_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
