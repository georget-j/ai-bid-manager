# Prompts to Run in Claude Code

Use these prompts in order.

---

# Prompt 1 — Merge-safe setup and repo audit

```text
Read CLAUDE_BID_INTELLIGENCE_ADDENDUM.md first.

Then read every file in:

docs/claude-code-bid-intelligence/

This is an existing repo, not a greenfield build:
https://github.com/georget-j/ai-bid-manager

Important:
- Do not overwrite existing files blindly.
- Inspect existing `CLAUDE.md`, `.claude/*`, README.md, and docs/* first.
- If existing Claude/project instruction files exist, merge these instructions into them carefully rather than replacing them.
- Preserve existing documentation.
- Security is the number one priority.

Begin Phase 0 only.

Do not implement product features yet.

Your tasks:

1. Inspect the existing repository structure.
2. Identify any existing Claude/project instruction files:
   - CLAUDE.md
   - .claude/*
   - docs/*
   - README.md
3. Recommend or perform the safest merge:
   - If CLAUDE.md exists, append a concise reference to this addendum and the continuity folder.
   - If CLAUDE.md does not exist, create one based on the addendum.
   - Do not replace README.md.
   - Do not replace existing docs.
4. Inspect:
   - package.json
   - app/
   - app/api/
   - components/
   - lib/
   - middleware.ts
   - supabase/migrations/
   - tests/
   - .env.example
   - README.md
5. Identify:
   - framework, routes, data layer, AI/RAG logic, and workflows
   - existing Supabase schema and migrations
   - existing API routes and whether they are protected
   - document upload, chunking, embeddings, retrieval, citations, RFP runs, review queue, and admin flows
6. Identify security gaps around:
   - authentication
   - authorisation
   - tenant/workspace isolation
   - Supabase RLS
   - document privacy
   - service role key usage
   - RAG retrieval scoping
   - citation leakage
   - admin/source sync protection
   - upload validation
   - XSS from user/source-provided content
   - secrets handling
7. Produce a repo-specific implementation plan.

After the audit:
- Update docs/claude-code-bid-intelligence/IMPLEMENTATION_STATE.md.
- Update docs/claude-code-bid-intelligence/NEXT_ACTIONS.md.
- Update docs/claude-code-bid-intelligence/CHANGELOG.md.
- Update docs/claude-code-bid-intelligence/ARCHITECTURE_DECISIONS.md if needed.
- Update docs/claude-code-bid-intelligence/SECURITY_REQUIREMENTS.md if new risks are found.

Do not start Phase 1 until the audit and safe merge are complete.
```

---

# Prompt 2 — Security foundation plan

```text
Continue from docs/claude-code-bid-intelligence/NEXT_ACTIONS.md.

Before coding, re-read:
- CLAUDE_BID_INTELLIGENCE_ADDENDUM.md
- docs/claude-code-bid-intelligence/BUILD_BRIEF.md
- docs/claude-code-bid-intelligence/PROJECT_GOALS.md
- docs/claude-code-bid-intelligence/IMPLEMENTATION_STATE.md
- docs/claude-code-bid-intelligence/SECURITY_REQUIREMENTS.md
- docs/claude-code-bid-intelligence/ARCHITECTURE_DECISIONS.md
- docs/claude-code-bid-intelligence/NEXT_ACTIONS.md
- docs/claude-code-bid-intelligence/CHANGELOG.md

Create the Phase 0.5 security foundation plan.

Do not implement procurement features yet.

Produce a concrete, repo-specific plan for:
1. Authentication.
2. User and organisation/workspace model.
3. Supabase RLS.
4. Organisation-scoped documents.
5. Organisation-scoped chunks and embeddings.
6. Organisation-scoped RFP runs.
7. Organisation-scoped review queue items.
8. Organisation-scoped history/query results.
9. Admin-only route protection.
10. Upload validation.
11. Safe rendering and XSS prevention.
12. Rate limiting for AI, upload, sync, and extraction endpoints.
13. Audit logging.
14. Migration strategy that avoids breaking existing demo data.

Then update the continuity files.

Stop after the plan unless NEXT_ACTIONS.md explicitly says to implement.
```

---

# Prompt 3 — Begin implementation safely

```text
Continue from docs/claude-code-bid-intelligence/NEXT_ACTIONS.md.

Before coding, re-read the continuity files in docs/claude-code-bid-intelligence/.

Begin the next task listed in NEXT_ACTIONS.md.

Rules:
- Security remains the number one priority.
- Do not rewrite the app.
- Do not overwrite existing docs or instructions.
- Preserve existing RFP/RAG workflows.
- Keep changes small and incremental.
- After changes, run relevant tests or document why tests were not run.
- Update all continuity files at the end.
```

---

# Prompt 4 — Future session restart

```text
Context may have compacted. Do not continue from memory.

Re-read:
- CLAUDE_BID_INTELLIGENCE_ADDENDUM.md
- docs/claude-code-bid-intelligence/BUILD_BRIEF.md
- docs/claude-code-bid-intelligence/PROJECT_GOALS.md
- docs/claude-code-bid-intelligence/IMPLEMENTATION_STATE.md
- docs/claude-code-bid-intelligence/SECURITY_REQUIREMENTS.md
- docs/claude-code-bid-intelligence/ARCHITECTURE_DECISIONS.md
- docs/claude-code-bid-intelligence/NEXT_ACTIONS.md
- docs/claude-code-bid-intelligence/CHANGELOG.md

Then summarise:
1. Current product goal.
2. Current phase.
3. Completed work.
4. Next action.
5. Security constraints.
6. Files likely to be touched next.

Then continue only from NEXT_ACTIONS.md.
```
