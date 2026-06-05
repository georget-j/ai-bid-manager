// Vertical evidence checklists and readiness scoring.
// Each checklist item specifies the expected evidence type and keywords to
// match against evidence_items.title + evidence_items.notes (case-insensitive).
// weight: 3 = must-have, 2 = important, 1 = good-to-have

export type Coverage = "covered" | "expiring_soon" | "expired" | "missing";

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  evidence_type: string;
  weight: 1 | 2 | 3;
  keywords: string[];
}

export interface ChecklistResult {
  item: ChecklistItem;
  coverage: Coverage;
  matched_evidence_id: string | null;
  matched_evidence_title: string | null;
}

export interface ReadinessScore {
  score: number; // 0–100
  covered: number;
  expiring_soon: number;
  expired: number;
  missing: number;
  total_items: number;
  results: ChecklistResult[];
}

// ── Vertical checklists ───────────────────────────────────────────────────────

const IT_CYBER: ChecklistItem[] = [
  {
    id: "cyber_essentials",
    title: "Cyber Essentials certification",
    description: "IASME / NCSC Cyber Essentials or Cyber Essentials Plus",
    evidence_type: "certification",
    weight: 3,
    keywords: ["cyber essentials", "cyber essential"],
  },
  {
    id: "iso27001",
    title: "ISO 27001 certification",
    description: "Information security management system certification",
    evidence_type: "certification",
    weight: 3,
    keywords: ["iso 27001", "iso27001", "27001"],
  },
  {
    id: "gdpr_policy",
    title: "Data protection / GDPR policy",
    description: "Written policy covering GDPR compliance and data handling",
    evidence_type: "policy",
    weight: 2,
    keywords: ["gdpr", "data protection", "privacy policy"],
  },
  {
    id: "security_policy",
    title: "Information security policy",
    description: "Documented organisational information security policy",
    evidence_type: "policy",
    weight: 2,
    keywords: ["information security", "security policy", "infosec"],
  },
  {
    id: "bcp",
    title: "Business continuity / disaster recovery plan",
    description: "Plan for maintaining operations in the event of disruption",
    evidence_type: "policy",
    weight: 2,
    keywords: [
      "business continuity",
      "disaster recovery",
      "bcp",
      "bcdr",
      "continuity plan",
    ],
  },
  {
    id: "pi_insurance",
    title: "Professional indemnity insurance",
    description: "Current professional indemnity certificate (min. £1m)",
    evidence_type: "financial",
    weight: 3,
    keywords: [
      "professional indemnity",
      "pi insurance",
      "professional liability",
    ],
  },
  {
    id: "pl_insurance",
    title: "Public liability insurance",
    description: "Current public liability certificate",
    evidence_type: "financial",
    weight: 2,
    keywords: ["public liability", "pl insurance"],
  },
  {
    id: "case_study",
    title: "Public sector case study",
    description:
      "At least one reference or case study from a public sector project",
    evidence_type: "case_study",
    weight: 2,
    keywords: [
      "public sector",
      "government",
      "council",
      "nhs",
      "local authority",
    ],
  },
  {
    id: "gcloud",
    title: "G-Cloud or framework accreditation",
    description: "G-Cloud, DOS, or Crown Commercial Service supplier listing",
    evidence_type: "accreditation",
    weight: 1,
    keywords: [
      "g-cloud",
      "gcloud",
      "crown commercial",
      "dos",
      "digital marketplace",
    ],
  },
];

const FACILITIES: ChecklistItem[] = [
  {
    id: "iso9001",
    title: "ISO 9001 quality management",
    description: "Quality management system certification",
    evidence_type: "certification",
    weight: 3,
    keywords: ["iso 9001", "iso9001", "quality management"],
  },
  {
    id: "iso14001",
    title: "ISO 14001 environmental management",
    description: "Environmental management system certification",
    evidence_type: "certification",
    weight: 2,
    keywords: ["iso 14001", "iso14001", "environmental management"],
  },
  {
    id: "contractors_all_risk",
    title: "Contractors all risk insurance",
    description:
      "Current contractors all risk or employers liability certificate",
    evidence_type: "financial",
    weight: 3,
    keywords: [
      "contractors all risk",
      "employers liability",
      "employer liability",
    ],
  },
  {
    id: "pl_insurance",
    title: "Public liability insurance (min. £5m)",
    description:
      "Public liability certificate for facilities / maintenance work",
    evidence_type: "financial",
    weight: 3,
    keywords: ["public liability"],
  },
  {
    id: "dbs",
    title: "DBS / enhanced disclosure policy",
    description: "Policy for staff vetting and DBS checks",
    evidence_type: "policy",
    weight: 2,
    keywords: ["dbs", "disclosure", "barring", "vetting", "crb"],
  },
  {
    id: "health_safety",
    title: "Health & safety policy",
    description: "Written health and safety policy statement",
    evidence_type: "policy",
    weight: 3,
    keywords: ["health and safety", "health & safety", "h&s", "safety policy"],
  },
  {
    id: "case_study",
    title: "Public sector case study",
    description:
      "Reference or case study from a public sector facilities contract",
    evidence_type: "case_study",
    weight: 2,
    keywords: [
      "public sector",
      "council",
      "nhs",
      "government",
      "local authority",
    ],
  },
];

export const VERTICAL_CHECKLISTS: Record<string, ChecklistItem[]> = {
  it_cyber: IT_CYBER,
  facilities: FACILITIES,
};

export const VERTICAL_NAMES: Record<string, string> = {
  it_cyber: "IT / Cyber",
  facilities: "Facilities Management",
  construction: "Construction",
  healthcare: "Healthcare",
  education: "Education",
  professional_services: "Professional Services",
  other: "Other",
};

// ── Scoring ───────────────────────────────────────────────────────────────────

interface EvidenceRow {
  id: string;
  title: string;
  evidence_type: string;
  status: string;
  notes: string | null;
}

function matchesItem(ev: EvidenceRow, item: ChecklistItem): boolean {
  if (ev.evidence_type !== item.evidence_type) return false;
  if (item.keywords.length === 0) return true; // type-only match
  const haystack = `${ev.title} ${ev.notes ?? ""}`.toLowerCase();
  return item.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

export function scoreReadiness(
  vertical: string,
  evidenceItems: EvidenceRow[],
): ReadinessScore {
  const checklist = VERTICAL_CHECKLISTS[vertical];
  if (!checklist) {
    return {
      score: 0,
      covered: 0,
      expiring_soon: 0,
      expired: 0,
      missing: 0,
      total_items: 0,
      results: [],
    };
  }

  let totalWeight = 0;
  let coveredWeight = 0;
  let covered = 0;
  let expiring = 0;
  let expired = 0;
  let missing = 0;

  const results: ChecklistResult[] = checklist.map((item) => {
    totalWeight += item.weight;
    const matches = evidenceItems.filter((ev) => matchesItem(ev, item));

    let coverage: Coverage = "missing";
    let matchedId: string | null = null;
    let matchedTitle: string | null = null;

    if (matches.length > 0) {
      const validMatch = matches.find((m) => m.status === "valid");
      const expiringMatch = matches.find((m) => m.status === "expiring_soon");
      const expiredMatch = matches.find((m) => m.status === "expired");

      if (validMatch) {
        coverage = "covered";
        matchedId = validMatch.id;
        matchedTitle = validMatch.title;
        coveredWeight += item.weight;
        covered++;
      } else if (expiringMatch) {
        coverage = "expiring_soon";
        matchedId = expiringMatch.id;
        matchedTitle = expiringMatch.title;
        coveredWeight += item.weight * 0.5;
        expiring++;
      } else if (expiredMatch) {
        coverage = "expired";
        matchedId = expiredMatch.id;
        matchedTitle = expiredMatch.title;
        expired++;
      }
    } else {
      missing++;
    }

    return {
      item,
      coverage,
      matched_evidence_id: matchedId,
      matched_evidence_title: matchedTitle,
    };
  });

  const score =
    totalWeight > 0 ? Math.round((coveredWeight / totalWeight) * 100) : 0;

  return {
    score,
    covered,
    expiring_soon: expiring,
    expired,
    missing,
    total_items: checklist.length,
    results,
  };
}
