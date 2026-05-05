# ohz — TikTok Live Shop Bundle Optimizer

MVP scaffold of a bundle intelligence platform for TikTok Shop sellers. Ingests order history, mines basket affinity, scores candidate bundles, and surfaces one high-confidence suggestion per day with a "why this?" rationale.

See [CLAUDE.md](./CLAUDE.md) for product context, locked product decisions, architecture, and the bundle scoring function.

## Quick start

```
npm install
npm run db:reset      # create schema + seed demo beauty shop (49 SKUs, 720 orders / 90 days)
npm run engine:run    # mine itemsets, score, write suggestions + alerts
npm run dev           # http://localhost:3000
```

## What's in the box

- **Schema** (`src/db/schema.sql`) — `shops`, `products`, `orders`, `order_items`, `suggestions`, `suggestion_items`, `suggestion_outcomes`, `alerts`. SQLite for dev, Postgres-compatible subset.
- **Engine** (`src/engine/`) — Apriori-style frequent-itemset mining truncated at k=3, the 5-component scoring function from CLAUDE.md, archetype detection (complementary / volume pack / tier-up / discovery / clearance recovery), confidence-tier classifier (strong / worth testing / experimental).
- **Dashboard** (`src/app/`) — alert band, headline bundle card with "why this?" expansion, Worth Testing list, Explore (experimental) list, recent outcomes feed. Outcome feedback (Adopt / Modify / Skip) records to the database for the future learning-to-rank model.

## What's intentionally not built

- TikTok Shop Partner API OAuth + ingestion (seed script simulates orders).
- Push notifications and email digests.
- React Native mobile companion.
- Cross-shop aggregate signal (privacy model unresolved).
- Per-shop tunable scoring weights.
- Job queue and event stream.

See the **Open Questions** section in CLAUDE.md for the priority order.
