# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

MVP scaffold landed. Stack is now **fully locked**: Node/TypeScript with Next.js (App Router) for both API and dashboard. SQLite is the dev/demo store via `better-sqlite3`; production swap path is Postgres (the schema in `src/db/schema.sql` stays inside a Postgres-compatible subset). No real TikTok Shop Partner API integration yet — the demo seed simulates 90 days of orders for one beauty shop. See **Commands** below.

The Python/FastAPI alternative is shelved for now. Revisit only if a future workload (heavy ML training, scientific libraries) makes the Python ecosystem decisively better than the unified TypeScript stack.

## What This Product Is

**TikTok Live Shop Bundle Optimizer** — a bundle intelligence platform for TikTok Shop sellers. The wedge is: bundle suggestions powered by a shop's own transaction data, layered with cross-shop network effects. Trend scrapers and competitor monitoring exist elsewhere; this product wins by being the only tool that learns each shop's specific basket dynamics.

**Target segment for v1 is narrow and intentional:** mid-tier multi-SKU live sellers (20–100 active SKUs) in complementary-product categories (beauty, supplements, fashion accessories, baby). Reference customer profile: Miss Lil USA. Tiny shops (<10 SKUs) and pure dropshippers are explicitly out of scope. Do not generalize features to "every shop" — that's a v2+ problem.

## Locked Product Decisions

These are not up for debate during implementation. If a task seems to violate one, surface it before coding.

1. **Tier 0 unit = one bundle suggestion.** Always. Framed as a live/content prompt ("feature this in your next live"), not pure merchandising. Crisis interrupts (stockouts, price wars) appear in a thin alert band above the bundle card; the band is empty 95% of days.
2. **Notification budget capped at ~5–8/week** across daily heartbeat, pre-live prep alert, event-triggered interrupts, weekly digest. **No pushes during live.**
3. **Cadence ramps with data maturity.** Weeks 1–2 event-triggered only; daily heartbeat unlocks at ~50+ orders of signal; pre-live prep at month 2; weekly digest at month 3. Do not ship the full cadence stack on day one.
4. **Three confidence tiers, each with its own surface:** Strong → daily heartbeat/push/headline. Worth testing → pre-live brief + explore tab. Experimental → explore tab only. If no Strong bundle qualifies for the heartbeat, fall back to top-performer/inventory/trend content — **never demote a weak bundle into the headline slot.**
5. **Every suggestion needs a "why this?" expansion** — data points, projected lift, similar-shop comparison. No black boxes.
6. **Mobile is primary, not secondary.** Sellers run lives from phones. The React Native companion is a critical surface, not an afterthought.

## Architecture

### Data sources
- **TikTok Shop Partner API** (OAuth per shop) — orders, products, inventory, fulfillment webhooks. This is the primary ingestion path.
- **TikTok Creative Center** — trend signals (hashtags, sounds, top products by category/region).
- **Live stream metadata** where exposed — viewer count, engagement deltas tied to product showcases.
- **Competitor scraping** — deferred to v2; do not build it into v1.

### Storage layout
- **Postgres** — relational core: `shops`, `products`, `orders`, `bundles`, `users`, `suggestions`, `suggestion_outcomes`. Schema is an open question; design carefully when first written.
- **TimescaleDB or ClickHouse** — time-series for hourly heat scores, trend velocity, transaction streams. Pick one when the analytics layer lands.
- **pgvector** — semantic product matching (catalog ↔ trending items ↔ competitor SKUs). Used for cold start before transaction history exists.
- **Redis** — hot caches, rate limits, live-session signals.
- **S3** — product images, scraped snapshots.

### Processing
- **Job queue** — BullMQ when async processing lands. The MVP runs the pipeline synchronously via `npm run engine:run` or `POST /api/regenerate`; convert to a queued worker once we're hitting real shops.
- **Event stream** — Redis Streams to start. Kafka only if/when scale demands it; do not preemptively introduce it.
- **Analytics service has two layers:**
  - Deterministic: Apriori-style frequent itemset mining truncated at k=3 (`src/engine/affinity.ts`). Swap for full FP-Growth when shops exceed ~10k orders or we want larger bundles.
  - Learned: margin-weighted ranking → learning-to-rank as suggestion outcomes accumulate. After ~6 months the system stops doing market-basket analysis and starts predicting "will this seller adopt this bundle and will it lift margin."

### App layer
- **Backend + dashboard** — Next.js 15 App Router, TypeScript, server components reading directly from SQLite via `src/db/client.ts`. Server-side mutations through API routes under `src/app/api/`.
- **Mobile companion** — React Native, not yet built. Treat as a first-class client of the same API; the JSON shape returned by `loadDashboard` should map cleanly to mobile views.
- **Webhook handlers** — TikTok Shop order events. Not implemented; will live under `src/app/api/webhooks/`.

### Code map (current)

```
src/
  db/           schema.sql, client (better-sqlite3 singleton), init, seed
  engine/       affinity, scoring, archetypes, alerts, pipeline, run (CLI)
  lib/          types, queries (dashboard read model), random (seeded PRNG)
  app/          page.tsx (dashboard), components/, api/{outcomes,regenerate}
```

Suggestion lifecycle: `runPipeline(shopId)` wipes prior suggestions, mines itemsets from the rolling 90-day window, scores + classifies tier + detects archetype, picks at most one Strong-tier headline, persists to `suggestions` + `suggestion_items`, and writes alerts. The dashboard reads via `loadDashboard`. Outcomes posted to `/api/outcomes` append to `suggestion_outcomes` and feed the (future) learning-to-rank model.

## Bundle Algorithm

Scoring function for any candidate bundle B:

```
Score(B) = w1·affinity_lift
         + w2·margin_uplift
         + w3·inventory_pressure
         + w4·trend_alignment
         − w5·cannibalization_risk
```

- **affinity_lift** — `P(B together) / (P(item1) × P(item2))` on rolling 30/60/90-day windows.
- **margin_uplift** — projected bundle margin minus what items would have earned sold separately at typical conversion rates.
- **inventory_pressure** — bonus for items aging past N days or sitting above target stock.
- **trend_alignment** — bonus when one item is heating up on Creative Center signals.
- **cannibalization_risk** — penalty when a bundle mostly replaces existing high-margin solo sales.

Weights become **per-shop tunable** as the system learns each seller's optimization preference.

**Detect bundle archetypes separately** — they have different UX framings: complementary, volume packs, tier-up, discovery, clearance recovery.

**Cold start path** (new shop, no transaction history): semantic priors via pgvector → category defaults (once ~50+ shops per vertical) → optional imported affinity from pasted Shopify/Amazon order history during onboarding.

**Feedback loop** — every suggestion is an experiment. Adopted/Ignored/Modified are all signals; **Modified is the highest-value signal** because it captures seller domain knowledge. All three feed the learning-to-rank model.

**Cross-shop network effect is the moat**, not the algorithm. Once ~50+ shops per vertical exist, surface privacy-preserving aggregate signal ("Beauty shops your size are bundling X+Y at 38% higher margin"). The privacy model (k-anonymity thresholds, opt-in vs opt-out) is an open question — do not ship aggregate signal without resolving it.

## MVP Scope

### v1 — the bundle wedge (ship first)
1. OAuth shop connection + 90-day order backfill.
2. Basket affinity engine (FP-Growth) with margin overlay.
3. Dashboard showing top-performing bundles, 5–10 suggested new bundles ranked by projected margin × confidence, per-bundle performance tracking.
4. Daily heartbeat push + weekly digest email.

### v1.5 — trend pulse
1. Daily Creative Center pull.
2. Semantic match: "3 trending items overlap with your catalog" + restock/promote nudge.

### Deferred — do not build in v1
Competitor scraping, live-stream real-time recommendations, multi-shop/agency dashboards, pricing optimization (strong fast-follow candidate), demand forecasting.

## Anti-Patterns

When a task drifts toward any of these, push back:

1. **No generic dashboards.** Shopify and TikTok already show revenue-by-category pie charts. This product gives answers and next actions, not visualizations.
2. **Don't optimize for notification opens.** That metric pushes the product toward over-suggestion. Optimize for quality of action taken.
3. **Don't ship the full cadence stack on day one.** A half-trained model + full notification volume = unsubscribe before the model gets smart.
4. **No black-box suggestions.** Every suggestion ships with its rationale.
5. **Don't broaden the v1 segment.** Mid-tier multi-SKU live sellers in beauty/lifestyle. That's it.

## Commands

```
npm install              # bootstrap (installs better-sqlite3 native module)
npm run dev              # Next.js dev server on :3000 — dashboard + API
npm run build            # production build (also runs Next.js type checking)
npm run start            # serve the production build
npm run typecheck        # tsc --noEmit
npm run lint             # next lint

npm run db:init          # create / migrate schema (idempotent)
npm run db:seed          # seed the demo beauty shop (upserts)
npm run db:reset         # rm ohz.db && db:init && db:seed
npm run engine:run       # run the suggestion pipeline against the demo shop
```

There is no test suite yet. When one lands, document the runner here and a single-test invocation pattern.

Manual end-to-end flow:
```
npm install
npm run db:reset
npm run engine:run       # generates suggestions + alerts
npm run dev              # open http://localhost:3000
```

The dashboard re-runs the pipeline on demand via `POST /api/regenerate`. Outcome feedback (Adopt / Modify / Skip) posts to `POST /api/outcomes`.

## Open Questions

In rough priority order — these block design or implementation work and should be resolved with the user before deep coding in the affected area:

1. **TikTok Shop Partner API access** — application process, scopes needed, sandbox setup. The MVP currently fakes ingestion via the seed script.
2. **Onboarding flow** — OAuth handshake, historical backfill UX, first-suggestion delivery under cold start.
3. **SQLite → Postgres migration path** — when to flip, how to handle the schema diff (most types map straight across; `INTEGER` epoch ms columns become `TIMESTAMPTZ`).
4. **Bundle outcome measurement** — synthetic control methodology, holdout periods, significance thresholds for declaring a bundle a winner. The current `suggestion_outcomes` table records intent but not realized lift.
5. **Cross-shop privacy model** — what is shared, k-anonymity thresholds, opt-in vs opt-out. The "similar shops" line in `why_json` is a placeholder string until this is resolved.
6. **Notification cadence machinery** — daily heartbeat, pre-live prep alert, weekly digest. None of these are wired yet; the dashboard is the only surface.
7. **Tunable per-shop weights** for `Score(B)`. Currently `DEFAULT_WEIGHTS` in `src/engine/scoring.ts` is shared across shops.

## External References

- TikTok Shop Partner Center: https://partner.tiktokshop.com
- TikTok Creative Center: https://ads.tiktok.com/business/creativecenter
