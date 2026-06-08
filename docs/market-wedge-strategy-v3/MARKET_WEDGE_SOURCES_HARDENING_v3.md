# Market Wedge — Sources Hardening Tracker v3 (ACTIVE INITIATIVE)

> **Live recovery anchor for the admin Sources sync reliability + speed initiative.**
> If context compacted, re-read THIS file and resume from the **Current pointer** below —
> do not work from memory. Every phase ends in a git commit + push (a checkpoint).
> Full design rationale: `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`.

## Current pointer

- **Status:** Phase 0 — scaffolding (in progress).
- **Last commit:** (none yet for this initiative)
- **Updated:** 2026-06-08
- Next free migrations: **050** (Scotland base_url), **051** (Wales base_url + enable).

## How to resume after compaction

1. Read this file's Current pointer.
2. Read the matching phase block below for goal + files + commit message.
3. Read `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md` for full detail.
4. Continue from the first unticked box. Do not restart completed phases.

## Update rule (run after EVERY phase)

Tick the box → update Current pointer (phase + last commit) → add a
`MARKET_WEDGE_CHANGELOG_v3.md` entry → `git commit` + `git push`.

---

## The problem (why this initiative exists)

Live read-only probing (2026-06-08) found **2 of 4 source connectors silently broken** —
whole nations ingest **zero** tenders:

- **Public Contracts Scotland** hit `…/api/1.0/ocdsReleasePackages` → **HTTP 404**.
- **Sell2Wales** hit the same dead path on the wrong host → "Bad Page parameters"; also
  `enabled=false`.

Connectors read their host from a `BASE_URL` **const** (env-overridable), NOT the DB
`base_url` column — so the fix lives in the connector files. `seedSources()` in
`lib/procurement/sync.ts` hardcodes base_url/enabled and would revert a DB-only change, so
it must be updated too.

## Verified API contracts (probed live 2026-06-08)

- **Find a Tender** — `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`,
  `updatedFrom`/`updatedTo` (ISO), cursor pagination, no auth. **Works.**
- **Contracts Finder** — `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search`,
  `postedFrom`/`postedTo`, cursor in `links.next`, no auth. **Works.** Nits: `size` param
  ignored (API uses `limit=100`); rate-limit is **HTTP 403** (not 429).
- **Public Contracts Scotland (Proactis)** — `https://api.publiccontractsscotland.gov.uk/v1/Notices?dateFrom={MM-YYYY}&outputType=0&noticeType={N}`.
  Monthly `MM-YYYY`; **no cursor — iterate noticeType** `[101,102,103,104]`. OCID `ocds-r6ebe6`.
  Live: June mid-month 101=3 / 102=27 / 103=86 (May 103=297).
- **Sell2Wales (Proactis)** — `https://api.sell2wales.gov.wales/v1/Notices?...&noticeType={N}`,
  noticeTypes `[51..56]`. **API host has a broken TLS intermediate chain + returned 500
  from dev machine** → needs the **monthly bulk-download fallback**
  (`www.sell2wales.gov.wales/Notice/Download`). `www` host IS reachable.

## No other UK APIs to add (audit conclusion)

eTendersNI, Crown Commercial/GCA, NHS/Atamis, MOD Defence Sourcing Portal, Jaggaer,
Delta/ProContract/In-tend are **portal-only**; their notices flow downstream into FTS +
Contracts Finder (already ingested). The 4 OCDS feeds above are the complete
machine-readable set. Procurement Act 2023 (24 Feb 2025) added new FTS notice types
(pipeline, contract-details, contract-change) + ~143 OCDS fields — must not be dropped.

## Decisions (locked)

- Schedule: **23:59 BST** → vercel cron `59 22 * * *` (22:59 UTC; winter = 22:59 GMT).
- Wales: build the **bulk-download fallback now** alongside the API connector.
- Speed: maximise with **no tenders missed** (parallel sources + bulk upserts).
- Proactis connectors fit the existing `fetchSince` engine by walking **months** in the
  `cursor` (one "page" = one month across all noticeTypes), keeping pages ≤ backfill cap.
- Never disable TLS verification. Migrations idempotent + additive.

---

## Phase 0 — Compaction-safe tracker + verified API audit

- [ ] This tracker created + pointers wired (NEXT_ACTIONS, EXECUTION_TRACKER) ·
      `docs: sources-hardening tracker + verified UK procurement API audit`

## Phase 1 — Repair Public Contracts Scotland

- [ ] `lib/procurement/connectors/proactis.ts` helper (month-walk cursor) + rewrite
      `public-contracts-scotland.ts` (host `api.publiccontractsscotland.gov.uk`, types
      101–104) + mig 050 + seedSources base_url + verify Scotland > 0 ·
      `fix(ingest): repair Public Contracts Scotland via Proactis OCDS API (mig 050)`

## Phase 2 — Sell2Wales API + bulk-download fallback + enable

- [ ] Wales connector via proactis.ts + monthly bulk-download fallback + mig 051
      (base_url + enabled) + seedSources enabled=true + verify ·
      `fix(ingest): Sell2Wales Proactis API + bulk-download fallback, enabled (mig 051)`

## Phase 3 — Contracts Finder + Find a Tender correctness

- [ ] CF `limit` param + 403 backoff; normalizer retains new Procurement-Act notice types ·
      `fix(ingest): CF 403 rate-limit + limit param + FTS notice-type coverage`

## Phase 4 — Speed: parallel sources + bulk upserts

- [ ] Cron forward sync via `Promise.allSettled` (distinct hosts); `syncSource` bulk
      dedup/insert/upsert (mirror `syncPage`) · `perf(ingest): parallel sources + bulk upserts`

## Phase 5 — 23:59 BST schedule + health polish + final audit

- [ ] `vercel.json` `59 22 * * *`; `/sources` per-source health + non-zero Scotland/Wales;
      finalise audit · `feat(ingest): 23:59 BST schedule + sources health polish + audit`

---

## Per-phase verification gates

- `npx tsc --noEmit` clean + `npm run lint` after every phase; `npm run build` at Phase 4/5.
- Migrations 050/051 applied by hand (idempotent) and smoke-tested before dependent code.
- Live verify read-only: opportunity counts by `source_name` (Scotland/Wales 0 → > 0),
  `sources` health columns, `last_error IS NULL`. No fabricated cron secret — use the
  authenticated `/sources` "Sync now" UI or the scheduled cron.
