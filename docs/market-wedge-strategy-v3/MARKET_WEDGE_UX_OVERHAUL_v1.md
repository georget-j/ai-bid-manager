# UX Overhaul v1 — two offerings, one understandable product (2026-06-11)

Source: full visual review (live app walkthrough) + 4-agent flow review. Owner's bar: grant
responding feels clunky/slow; break down what funders ask; private KB upload users can trust;
recommendations for which tenders AND grants to go for; design anyone picks up without
instructions; updated instruction system.

## Headline findings

1. **Answer generation can silently die** (BLOCKER): `answer-batch` maxDuration=60 with a 55s
   between-wave abort; waves of 5 in lock-step; 12–25s per question (embed → hybrid search →
   LLM rerank → non-streaming structured generation, all gpt-4o-mini). >~12 questions = killed
   mid-stream; client never gets a terminal event → "Generating…" forever. THE clunk.
2. **No streaming** despite `/api/ask` already streaming partials and ResponseCard supporting
   them. Answers pop in fully-formed after long silences.
3. **Guidance items are auto-"answered"** (waste + nonsense answers to review).
4. **Review = wall of toggles**: 2-line clamped summaries; full answer needs Read-toggle then
   Edit-toggle; ~30 clicks for 10 answers. No per-question briefing (mandatory/topic/word-limit
   exist in data but aren't shown as a breakdown).
5. **Home page is tender-only** (zero grants mentions), answers nothing about "what next";
   tender recommendations EXIST (`/api/opportunities/recommendations`) but are buried inside
   "My Opportunities"; grants recommendations live separately in "My Grants". Nothing unified.
6. **IA hides the offerings**: groups "Intelligence" (=tenders) / "Funding" (=grants) /
   "Respond" (=shared AI) — 21 items; "Dashboard" is the 14th item; grants breadcrumbs all say
   "Page"; grant flow lives under /rfp/drafts URL.
7. **KB**: "Indexed documents … chunked and embedded for semantic search"; ZERO privacy copy
   anywhere despite the org-RLS tech being solid; no in-flow way to upload own evidence during
   an application; duplicate upload shows "Upload failed"; readiness copy falsely claims KB
   uploads improve a profile-only score.
8. **Help system** (HelpNavigator) is tenders-only and teaches engineering internals ("BM25 +
   pgvector → RRF fusion"). No setup checklist; welcome state is per-browser.
9. Small visual bugs: "1 days left", "£1–£1.4m" (amount_min=1), home links non-operators to
   /sources (silent bounce loop).
10. `/my-applications` hydration question: in the embedded preview browser no client JS
    mounted anywhere (artifact suspected) — verify the page on the deployed app in a real
    browser during UX-C.

## Implementation phases

### UX-C — answering speed + simplicity (FIRST: owner's top pain)

Server: abort-signal plumbing + ALWAYS-terminal SSE (done/partial/timeout); sliding-window
concurrency (no lock-step waves); drop LLM rerank in the batch path (keep for /ask); stream
draft deltas per question (streamObject pattern from /api/ask). Client: don't auto-select
guidance (render as grey notes); per-question briefing strip (mandatory/topic/limit chips);
question-by-question review mode (always-editable draft, autosave on blur, no toggles,
prev/next + expand-all); "ran out of time → continue" affordance; pin "Draft all N answers"
CTA; replace window.confirm.

### UX-B — IA + home + unified recommendations

Sidebar regroup to offering-first: Home / Tenders / Grants / Investors / shared (Ask, Evidence
library, Review queue, Alerts, Profile) — labels+groups only, URLs unchanged. Home rebuild:
both-offering hero, derived "Get set up" checklist (profile → upload evidence → see matches →
start a response; buildSetupFlow pattern), "Recommended for you" (top tenders + grants via the
two existing APIs, one card language), due-soon across both offerings, KPI rewording, fix
operator dead-links. Breadcrumb CRUMB_MAP entries for all grants/investor routes. Plain-English
label sweep ("chunks indexed" → "documents ready", etc.).

### UX-D — KB trust + instruction system

/documents → "Evidence library": outcome copy + privacy line ("Private to your organisation —
only your team can see these; used only to draft your answers"), teaching empty state (what to
upload checklist + sample data button HERE), multi-file drop + per-file progress, 409 duplicate
→ Replace/Keep-both, plain-English scope labels, hide chunk jargon. Privacy strip on upload +
grant-flow evidence step + /ask. "Add your own supporting documents" inside the grant flow.
HelpNavigator rewrite (Tenders / Grants / Your documents & privacy; delete tech-spec tabs);
authenticated /help page; lib/copy.ts for tender-side plain English (ConfidenceBadge → "Well
evidenced / Partly evidenced / Needs your input"); page-head one-line explainers; profile
completeness surfaced beyond /profile; legal-form enum labels; fix the false KB-readiness
claim.

Deferred/follow-ups: rename "/rfp/drafts" URL space; unify the two pipelines' vocabulary;
middleware→proxy convention migration; my-applications real-browser hydration check (during
UX-C deploy); invite-only grants down-ranking.
