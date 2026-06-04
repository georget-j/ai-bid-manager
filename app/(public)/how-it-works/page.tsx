import Link from "next/link";

export const metadata = {
  title: "How it works — UK Bid Intelligence",
  description:
    "Learn how UK Bid Intelligence helps you find, qualify, and respond to public-sector tenders.",
};

const STEPS = [
  {
    number: "01",
    title: "Connect procurement sources",
    body: "Link your account to Find a Tender, Contracts Finder, Public Contracts Scotland, and Sell2Wales. The platform ingests live notices automatically and stores raw payloads for a full audit trail.",
  },
  {
    number: "02",
    title: "Score opportunity fit",
    body: "Set up your organisation profile — services, CPV codes, target regions, contract value range, certifications, and preferred buyers. Every new opportunity is scored against your profile: fit score, readiness score, and a bid / no-bid recommendation.",
  },
  {
    number: "03",
    title: "Build your bid pipeline",
    body: "Add matched opportunities to your pipeline. Track each bid from first match through reviewing, decision, in-progress, submitted, and won or lost. Assign owners, set next actions, and record decision notes.",
  },
  {
    number: "04",
    title: "Generate compliance matrices and draft responses",
    body: "For any opportunity, generate a compliance matrix that maps tender requirements to your knowledge base evidence. Draft responses are generated from your approved company documents — case studies, policies, certifications, and capability statements — with source citations and confidence scores.",
  },
  {
    number: "05",
    title: "Route, review, and export",
    body: "Low-confidence or high-risk answers go to the human review queue automatically. Reviewers can approve, edit, or request evidence. Export the final response pack as a Word document or HTML.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <div style={{ marginBottom: 48 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: "var(--accent)" }}
        >
          How it works
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 36,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          From tender notice to
          <br />
          <em>submitted bid</em> in one platform.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: 540,
          }}
        >
          UK Bid Intelligence combines procurement data feeds, an AI scoring
          engine, and your company knowledge base into a single workflow for UK
          public-sector bidding.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {STEPS.map((step, i) => (
          <div
            key={step.number}
            style={{
              display: "flex",
              gap: 32,
              paddingBottom: 40,
              paddingTop: i === 0 ? 0 : 40,
              borderTop: i > 0 ? "1px solid var(--border)" : "none",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--accent)",
                fontWeight: 600,
                flexShrink: 0,
                paddingTop: 3,
                minWidth: 28,
              }}
            >
              {step.number}
            </div>
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 20,
                  marginBottom: 10,
                  color: "var(--ink)",
                }}
              >
                {step.title}
              </h2>
              <p
                style={{
                  fontSize: 14.5,
                  color: "var(--ink-2)",
                  lineHeight: 1.7,
                }}
              >
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="card card-pad"
        style={{ marginTop: 16, background: "var(--accent-tint)" }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            marginBottom: 12,
          }}
        >
          Ready to start finding opportunities?
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="btn primary">
            Sign in
          </Link>
          <Link href="/pricing" className="btn ghost">
            View pricing
          </Link>
        </div>
      </div>
    </>
  );
}
