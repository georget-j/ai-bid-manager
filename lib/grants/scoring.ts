import type { OrganisationProfileRow } from "@/lib/procurement/types";
import type { GrantRow, GrantRecommendedAction } from "./types";

export interface GrantScoringResult {
  fitScore: number; // 0–100 confidence
  readinessScore: number;
  recommendedAction: GrantRecommendedAction;
  eligible: boolean;
  reasons: string[];
  risks: string[];
  missingRequirements: string[];
}

function daysUntil(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null;
  return Math.ceil(
    (new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

/** Tokens describing the org's legal form, for matching grant.eligible_org_types. */
function orgTypeTokens(profile: OrganisationProfileRow): string[] {
  const t = new Set<string>();
  const lf = (profile.legal_form ?? "").toLowerCase();
  const ot = (profile.organisation_type ?? "").toLowerCase();
  if (profile.is_registered_charity || lf.includes("charit")) t.add("charity");
  if (lf.includes("cic") || lf.includes("community interest")) t.add("cic");
  if (lf.includes("compan") || ot.includes("sme") || ot.includes("company"))
    t.add("company");
  if (lf.includes("universit")) t.add("university");
  if (lf.includes("public")) t.add("public-body");
  if (lf.includes("sole") || lf.includes("individual")) t.add("individual");
  if (lf.includes("partner")) t.add("partnership");
  // SME signal from size band
  const band = (profile.company_size_band ?? "").toLowerCase();
  if (band && !band.includes("large")) t.add("sme");
  return [...t];
}

export function scoreGrant(
  grant: GrantRow,
  profile: OrganisationProfileRow,
): GrantScoringResult {
  const reasons: string[] = [];
  const risks: string[] = [];
  const missingRequirements: string[] = [];
  let eligible = true;
  let score = 0;

  const text =
    `${grant.title} ${grant.description ?? ""} ${grant.eligibility_text ?? ""} ${(grant.themes ?? []).join(" ")} ${(grant.sectors ?? []).join(" ")}`.toLowerCase();

  // ── Hard eligibility — org type ────────────────────────────────────────────
  if ((grant.eligible_org_types ?? []).length > 0) {
    const tokens = orgTypeTokens(profile);
    const want = grant.eligible_org_types.map((t) => t.toLowerCase());
    const ok = want.some((w) => tokens.some((tok) => w.includes(tok)));
    if (!ok && tokens.length > 0) {
      eligible = false;
      risks.push(
        `Restricted to ${grant.eligible_org_types.join(", ")} — your organisation type may not qualify.`,
      );
    } else if (ok) {
      reasons.push("Your organisation type is eligible.");
      score += 10;
    }
    // Charity-specific hard stop — only when the org did not already qualify via
    // another allowed type (a grant open to "company OR charity" must not exclude a
    // company just because charity is one of the options).
    if (
      !ok &&
      want.some((w) => w.includes("charit")) &&
      profile.is_registered_charity === false
    ) {
      eligible = false;
      missingRequirements.push(
        "This grant requires registered-charity status — record your charity number in your profile.",
      );
    }
  }

  // ── Theme / sector / keyword alignment — up to 40 ──────────────────────────
  const terms = [
    ...(profile.grant_themes ?? []),
    ...profile.sectors,
    ...profile.keywords,
    ...profile.services,
  ];
  const matches = terms.filter((t) => t && text.includes(t.toLowerCase()));
  if (matches.length > 0) {
    score += Math.min(40, matches.length * 8);
    reasons.push(
      `Matches your themes / sectors: ${[...new Set(matches)].slice(0, 5).join(", ")}`,
    );
  } else if (terms.length > 0) {
    risks.push("No clear theme/sector overlap with your profile.");
  }

  // ── Geography — up to 15 ───────────────────────────────────────────────────
  if ((grant.regions ?? []).length > 0 && profile.regions.length > 0) {
    const overlap = grant.regions.some((gr) =>
      profile.regions.some(
        (pr) =>
          gr.toLowerCase().includes(pr.toLowerCase()) ||
          pr.toLowerCase().includes(gr.toLowerCase()),
      ),
    );
    if (overlap) {
      score += 15;
      reasons.push("Within your target geography.");
    } else {
      risks.push(
        `Geographic focus (${grant.regions.slice(0, 2).join(", ")}) is outside your regions.`,
      );
    }
  } else {
    score += 8; // no geographic restriction or no profile regions
  }

  // ── Social value / beneficiaries — up to 15 ────────────────────────────────
  const impactTerms = [
    ...profile.social_value,
    ...(profile.beneficiaries ?? []),
  ];
  const impactMatches = impactTerms.filter(
    (t) => t && text.includes(t.toLowerCase()),
  );
  if (impactMatches.length > 0) {
    score += Math.min(15, impactMatches.length * 5);
    reasons.push("Aligns with your social-value / beneficiary focus.");
  }

  // ── Match funding — up to 10 ───────────────────────────────────────────────
  if (grant.match_funding_required) {
    if ((profile.match_funding_capacity ?? 0) > 0) {
      score += 10;
      reasons.push("You have match-funding capacity (this grant requires it).");
    } else {
      risks.push("This grant requires match funding.");
      missingRequirements.push(
        "Record your match-funding capacity — this grant requires co-funding.",
      );
    }
  }

  // ── Deadline feasibility (open calls) — up to 12 ───────────────────────────
  const days = daysUntil(grant.deadline_at);
  if (grant.status === "awarded") {
    risks.push("Historical award — not an open application.");
  } else if (days === null) {
    if (grant.status === "open" || grant.status === "rolling") score += 6;
  } else if (days < 0) {
    risks.push("Deadline has passed.");
    score = Math.min(score, 30);
  } else if (days < 7) {
    risks.push(`Deadline is very soon (${days} day${days === 1 ? "" : "s"}).`);
    score += 4;
  } else {
    score += 12;
    reasons.push(`Deadline is feasible (${days} days).`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const readinessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(score * 0.8 + (profile.grant_themes?.length ? 20 : 0)),
    ),
  );

  let recommendedAction: GrantRecommendedAction;
  if (!eligible) recommendedAction = "do-not-apply";
  else if (score >= 75) recommendedAction = "apply";
  else if (score >= 50) recommendedAction = "maybe";
  else if (score >= 30) recommendedAction = "needs-review";
  else recommendedAction = "do-not-apply";

  return {
    fitScore: score,
    readinessScore,
    recommendedAction,
    eligible,
    reasons,
    risks,
    missingRequirements,
  };
}
