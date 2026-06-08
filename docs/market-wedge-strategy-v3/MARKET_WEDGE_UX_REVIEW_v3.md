# UX & Navigation Review v3

**Date:** 2026-06-08 · **Scope:** authenticated app (not the public marketing site) ·
**Status:** advisory — nothing in here is implemented yet. It exists to drive the
decisions in §8 before any build.

This is a designer's pass over the _routes a user actually travels_, the navigation that
connects them, the design of each surface, and the specific question the user raised:
**"could a user open multiple responses at the same time?"**

---

## 1. Information architecture (as built)

Sidebar groups (`components/AppSidebar.tsx`):

- **Intelligence:** Clients* · Opportunities · My Opportunities · Bid Pipeline · Buyers ·
  Sources* · Alerts · Organisation Profile (\* = admin-only)
- **Respond:** Dashboard · Ask · Knowledge Base · Review Queue · History
- **Bottom:** Admin

Full route inventory (37 page routes). Routes that exist but are **not reachable from the
sidebar** are flagged `⚠ orphan`:

| Area             | Route                                                 | In nav?                                                                            |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dashboard        | `/`                                                   | ✅                                                                                 |
| Opportunities    | `/opportunities`, `/opportunities/[id]`               | ✅ list / detail via list                                                          |
| Opportunity tabs | `/opportunities/[id]/{rfp,gaps,buyer}`                | tabs only                                                                          |
| Recommendations  | `/my-opportunities`                                   | ✅                                                                                 |
| Pipeline         | `/pipeline`                                           | ✅                                                                                 |
| Buyers           | `/buyers`, `/buyers/[buyer]`                          | ✅ list / detail via list                                                          |
| Clients          | `/clients`, `/clients/[id]`, `/clients/[id]/evidence` | ✅ (admin) / deep                                                                  |
| Sources          | `/sources`                                            | ✅ (admin)                                                                         |
| Alerts           | `/alerts`                                             | ✅                                                                                 |
| Profile          | `/profile`                                            | ✅                                                                                 |
| Ask              | `/ask`                                                | ✅                                                                                 |
| RFP processor    | `/rfp`                                                | ⚠ **orphan** (only via opportunity "RFP Response" tab or a query-string deep link) |
| RFP history      | `/rfp/history`                                        | ⚠ **orphan** (only a "View history →" button on `/rfp`)                            |
| Knowledge Base   | `/documents`                                          | ✅                                                                                 |
| Review           | `/review`, `/review/[id]`                             | ✅ / detail via list                                                               |
| Compliance       | `/compliance`, `/compliance/[id]`                     | ⚠ **orphan** (no nav entry at all)                                                 |
| History          | `/history`                                            | ✅                                                                                 |
| Admin            | `/admin`                                              | ✅                                                                                 |
| Demo             | `/demo`                                               | ⚠ intentional (demo only)                                                          |

---

## 2. Navigation findings

**Orphaned primary features.** `/compliance` (compliance matrices) and `/rfp` (the
batch RFP processor) are real, substantial features with no front door in the sidebar.
A user who hasn't drilled into an opportunity may never discover them. `/rfp/history`
is doubly buried (a button on an orphan page).

**Two "answer" entry points, unclear mental model.** `/ask` (single ad-hoc question) and
`/rfp` (batch document) both produce cited answers but feel like separate products. Their
histories are also split: `/history` (Ask) vs `/rfp/history` (RFP runs). Users won't
predict where a past answer lives.

**Admin-gating that fights the workflow.** `/clients` is `adminOnly` in the sidebar, yet
the evidence vault under `/clients/[id]/evidence` is part of the regular gap-analysis flow
(`/opportunities/[id]/gaps`). Non-admins can reach evidence via an opportunity but can't
see Clients in nav — an inconsistent model.

**Naming inconsistencies.** Singular `/profile` next to plural `/opportunities`,
`/buyers`, `/clients`; the lone `my-` prefix on `/my-opportunities`; and the route name
`/rfp` vs its tab label "RFP Response." Minor individually, but they erode predictability.

**Back-navigation is inconsistent.** Some detail pages have a "← Back" link
(`/opportunities/[id]`, `/review/[id]`), others rely on the browser. There are no
breadcrumbs for the 3-level opportunity sub-routes.

---

## 3. Per-surface design notes

- **Opportunity profile (`/opportunities/[id]`).** Now dense: header → lifecycle → AI brief
  → KB cross-ref → details → lots → response card, plus tabs. The new doc-count chip and
  (separately) the buyer web-research panel add value but the page is becoming a long scroll.
  Consider promoting the tab bar to the primary structure and moving "Description/Details/
  Lots" under a tab, so the landing view is a tight summary + actions.
- **Tabs** are link-based (good — deep-linkable) but only on the opportunity. The pipeline,
  profile and compliance pages use bespoke layouts; a shared tab primitive would unify them.
- **Dashboard (`/`)** mixes "respond" widgets and "intelligence" widgets; its relationship to
  `/my-opportunities` (also a personalised list) overlaps.
- **Profile (`/profile`)** just gained a strength meter and four new sections — good; watch
  total length, consider a two-column layout on wide screens.
- **Review (`/review` → `/review/[id]`)** is a clean queue→detail pattern; the strongest IA
  in the app and a good template for Compliance and RFP.

---

## 4. "Open multiple responses at once" — current reality

| Surface                     | Concurrent?                                                | Persistence                                                                                | Concurrency safety                                                                         |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Ask** (`/ask`)            | Yes (each question is its own `queries` row; open in tabs) | Result saved to `query_results`                                                            | n/a (read-only after generation)                                                           |
| **RFP processor** (`/rfp`)  | **No**                                                     | **None — all state is in React memory; navigating away or closing the tab loses the work** | n/a                                                                                        |
| **Review** (`/review/[id]`) | Multiple items can be open in tabs                         | Approved answer persisted on submit                                                        | **No lock / no optimistic concurrency** — two reviewers on the same item = last-write-wins |

**So today: you cannot meaningfully work on two RFP responses at once.** The RFP processor
is a single in-memory document. There is no draft entity, no `/rfp/drafts/[id]`, no autosave,
no "my drafts" list. Review items can be opened side by side but without conflict protection.

---

## 5. The art of the possible — a multi-response workspace

What "open multiple responses at the same time" could become, in increasing ambition:

1. **Persisted RFP drafts (foundation).** Introduce a `response_drafts` entity
   (`org_id`, `opportunity_id?`, `title`, `questions[]`, `answers[]`, `status`, timestamps)
   and route `/rfp/drafts/[id]`. The processor loads/saves a draft; autosave on change.
   Adds a "My responses" list (a natural new sidebar item that also fixes the `/rfp` orphan).
   _Unlocks: leave and return, work on several in parallel via separate URLs/tabs._
2. **A responses workspace / tab strip.** A single `/responses` surface that can hold several
   open drafts as in-app tabs (like an editor), with per-draft progress and a switcher —
   true side-by-side multitasking without juggling browser tabs.
3. **Real-time collaboration.** Multiple users co-editing a draft with presence + locking
   (Supabase Realtime), plus optimistic locking on review approvals to kill last-write-wins.
4. **Draft ↔ pipeline ↔ review integration.** A draft is linked to its bid-pipeline entry and
   can push individual answers into the Review Queue, closing the loop between responding and
   approving.

The **foundation (1)** is the high-leverage step: it fixes data loss, enables concurrency,
removes an orphan, and is a prerequisite for everything above it.

---

## 6. Link hygiene

- No dead/`href="#"` links found in primary nav.
- Query-string-driven entry points (`/rfp?opportunityId=…`, `/ask?q=…`,
  `/opportunities?status=…`) work but are invisible to navigation; filter state isn't
  reflected back in the sidebar.
- The sidebar "Help" control is event-driven (`show-welcome`) with no href — discoverable
  only by hovering.

---

## 7. Prioritised recommendations

**Quick wins (low risk, high clarity):**

- Add **Compliance** to the Intelligence nav group.
- Surface **RFP** (and its history) — either a "Responses" nav item or, better, ship the
  draft foundation (§5.1) and link that.
- Standardise **"← Back"** / add breadcrumbs on all `[id]` and sub-routes.
- Resolve the **`/clients` admin-gating** vs evidence-flow inconsistency (either expose
  Clients to the roles that use evidence, or relabel).

**Medium:**

- Reduce the opportunity-profile scroll by moving Details/Lots/Description under a tab.
- Unify the **Ask vs RFP** mental model and merge/cross-link their histories.
- A shared tab primitive across opportunity / pipeline / compliance.

**Larger bets:**

- The **multi-response workspace** (§5), starting with persisted drafts + autosave.
- Real-time collaboration + review concurrency safety.

---

## 8. Open questions for the user (answer these to unblock build)

1. **Multi-response ambition:** persisted RFP drafts + autosave (§5.1) only, or the full
   tabbed responses workspace (§5.2)? Is real-time multi-user co-editing (§5.3) in scope now
   or later?
2. **Where do "responses" live in nav?** A new top-level "Responses" section (drafts + Ask +
   RFP + histories under one roof), or keep Ask/RFP separate and just de-orphan them?
3. **Compliance & RFP discoverability:** add both to the sidebar now as-is (quick win), or
   fold them into the responses rework?
4. **Roles & gating:** who _should_ see Clients / evidence / admin? Is the current
   admin-only gating intended, or should evidence be available to all responders?
5. **Review concurrency:** is last-write-wins acceptable for now, or do you want
   locking/assignment before more users are added?
6. **Scope of this round:** should I implement the quick wins (§7) next, or hold everything
   until the bigger responses design is decided?
