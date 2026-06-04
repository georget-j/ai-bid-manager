import Link from "next/link";

export const metadata = {
  title: "Resources — UK Bid Intelligence",
  description: "Guides, checklists, and tools for UK public-sector bidding.",
};

const GUIDES = [
  {
    category: "Getting started",
    items: [
      {
        title: "How to use Find a Tender",
        body: "Find a Tender (FTS) is the UK government's official portal for above-threshold procurement notices. Learn how to search, set up alerts, and interpret OCDS-format notices.",
      },
      {
        title: "Contracts Finder guide",
        body: "Contracts Finder publishes below-threshold opportunities from central government and NHS. It uses a different format to FTS but covers a large volume of SME-relevant contracts.",
      },
      {
        title: "Understanding CPV codes",
        body: "Common Procurement Vocabulary (CPV) codes are 8-digit EU/UK classification codes for goods and services. Setting the right codes in your profile is the single most impactful way to improve match quality.",
      },
    ],
  },
  {
    category: "Bid management",
    items: [
      {
        title: "Bid / no-bid checklist",
        body: "Before committing resource to a bid, assess: fit score, deadline feasibility, relationship with the buyer, available evidence, realistic win probability, and pipeline capacity.",
      },
      {
        title: "Compliance matrix guide",
        body: "A compliance matrix maps every tender requirement to a response section and owner. It prevents missed mandatory criteria and helps reviewers verify completeness before submission.",
      },
      {
        title: "Social value response guide",
        body: "Social value is weighted at a minimum of 10% in most UK public-sector procurements under PPN 06/20. Prepare reusable evidence covering employment, environment, and community outcomes.",
      },
    ],
  },
  {
    category: "Evidence library",
    items: [
      {
        title: "Public-sector case study template",
        body: "Structure case studies with: client (anonymised if needed), challenge, solution, team size, contract value, outcomes with measurable metrics, and client endorsement if available.",
      },
      {
        title: "Cyber and security evidence checklist",
        body: "Many IT contracts require Cyber Essentials or Cyber Essentials Plus. Prepare: current certificate, scope statement, penetration test report if applicable, ISMS summary, and GDPR/DPA compliance statement.",
      },
      {
        title: "Modern slavery policy checklist",
        body: "Most frameworks and high-value contracts require an up-to-date Modern Slavery Act statement. Review annually, publish on your website, and keep a signed copy in your evidence library.",
      },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <>
      <div style={{ marginBottom: 48 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: "var(--accent)" }}
        >
          Resources
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 36,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Practical guides for
          <br />
          <em>UK public-sector bidding</em>.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: 540,
          }}
        >
          Guides, checklists, and templates to help UK suppliers build their
          evidence library and respond to tenders more efficiently.
        </p>
      </div>

      {GUIDES.map((section) => (
        <div key={section.category} style={{ marginBottom: 40 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            {section.category}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {section.items.map((item) => (
              <div key={item.title} className="card card-pad">
                <h3
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 16,
                    marginBottom: 8,
                    color: "var(--ink)",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 13.5,
                    color: "var(--ink-2)",
                    lineHeight: 1.6,
                  }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div
        className="card card-pad"
        style={{ background: "var(--accent-tint)", marginTop: 8 }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            marginBottom: 12,
          }}
        >
          Use AI to draft responses from your evidence library.
        </p>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          Upload your case studies, policies, certifications, and capability
          statements to the Knowledge Base. The platform generates grounded
          responses with citations when you process a tender.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="btn primary">
            Get started
          </Link>
          <Link href="/how-it-works" className="btn ghost">
            How it works
          </Link>
        </div>
      </div>
    </>
  );
}
