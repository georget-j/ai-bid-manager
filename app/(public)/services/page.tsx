import Link from "next/link";

export const metadata = {
  title: "Services — UK Bid Intelligence",
  description:
    "What UK Bid Intelligence does: opportunity discovery, bid scoring, compliance matrices, and AI-drafted RFP responses.",
};

const SERVICES = [
  {
    title: "Opportunity discovery",
    body: "Automated ingestion from Find a Tender, Contracts Finder, Public Contracts Scotland, and Sell2Wales. New notices are stored raw before normalisation. Duplicate processing is prevented by content hash.",
    detail: [
      "OCDS-format normalisation",
      "Full audit trail of raw payloads",
      "Source links preserved on every record",
      "Deduplication across sources via content hash",
    ],
  },
  {
    title: "Fit scoring and bid/no-bid",
    body: "Every opportunity is scored against your organisation profile across seven dimensions: CPV match, keyword match, region, buyer preference, contract value, evidence strength, and deadline feasibility.",
    detail: [
      "Fit score 0–100",
      "Readiness score based on evidence library",
      "Recommended action: bid, maybe, needs review, do not bid",
      "Reasons, risks, and missing evidence surfaced",
    ],
  },
  {
    title: "Bid pipeline management",
    body: "A CRM-style pipeline to track every active bid from first match through decision, in-progress, submitted, and won or lost. Assign owners, set deadlines, and record decision notes.",
    detail: [
      "10 pipeline statuses",
      "Owner assignment",
      "Decision notes and next action",
      "Status filter tabs",
    ],
  },
  {
    title: "Compliance matrix generation",
    body: "For any opportunity, generate a structured compliance matrix that maps tender requirements against your knowledge base. Each requirement gets a draft answer, confidence score, evidence citations, and a status.",
    detail: [
      "Requirements extracted from uploaded tender documents",
      "Draft answers generated from your knowledge base",
      "Confidence scored as high / medium / low",
      "Requirements tracked through not-started → drafted → approved",
    ],
  },
  {
    title: "RFP batch processing",
    body: "Upload any ITT or tender questionnaire. The system extracts every requirement and generates a grounded response for each one — sourced from your approved company documents, with citations.",
    detail: [
      "PDF, Word, Excel, Markdown, CSV, HTML support",
      "Parallel batch processing with checkpoint/resume",
      "Missing information flagged per question",
      "Low-confidence answers routed to review queue",
    ],
  },
  {
    title: "Human review workflow",
    body: "Low-confidence or high-risk answers are automatically routed to your review queue. Reviewers can approve, edit, request evidence, or reject. SLA escalation ensures nothing goes overdue.",
    detail: [
      "Configurable routing rules by topic and risk level",
      "Approve, edit, reject, or request evidence actions",
      "SLA countdown and escalation",
      "Review comments and audit log",
    ],
  },
  {
    title: "Alerts and saved searches",
    body: "Create alert rules that match new opportunities against your criteria — keywords, CPV codes, regions, buyers, and value ranges. Matched opportunities appear in your alerts feed after each sync.",
    detail: [
      "Any number of named alert rules",
      "Pause / enable per rule",
      "New match badge in navigation",
      "Mark as seen / mark all seen",
    ],
  },
  {
    title: "Export",
    body: "Export complete RFP response packs as a formatted Word document or HTML. Exports include draft answers, source citations, confidence badges, and missing information flags.",
    detail: [
      "Word (.docx) export",
      "HTML export",
      "Batch export of all questions in a run",
      "Per-question export",
    ],
  },
];

export default function ServicesPage() {
  return (
    <>
      <div style={{ marginBottom: 48 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: "var(--accent)" }}
        >
          Services
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 36,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Everything you need
          <br />
          to <em>win public-sector work</em>.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: 540,
          }}
        >
          UK Bid Intelligence combines procurement data, AI generation, and
          human review into a single platform. Here is what each capability
          does.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginBottom: 48,
        }}
      >
        {SERVICES.map((s) => (
          <div key={s.title} className="card card-pad">
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 18,
                marginBottom: 8,
                color: "var(--ink)",
              }}
            >
              {s.title}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--ink-2)",
                lineHeight: 1.6,
                marginBottom: 14,
              }}
            >
              {s.body}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {s.detail.map((d) => (
                <span
                  key={d}
                  style={{
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "var(--bg-tint)",
                    color: "var(--ink-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className="card card-pad"
        style={{ background: "var(--accent-tint)" }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            marginBottom: 12,
          }}
        >
          Ready to see it in action?
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="btn primary">
            Start free
          </Link>
          <Link href="/how-it-works" className="btn ghost">
            How it works
          </Link>
          <Link href="/pricing" className="btn ghost">
            View pricing
          </Link>
        </div>
      </div>
    </>
  );
}
