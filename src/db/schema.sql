-- TikTok Live Shop Bundle Optimizer — SQLite schema for the v1 MVP.
-- Production target is Postgres; types stay close to a Postgres-compatible subset.

CREATE TABLE IF NOT EXISTS shops (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  vertical     TEXT NOT NULL,
  connected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  shop_id       TEXT NOT NULL REFERENCES shops(id),
  sku           TEXT NOT NULL,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  unit_price    REAL NOT NULL,
  unit_cost     REAL NOT NULL,
  stock_qty     INTEGER NOT NULL,
  days_in_stock INTEGER NOT NULL DEFAULT 0,
  trend_score   REAL NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  shop_id    TEXT NOT NULL REFERENCES shops(id),
  ordered_at INTEGER NOT NULL,
  total      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_shop_time ON orders(shop_id, ordered_at);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS suggestions (
  id                  TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL REFERENCES shops(id),
  archetype           TEXT NOT NULL,
  confidence_tier     TEXT NOT NULL,
  score               REAL NOT NULL,
  affinity_lift       REAL NOT NULL,
  margin_uplift       REAL NOT NULL,
  inventory_pressure  REAL NOT NULL,
  trend_alignment     REAL NOT NULL,
  cannibalization_risk REAL NOT NULL,
  support             REAL NOT NULL,
  co_occurrences      INTEGER NOT NULL,
  why_json            TEXT NOT NULL,
  generated_at        INTEGER NOT NULL,
  is_headline         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_suggestions_shop ON suggestions(shop_id, generated_at);

CREATE TABLE IF NOT EXISTS suggestion_items (
  suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id),
  PRIMARY KEY (suggestion_id, product_id)
);

CREATE TABLE IF NOT EXISTS suggestion_outcomes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id   TEXT NOT NULL REFERENCES suggestions(id),
  status          TEXT NOT NULL CHECK (status IN ('adopted','ignored','modified')),
  modified_json   TEXT,
  recorded_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outcomes_suggestion ON suggestion_outcomes(suggestion_id);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  shop_id      TEXT NOT NULL REFERENCES shops(id),
  kind         TEXT NOT NULL,
  severity     TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  product_id   TEXT REFERENCES products(id),
  generated_at INTEGER NOT NULL,
  dismissed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_shop_active ON alerts(shop_id, dismissed_at, generated_at);
