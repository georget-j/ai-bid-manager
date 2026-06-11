// The "Get set up" checklist on the home page — the four things a new user does, in
// order, before the app becomes useful: profile → evidence → matches → first response.
//
// Modelled on lib/grants/application-flow.ts: a pure derivation from facts the page
// already has. Nothing is stored — every visit recomputes the steps, so they stay
// honest as the user's data changes. Plain English only (lib/grants/copy.ts ethos).

import {
  INSURANCE_LINES,
  normaliseInsurance,
  type OrganisationProfileRow,
} from "@/lib/procurement/types";

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
//
// The single source of truth for "how complete is this profile". The /profile
// page meter, the home checklist, and the AI-fill card all read from here, so
// the numbers never disagree. Fields are grouped into plain-English sections;
// the overall percentage is a weighted blend (matching fields count most —
// they drive recommendations — business credentials count too because bids
// fail compliance checks without them).

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
> &
  // Optional so partial rows (pre-070, or older callers) still work.
  Partial<
    Pick<
      OrganisationProfileRow,
      | "company_number"
      | "year_established"
      | "website"
      | "vat_number"
      | "registered_address"
      | "incorporation_date"
      | "sic_codes"
      | "employee_count"
      | "key_people"
      | "memberships"
      | "frameworks"
      | "policies"
      | "carbon_reduction_plan"
    >
  >;

export type ProfileSectionId =
  | "what-you-do"
  | "registered-details"
  | "financial"
  | "insurance"
  | "credentials"
  | "people"
  | "policies"
  | "grant-readiness";

export interface ProfileSection {
  id: ProfileSectionId;
  /** Plain-English section heading, shared by the profile page and AI fill. */
  label: string;
  /** 0–100 share of this section's fields that are filled in. */
  pct: number;
  /** Plain-English labels of the fields still empty. */
  missing: string[];
}

interface SectionDef {
  id: ProfileSectionId;
  label: string;
  /** Relative share of the overall percentage. */
  weight: number;
  checks: { label: string; filled: boolean }[];
}

function sectionDefs(p: ProfileCompletenessFields): SectionDef[] {
  const insurance = normaliseInsurance(p.insurance);
  const coveredLines = INSURANCE_LINES.filter(
    (line) => insurance?.[line]?.amount != null,
  );
  const address = p.registered_address;
  const hasAddress =
    address != null &&
    Object.values(address).some((v) => typeof v === "string" && v.trim());

  return [
    {
      id: "what-you-do",
      label: "What you do",
      weight: 4,
      checks: [
        { label: "Services", filled: p.services.length > 0 },
        { label: "Sectors", filled: p.sectors.length > 0 },
        { label: "Keywords", filled: p.keywords.length > 0 },
        { label: "CPV codes", filled: p.cpv_codes.length > 0 },
        { label: "Regions you cover", filled: p.regions.length > 0 },
        { label: "Delivery models", filled: p.delivery_models.length > 0 },
      ],
    },
    {
      id: "registered-details",
      label: "Registered details",
      weight: 3,
      checks: [
        { label: "Company number", filled: !!p.company_number },
        { label: "Registered address", filled: hasAddress },
        {
          label: "Incorporation date",
          filled: !!p.incorporation_date || p.year_established != null,
        },
        { label: "SIC codes", filled: (p.sic_codes?.length ?? 0) > 0 },
        { label: "VAT number", filled: !!p.vat_number },
        { label: "Website", filled: !!p.website },
      ],
    },
    {
      id: "financial",
      label: "Financial standing",
      weight: 2,
      checks: [
        { label: "Annual turnover", filled: p.annual_turnover != null },
        {
          label: "Contract value range",
          filled: p.min_contract_value != null || p.max_contract_value != null,
        },
      ],
    },
    {
      id: "insurance",
      label: "Insurance",
      weight: 3,
      checks: [
        {
          label: "Professional indemnity cover",
          filled: insurance?.professional_indemnity?.amount != null,
        },
        {
          label: "Public liability cover",
          filled: insurance?.public_liability?.amount != null,
        },
        {
          label: "Employers' liability cover",
          filled: insurance?.employers_liability?.amount != null,
        },
        {
          // Buyers reject cover they can't verify is current, so expiry dates
          // count as a field of their own.
          label: "Expiry dates for each policy",
          filled:
            coveredLines.length > 0 &&
            coveredLines.every((line) => !!insurance?.[line]?.expires_at),
        },
      ],
    },
    {
      id: "credentials",
      label: "Credentials and memberships",
      weight: 3,
      checks: [
        { label: "Certifications", filled: p.certifications.length > 0 },
        { label: "Accreditations", filled: p.accreditations.length > 0 },
        { label: "Memberships", filled: (p.memberships?.length ?? 0) > 0 },
        { label: "Framework places", filled: (p.frameworks?.length ?? 0) > 0 },
      ],
    },
    {
      id: "people",
      label: "Your team",
      weight: 2,
      checks: [
        { label: "Company size", filled: !!p.company_size_band },
        { label: "Number of employees", filled: p.employee_count != null },
        { label: "Key people", filled: (p.key_people?.length ?? 0) > 0 },
      ],
    },
    {
      id: "policies",
      label: "Policies",
      weight: 2,
      checks: [
        { label: "Policy documents", filled: (p.policies?.length ?? 0) > 0 },
        {
          // A "no" answer is still an answer — only unanswered counts as missing.
          label: "Carbon reduction plan",
          filled: p.carbon_reduction_plan != null,
        },
      ],
    },
    {
      id: "grant-readiness",
      label: "Grant readiness",
      weight: 2,
      checks: [
        { label: "Legal form", filled: !!p.legal_form },
        { label: "Grant themes", filled: p.grant_themes.length > 0 },
      ],
    },
  ];
}

const EMPTY_PROFILE: ProfileCompletenessFields = {
  cpv_codes: [],
  services: [],
  keywords: [],
  sectors: [],
  regions: [],
  certifications: [],
  accreditations: [],
  min_contract_value: null,
  max_contract_value: null,
  company_size_band: null,
  annual_turnover: null,
  delivery_models: [],
  insurance: null,
  legal_form: null,
  grant_themes: [],
};

/**
 * Per-section completeness breakdown — what the profile page renders next to
 * each section and what the AI fill uses to decide which gaps to chase.
 */
export function computeProfileSections(
  p: ProfileCompletenessFields | null,
): ProfileSection[] {
  return sectionDefs(p ?? EMPTY_PROFILE).map((def) => ({
    id: def.id,
    label: def.label,
    pct: Math.round(
      (def.checks.filter((c) => c.filled).length / def.checks.length) * 100,
    ),
    missing: def.checks.filter((c) => !c.filled).map((c) => c.label),
  }));
}

/**
 * 0–100 weighted completeness across every section. Computed from the stored
 * row shape (arrays, not comma-separated form strings) so the server can
 * reuse it.
 */
export function profileCompletenessPct(
  p: ProfileCompletenessFields | null,
): number {
  if (!p) return 0;
  const defs = sectionDefs(p);
  const totalWeight = defs.reduce((sum, def) => sum + def.weight, 0);
  const score = defs.reduce(
    (sum, def) =>
      sum +
      (def.weight * def.checks.filter((c) => c.filled).length) /
        def.checks.length,
    0,
  );
  return Math.round((score / totalWeight) * 100);
}
