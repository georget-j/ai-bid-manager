import type {
  OpportunityRow,
  OrganisationProfileRow,
  OpportunityMatchRow,
  RecommendedAction,
} from "./types";

export interface ScoringResult {
  fitScore: number;
  readinessScore: number;
  recommendedAction: RecommendedAction;
  reasons: string[];
  risks: string[];
  missingRequirements: string[];
}

function daysUntilDeadline(deadlineAt: string | null): number | null {
  if (!deadlineAt) return null;
  return Math.ceil(
    (new Date(deadlineAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

function recommendAction(score: number, risks: string[]): RecommendedAction {
  const hasUrgentRisk = risks.some(
    (r) =>
      r.includes("very soon") ||
      r.includes("excluded keyword") ||
      r.includes("Mandatory certification"),
  );
  if (hasUrgentRisk && score < 70) return "needs-review";
  if (score >= 80) return "bid";
  if (score >= 60) return "maybe";
  if (score >= 40) return "needs-review";
  return "do-not-bid";
}

export function scoreOpportunity(
  opp: OpportunityRow,
  profile: OrganisationProfileRow,
): ScoringResult {
  const reasons: string[] = [];
  const risks: string[] = [];
  const missingRequirements: string[] = [];
  let score = 0;

  const text = `${opp.title} ${opp.description ?? ""}`.toLowerCase();

  // CPV match — 20 pts
  const cpvMatches = (opp.cpv_codes ?? []).filter((code) =>
    profile.cpv_codes.includes(code),
  );
  if (cpvMatches.length > 0) {
    score += 20;
    reasons.push(`Matches target CPV codes: ${cpvMatches.join(", ")}`);
  } else if (profile.cpv_codes.length > 0) {
    risks.push("No matching CPV codes found.");
    missingRequirements.push(
      "Verify whether your services fall under alternative CPV codes for this opportunity.",
    );
  }

  // Keyword / service / sector match — up to 20 pts.
  // Sectors are folded in here so they contribute without inflating the 100-pt ceiling.
  const keywords = [
    ...profile.keywords,
    ...profile.services,
    ...profile.sectors,
  ];
  const keywordMatches = keywords.filter((kw) =>
    text.includes(kw.toLowerCase()),
  );
  if (keywordMatches.length > 0) {
    const pts = Math.min(20, keywordMatches.length * 5);
    score += pts;
    reasons.push(
      `Matches your services / sectors: ${[...new Set(keywordMatches)].slice(0, 5).join(", ")}`,
    );
  }

  // Region match — 10 pts
  const oppRegion = opp.region ?? opp.buyer_region;
  if (oppRegion && profile.regions.length > 0) {
    if (
      profile.regions.some((r) =>
        oppRegion.toLowerCase().includes(r.toLowerCase()),
      )
    ) {
      score += 10;
      reasons.push(`Matches target region: ${oppRegion}`);
    } else {
      risks.push(
        `Opportunity region (${oppRegion}) is outside your target regions.`,
      );
    }
  } else if (profile.regions.length === 0) {
    score += 5;
    reasons.push(
      "No region restriction set — opportunity is geographically eligible.",
    );
  }

  // Preferred buyer — 10 pts
  if (opp.buyer_name && profile.preferred_buyers.length > 0) {
    if (
      profile.preferred_buyers.some((b) =>
        opp.buyer_name!.toLowerCase().includes(b.toLowerCase()),
      )
    ) {
      score += 10;
      reasons.push(`Buyer matches preferred buyer list.`);
    }
  }

  // Contract value fit — 10 pts
  const value = opp.value_amount ? Number(opp.value_amount) : null;
  if (value !== null) {
    const minOk =
      !profile.min_contract_value || value >= profile.min_contract_value;
    const maxOk =
      !profile.max_contract_value || value <= profile.max_contract_value;
    if (minOk && maxOk) {
      score += 10;
      reasons.push("Contract value is within your target range.");
    } else if (!minOk) {
      risks.push(
        `Contract value (£${value.toLocaleString()}) is below your minimum (£${profile.min_contract_value?.toLocaleString()}).`,
      );
    } else {
      risks.push(
        `Contract value (£${value.toLocaleString()}) exceeds your maximum (£${profile.max_contract_value?.toLocaleString()}).`,
      );
    }
  } else {
    risks.push("No contract value specified for this opportunity.");
  }

  // Financial standing — turnover vs contract value (informational risk, no score change).
  // UK buyers commonly cap a single contract at ~50% of supplier turnover
  // (i.e. require turnover of roughly 2× the annual contract value).
  if (profile.annual_turnover && value !== null) {
    if (value > profile.annual_turnover * 0.5) {
      risks.push(
        `Contract value (£${value.toLocaleString()}) is high relative to your annual turnover (£${profile.annual_turnover.toLocaleString()}) — buyers often require turnover of ~2× the contract value.`,
      );
      missingRequirements.push(
        "Check the financial-standing / minimum-turnover requirement before bidding.",
      );
    } else {
      reasons.push(
        "Contract value is comfortably within your financial capacity.",
      );
    }
  }

  // Insurance signal — surface a gap when the tender references insurance and none is on file.
  if (/insurance|indemnity|liability/.test(text)) {
    const ins = profile.insurance;
    const hasCover = Boolean(
      ins &&
      (ins.professional_indemnity ||
        ins.public_liability ||
        ins.employers_liability),
    );
    if (hasCover) {
      reasons.push(
        "Insurance cover is on file (this tender references insurance requirements).",
      );
    } else {
      missingRequirements.push(
        "Record your insurance cover (professional indemnity, public & employers' liability) — this tender references insurance requirements.",
      );
    }
  }

  // Evidence / readiness — up to 20 pts (heuristic: certs + accreditations present)
  const evidenceScore =
    Math.min(10, profile.certifications.length * 3) +
    Math.min(10, profile.accreditations.length * 3);
  score += Math.min(20, evidenceScore);
  if (evidenceScore < 10) {
    missingRequirements.push(
      "Add your certifications and accreditations to your organisation profile to improve your readiness score.",
    );
  } else {
    reasons.push("Organisation has certifications and accreditations on file.");
  }

  // Deadline feasibility — up to 10 pts
  const days = daysUntilDeadline(opp.deadline_at);
  if (days === null) {
    risks.push("No clear deadline found for this opportunity.");
  } else if (days < 0) {
    risks.push("Deadline has passed.");
    score = Math.min(score, 30);
  } else if (days < 7) {
    risks.push(`Deadline is very soon (${days} day${days === 1 ? "" : "s"}).`);
    score = Math.min(score, 50);
  } else if (days <= 21) {
    score += 5;
    reasons.push(`Deadline is approaching (${days} days).`);
  } else {
    score += 10;
    reasons.push(`Deadline is feasible (${days} days).`);
  }

  // Excluded keywords — cap score
  for (const excluded of profile.excluded_keywords) {
    if (text.includes(excluded.toLowerCase())) {
      risks.push(`Contains excluded keyword: "${excluded}"`);
      score = Math.min(score, 20);
    }
  }

  // Excluded buyers — cap score
  if (
    opp.buyer_name &&
    profile.excluded_buyers.some((b) =>
      opp.buyer_name!.toLowerCase().includes(b.toLowerCase()),
    )
  ) {
    risks.push(`Buyer "${opp.buyer_name}" is on your excluded buyers list.`);
    score = Math.min(score, 10);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const readinessScore = Math.max(
    0,
    Math.min(100, Math.round(score * 0.7 + Math.min(20, evidenceScore) * 1.5)),
  );

  return {
    fitScore: score,
    readinessScore,
    recommendedAction: recommendAction(score, risks),
    reasons,
    risks,
    missingRequirements,
  };
}

export function scoringResultToMatchRow(
  result: ScoringResult,
  opportunityId: string,
  orgId: string,
): Omit<OpportunityMatchRow, "id" | "created_at"> {
  return {
    opportunity_id: opportunityId,
    org_id: orgId,
    fit_score: result.fitScore,
    readiness_score: result.readinessScore,
    recommended_action: result.recommendedAction,
    reasons: result.reasons,
    risks: result.risks,
    missing_requirements: result.missingRequirements,
  };
}
