// The "Get set up" checklist on the home page — the four things a new user does, in
// order, before the app becomes useful: profile → evidence → matches → first response.
//
// Modelled on lib/grants/application-flow.ts: a pure derivation from facts the page
// already has. Nothing is stored — every visit recomputes the steps, so they stay
// honest as the user's data changes. Plain English only (lib/grants/copy.ts ethos).

import type { OrganisationProfileRow } from "@/lib/procurement/types";

export type SetupStepKey = "profile" | "evidence" | "matches" | "respond";
export type SetupStepStatus = "done" | "todo";

export interface SetupStep {
  key: SetupStepKey;
  number: number;
  label: string; // plain-English title
  help: string; // one-line guidance
  href: string; // where to go to do (or see) it
  status: SetupStepStatus;
  detail: string; // short status string ("2 documents added")
}

export interface SetupFlow {
  steps: SetupStep[];
  doneCount: number;
  allDone: boolean;
  /** First step that isn't done — what the "Next:" CTA points at. */
  nextStep: SetupStep | null;
  /** 0–100 share of steps complete. */
  progress: number;
}

export interface SetupFlowInput {
  profileExists: boolean;
  /** 0–100 — see profileCompletenessPct below. */
  profileCompletenessPct: number;
  kbDocCount: number;
  tenderMatchCount: number;
  grantMatchCount: number;
  hasAnyDraft: boolean;
}

/** "2–3 documents" is the honest minimum for grounded answers — one isn't enough. */
export const EVIDENCE_DOC_TARGET = 2;

export function buildSetupFlow(input: SetupFlowInput): SetupFlow {
  const {
    profileExists,
    profileCompletenessPct: pct,
    kbDocCount,
    tenderMatchCount,
    grantMatchCount,
    hasAnyDraft,
  } = input;

  const matchCount = tenderMatchCount + grantMatchCount;

  const steps: SetupStep[] = [];

  // 1 — profile. Saved at all = done; the detail nudges towards completeness
  // because every empty field limits what we can match.
  steps.push({
    key: "profile",
    number: 1,
    label: "Add your organisation profile",
    help: "Tell us what you do, where you work, and who you help — it powers every match.",
    href: "/profile",
    status: profileExists ? "done" : "todo",
    detail: !profileExists
      ? "Takes about 5 minutes"
      : pct >= 80
        ? `${pct}% complete`
        : `${pct}% complete — more detail means better matches`,
  });

  // 2 — evidence. One document is a start but answers drawn from a single source
  // read thin, so the step only completes at EVIDENCE_DOC_TARGET.
  const evidenceDone = kbDocCount >= EVIDENCE_DOC_TARGET;
  steps.push({
    key: "evidence",
    number: 2,
    label: "Upload 2–3 evidence documents",
    help: "Case studies, policies and past answers — your drafts are built from these.",
    href: "/documents",
    status: evidenceDone ? "done" : "todo",
    detail: evidenceDone
      ? `${kbDocCount} document${kbDocCount === 1 ? "" : "s"} added`
      : kbDocCount === 1
        ? "1 added — a couple more gives your answers more to draw on"
        : "Nothing added yet",
  });

  // 3 — matches. Derived, not clicked: it completes the moment matching finds
  // anything. Link to whichever side actually has results.
  const matchesDone = matchCount > 0;
  const matchesHref =
    tenderMatchCount === 0 && grantMatchCount > 0
      ? "/my-grants"
      : "/my-opportunities";
  steps.push({
    key: "matches",
    number: 3,
    label: "See your matches",
    help: "Open tenders and grants that look like a fit for your organisation.",
    href: matchesHref,
    status: matchesDone ? "done" : "todo",
    detail: matchesDone
      ? [
          tenderMatchCount > 0
            ? `${tenderMatchCount} tender${tenderMatchCount === 1 ? "" : "s"}`
            : null,
          grantMatchCount > 0
            ? `${grantMatchCount} grant${grantMatchCount === 1 ? "" : "s"}`
            : null,
        ]
          .filter(Boolean)
          .join(" and ") +
        (matchCount === 1 ? " looks like a fit" : " look like a fit")
      : profileExists
        ? "No matches yet — they appear as new tenders and grants arrive"
        : "Add your profile first and we'll find them",
  });

  // 4 — first response.
  steps.push({
    key: "respond",
    number: 4,
    label: "Start your first response",
    help: "Pick a match and we'll guide you through it question by question.",
    href: grantMatchCount > 0 ? "/my-grants" : "/my-opportunities",
    status: hasAnyDraft ? "done" : "todo",
    detail: hasAnyDraft
      ? "First response started — keep going"
      : matchesDone
        ? "Choose one of your matches to begin"
        : "Unlocks once you have matches",
  });

  const doneCount = steps.filter((s) => s.status === "done").length;

  return {
    steps,
    doneCount,
    allDone: doneCount === steps.length,
    nextStep: steps.find((s) => s.status !== "done") ?? null,
    progress: Math.round((doneCount / steps.length) * 100),
  };
}

// ── profile completeness ──────────────────────────────────────────────────────

/** The scoring-relevant profile fields, mirroring the meter on /profile. */
export type ProfileCompletenessFields = Pick<
  OrganisationProfileRow,
  | "cpv_codes"
  | "services"
  | "keywords"
  | "sectors"
  | "regions"
  | "certifications"
  | "accreditations"
  | "min_contract_value"
  | "max_contract_value"
  | "company_size_band"
  | "annual_turnover"
  | "delivery_models"
  | "insurance"
  | "legal_form"
  | "grant_themes"
>;

/**
 * 0–100 share of scoring-relevant profile fields that are filled in. The same
 * fields the /profile page meter counts, computed from the stored row shape
 * (arrays, not comma-separated form strings) so the server can reuse it.
 */
export function profileCompletenessPct(
  p: ProfileCompletenessFields | null,
): number {
  if (!p) return 0;
  const filled: boolean[] = [
    p.cpv_codes.length > 0,
    p.services.length > 0,
    p.keywords.length > 0,
    p.sectors.length > 0,
    p.regions.length > 0,
    p.certifications.length > 0,
    p.accreditations.length > 0,
    p.min_contract_value != null || p.max_contract_value != null,
    !!p.company_size_band,
    p.annual_turnover != null,
    p.delivery_models.length > 0,
    p.insurance != null && Object.values(p.insurance).some((v) => v != null),
    !!p.legal_form,
    p.grant_themes.length > 0,
  ];
  return Math.round((filled.filter(Boolean).length / filled.length) * 100);
}
