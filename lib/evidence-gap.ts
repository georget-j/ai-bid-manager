// Evidence gap engine — maps opportunity requirements to client evidence.
// Uses keyword matching against evidence title + notes for fast, token-free analysis.
// "requirement" class questions are the primary inputs; guidance/question classes are skipped.

export type GapCoverage = "covered" | "partial" | "missing" | "expired";

export interface GapResult {
  question_id: string;
  question_text: string;
  section_ref: string | null;
  is_mandatory: boolean;
  coverage: GapCoverage;
  risk_level: "low" | "medium" | "high";
  signals_detected: string[];
  signals_detected_types: string[];
  matched_evidence: Array<{
    id: string;
    title: string;
    evidence_type: string;
    status: string;
    expires_at: string | null;
  }>;
  gap_note: string;
}

export interface GapReport {
  total_requirements: number;
  covered: number;
  partial: number;
  missing: number;
  expired: number;
  coverage_score: number; // 0-100
  results: GapResult[];
}

// ── Gap keywords extracted from requirement text ──────────────────────────────

// Maps common requirement phrases to evidence types and keywords to look for.
const REQUIREMENT_SIGNALS: Array<{
  patterns: string[];
  evidence_type: string;
  keywords: string[];
  label: string;
}> = [
  {
    patterns: ["iso 27001", "iso27001", "information security management"],
    evidence_type: "certification",
    keywords: ["iso 27001", "iso27001", "27001"],
    label: "ISO 27001",
  },
  {
    patterns: ["cyber essentials", "cyber essential"],
    evidence_type: "certification",
    keywords: ["cyber essentials", "cyber essential"],
    label: "Cyber Essentials",
  },
  {
    patterns: ["iso 9001", "quality management"],
    evidence_type: "certification",
    keywords: ["iso 9001", "iso9001", "quality"],
    label: "ISO 9001",
  },
  {
    patterns: ["gdpr", "data protection", "data privacy"],
    evidence_type: "policy",
    keywords: ["gdpr", "data protection", "privacy"],
    label: "Data Protection Policy",
  },
  {
    patterns: ["professional indemnity", "pi insurance"],
    evidence_type: "financial",
    keywords: ["professional indemnity", "pi insurance"],
    label: "PI Insurance",
  },
  {
    patterns: ["public liability", "pl insurance"],
    evidence_type: "financial",
    keywords: ["public liability"],
    label: "PL Insurance",
  },
  {
    patterns: ["employers liability", "employer liability"],
    evidence_type: "financial",
    keywords: ["employers liability", "employer liability"],
    label: "Employers Liability",
  },
  {
    patterns: [
      "case study",
      "case studies",
      "relevant experience",
      "previous contract",
      "track record",
    ],
    evidence_type: "case_study",
    keywords: [],
    label: "Case Study",
  },
  {
    patterns: ["g-cloud", "gcloud", "crown commercial", "dos "],
    evidence_type: "accreditation",
    keywords: ["g-cloud", "gcloud", "crown commercial", "dos"],
    label: "G-Cloud / Framework",
  },
  {
    patterns: ["health and safety", "health & safety", "h&s"],
    evidence_type: "policy",
    keywords: ["health and safety", "health & safety", "h&s"],
    label: "H&S Policy",
  },
  {
    patterns: ["business continuity", "disaster recovery"],
    evidence_type: "policy",
    keywords: ["business continuity", "disaster recovery", "bcp"],
    label: "Business Continuity Plan",
  },
  {
    patterns: ["security policy", "information security policy"],
    evidence_type: "policy",
    keywords: ["security policy", "information security"],
    label: "Security Policy",
  },
  {
    patterns: ["reference", "referee", "client reference"],
    evidence_type: "reference",
    keywords: [],
    label: "Client Reference",
  },
  {
    patterns: ["accreditation", "membership", "approved supplier"],
    evidence_type: "accreditation",
    keywords: [],
    label: "Accreditation",
  },
  {
    patterns: ["financial", "accounts", "turnover", "annual report"],
    evidence_type: "financial",
    keywords: [],
    label: "Financial Evidence",
  },
];

interface EvidenceRow {
  id: string;
  title: string;
  evidence_type: string;
  status: string;
  notes: string | null;
  expires_at: string | null;
}

interface RequirementRow {
  id: string;
  question_text: string;
  section_ref: string | null;
  is_mandatory: boolean;
}

function detectSignals(requirementText: string): typeof REQUIREMENT_SIGNALS {
  const lower = requirementText.toLowerCase();
  return REQUIREMENT_SIGNALS.filter((sig) =>
    sig.patterns.some((p) => lower.includes(p)),
  );
}

function findMatches(
  signals: typeof REQUIREMENT_SIGNALS,
  evidence: EvidenceRow[],
): EvidenceRow[] {
  if (signals.length === 0) return [];
  const matches: EvidenceRow[] = [];
  for (const ev of evidence) {
    const evHaystack = `${ev.title} ${ev.notes ?? ""}`.toLowerCase();
    for (const sig of signals) {
      if (ev.evidence_type !== sig.evidence_type) continue;
      const kwMatch =
        sig.keywords.length === 0 ||
        sig.keywords.some((kw) => evHaystack.includes(kw));
      if (kwMatch && !matches.find((m) => m.id === ev.id)) {
        matches.push(ev);
      }
    }
  }
  return matches;
}

export function analyseGaps(
  requirements: RequirementRow[],
  evidence: EvidenceRow[],
): GapReport {
  let covered = 0;
  let partial = 0;
  let missing = 0;
  let expired = 0;

  const results: GapResult[] = requirements.map((req) => {
    const signals = detectSignals(req.question_text);
    const matches = findMatches(signals, evidence);

    let coverage: GapCoverage;
    let gap_note: string;
    let risk_level: "low" | "medium" | "high";

    if (signals.length === 0) {
      // No recognisable evidence signal — flag as needing manual review
      coverage = "missing";
      gap_note = "No matching evidence type detected — review manually.";
      risk_level = req.is_mandatory ? "high" : "medium";
      missing++;
    } else if (matches.length === 0) {
      coverage = "missing";
      gap_note = `Missing: ${signals.map((s) => s.label).join(", ")}`;
      risk_level = req.is_mandatory ? "high" : "medium";
      missing++;
    } else {
      const validMatches = matches.filter((m) => m.status === "valid");
      const expiringMatches = matches.filter(
        (m) => m.status === "expiring_soon",
      );
      const expiredMatches = matches.filter((m) => m.status === "expired");

      if (validMatches.length > 0) {
        coverage = "covered";
        gap_note = `Covered by: ${validMatches.map((m) => m.title).join(", ")}`;
        risk_level = "low";
        covered++;
      } else if (expiringMatches.length > 0) {
        coverage = "partial";
        gap_note = `Expiring soon: ${expiringMatches.map((m) => m.title).join(", ")} — renew before submission`;
        risk_level = "medium";
        partial++;
      } else {
        coverage = "expired";
        gap_note = `Expired: ${expiredMatches.map((m) => m.title).join(", ")} — must be renewed`;
        risk_level = req.is_mandatory ? "high" : "medium";
        expired++;
      }
    }

    return {
      question_id: req.id,
      question_text: req.question_text,
      section_ref: req.section_ref,
      is_mandatory: req.is_mandatory,
      coverage,
      risk_level,
      signals_detected: signals.map((s) => s.label),
      signals_detected_types: [...new Set(signals.map((s) => s.evidence_type))],
      matched_evidence: matches.map((m) => ({
        id: m.id,
        title: m.title,
        evidence_type: m.evidence_type,
        status: m.status,
        expires_at: m.expires_at,
      })),
      gap_note,
    };
  });

  const total = requirements.length;
  const coverageScore =
    total > 0 ? Math.round(((covered + partial * 0.5) / total) * 100) : 0;

  return {
    total_requirements: total,
    covered,
    partial,
    missing,
    expired,
    coverage_score: coverageScore,
    results,
  };
}
