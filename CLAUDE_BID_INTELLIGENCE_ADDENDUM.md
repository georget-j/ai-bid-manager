# Claude Code Bid Intelligence Addendum

This file is a merge-safe addendum for Claude Code.

Do not overwrite existing repo files blindly.

## Project identity

This existing repo is being converted from an AI RFP response tool into a UK public-sector bid intelligence and RFP response platform.

Working product name:

> UK Bid Intelligence Agent

Core promise:

> Find, qualify, and respond to UK public-sector tenders with AI.

## Number one priority

Security is the number one priority.

The current app handles or will handle sensitive RFP documents, knowledge-base content, embeddings, citations, generated answers, review queue items, bid pipeline data, organisation profiles, and procurement analysis.

Claude Code must treat authentication, authorisation, tenant isolation, RLS, document privacy, safe RAG retrieval, and admin route protection as phase-gating requirements.

## Required reading before coding

Before making plans or code changes, read:

- docs/claude-code-bid-intelligence/BUILD_BRIEF.md
- docs/claude-code-bid-intelligence/PROJECT_GOALS.md
- docs/claude-code-bid-intelligence/IMPLEMENTATION_STATE.md
- docs/claude-code-bid-intelligence/SECURITY_REQUIREMENTS.md
- docs/claude-code-bid-intelligence/ARCHITECTURE_DECISIONS.md
- docs/claude-code-bid-intelligence/NEXT_ACTIONS.md
- docs/claude-code-bid-intelligence/CHANGELOG.md
- docs/claude-code-bid-intelligence/CLAUDE_CODE_PROMPTS.md

Also inspect any existing project instruction files such as:

- CLAUDE.md
- .claude/*
- README.md
- existing docs/*

## Merge rule

If an existing `CLAUDE.md` or `.claude` instruction file already exists:

1. Do not replace it.
2. Read it.
3. Merge these security-first and continuity instructions into it.
4. Preserve existing project-specific instructions.
5. Record the merge in docs/claude-code-bid-intelligence/CHANGELOG.md.

If no `CLAUDE.md` exists, Claude Code may create one using this addendum and the continuity protocol.

## Continuity rule

Because Claude Code may compact context, repo files are the source of truth.

At the start of every future session, re-read the continuity files in:

```text
docs/claude-code-bid-intelligence/
```

At the end of every meaningful session, update:

- IMPLEMENTATION_STATE.md
- NEXT_ACTIONS.md
- CHANGELOG.md
- ARCHITECTURE_DECISIONS.md if a decision was made
- SECURITY_REQUIREMENTS.md if a new risk was found
