import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GET_STARTED_STEPS,
  TENDER_STEPS,
  GRANT_STEPS,
  GRANT_APPLICATION_STEP_NAMES,
  PRIVACY_FACTS,
  ALSO_IN_THE_APP,
  allHelpStrings,
} from "@/components/HelpNavigator";
import { buildApplicationFlow } from "@/lib/grants/application-flow";
import type { GrantRow } from "@/lib/grants/types";
import { crumbLabelFor } from "@/components/AppTopbar";

const HELP_PAGE_SOURCE = readFileSync(
  join(__dirname, "..", "app", "help", "page.tsx"),
  "utf8",
);

// Engineering/internal words that must never reach a non-technical user.
// (Help copy says "evidence library", never "knowledge base" or "KB".)
const JARGON =
  /\b(BM25|pgvector|vectors?|embeddings?|chunks?|reranks?|fusion|RRF|SSE|Zod|schemas?|gpt[-\w]*|LLM|tokens?|tsvector|cosine|semantic|RFP|enum|knowledge base|KB|CPV|pipeline stage|extraction)\b/i;

describe("help drawer content", () => {
  it("contains no engineering jargon in any user-visible string", () => {
    for (const s of allHelpStrings()) {
      expect(s, `jargon found in: "${s}"`).not.toMatch(JARGON);
    }
  });

  it("get-started covers the four setup steps in order, each linking into the app", () => {
    expect(GET_STARTED_STEPS.map((s) => s.actions[0].href)).toEqual([
      "/profile",
      "/documents",
      "/my-opportunities",
      "/opportunities",
    ]);
    for (const step of GET_STARTED_STEPS) {
      expect(step.actions.length).toBeGreaterThan(0);
    }
  });

  it("tenders tab walks find → fit → answer → review → export", () => {
    expect(TENDER_STEPS).toHaveLength(5);
    expect(TENDER_STEPS.map((s) => s.actions[0].href)).toEqual([
      "/opportunities",
      "/my-opportunities",
      "/documents",
      "/review",
      "/responses",
    ]);
  });

  it("grants tab covers find and eligibility, each linking into the app", () => {
    expect(GRANT_STEPS.map((s) => s.actions[0].href)).toEqual([
      "/grants",
      "/my-grants",
    ]);
  });

  it("grant application step names match lib/grants/application-flow.ts exactly", () => {
    const flow = buildApplicationFlow({
      grant: { deadline_at: null } as GrantRow,
      fit: null,
      extractedQuestions: [],
      answers: {},
      selectedIds: [],
      kbDocCount: 0,
    });
    expect(GRANT_APPLICATION_STEP_NAMES).toEqual(
      flow.steps.map((s) => s.label),
    );
  });

  it("states the three privacy facts", () => {
    expect(PRIVACY_FACTS).toHaveLength(3);
    expect(PRIVACY_FACTS.join(" ")).toMatch(/privately/i);
    expect(PRIVACY_FACTS.join(" ")).toMatch(/only your own team/i);
    expect(PRIVACY_FACTS.join(" ")).toMatch(/your organisation's answers/i);
  });

  it("mentions investor events only in the 'Also in the app' aside", () => {
    const asideStrings = new Set([
      ALSO_IN_THE_APP.text,
      ALSO_IN_THE_APP.action.label,
    ]);
    const stray = allHelpStrings().filter(
      (s) => /investor/i.test(s) && !asideStrings.has(s),
    );
    expect(stray).toEqual([]);
    expect(ALSO_IN_THE_APP.text).toMatch(/investor events/i);
    expect(ALSO_IN_THE_APP.action.href).toBe("/investor-events");
  });
});

describe("/help page", () => {
  it("contains no engineering jargon", () => {
    expect(HELP_PAGE_SOURCE).not.toMatch(JARGON);
  });

  it("lists the six grant application steps verbatim", () => {
    const flow = buildApplicationFlow({
      grant: { deadline_at: null } as GrantRow,
      fit: null,
      extractedQuestions: [],
      answers: {},
      selectedIds: [],
      kbDocCount: 0,
    });
    for (const step of flow.steps) {
      expect(HELP_PAGE_SOURCE).toContain(step.label);
    }
  });

  it("states the privacy facts and the honest-AI explanation", () => {
    for (const fact of PRIVACY_FACTS) {
      expect(HELP_PAGE_SOURCE).toContain(fact);
    }
    expect(HELP_PAGE_SOURCE).toContain(
      "draft an answer that cites them. Nothing is made up",
    );
  });

  it("links into the core app pages", () => {
    for (const href of [
      "/profile",
      "/documents",
      "/opportunities",
      "/grants",
      "/my-applications",
      "/review",
    ]) {
      // Links appear either as JSX (href="/x") or in content arrays (href: "/x").
      expect(HELP_PAGE_SOURCE).toMatch(new RegExp(`href[=:]\\s*"${href}"`));
    }
  });

  it("gets a sensible breadcrumb without a CRUMB_MAP entry", () => {
    expect(crumbLabelFor("/help")).toBe("Help");
  });
});
