import Link from "next/link";

export const metadata = {
  title: "Industries — UK Bid Intelligence",
  description:
    "UK Bid Intelligence serves suppliers across technology, construction, care, consultancy, and more.",
};

const SECTORS = [
  {
    name: "Technology and digital",
    examples:
      "Software vendors, managed service providers, cloud architects, cyber security firms, digital agencies.",
    cpv: "72000000–72999999",
  },
  {
    name: "Consultancy and professional services",
    examples:
      "Management consultants, research agencies, evaluation specialists, economists, lawyers.",
    cpv: "73000000–73999999, 79000000–79999999",
  },
  {
    name: "Construction and FM",
    examples:
      "Builders, M&E contractors, facilities managers, cleaning services, grounds maintenance.",
    cpv: "45000000–45999999, 79993000–79993999",
  },
  {
    name: "Health and social care",
    examples:
      "Care providers, domiciliary care, supported living, mental health services, NHS suppliers.",
    cpv: "85000000–85999999",
  },
  {
    name: "Education and training",
    examples:
      "Training providers, apprenticeship bodies, e-learning platforms, coaching firms.",
    cpv: "80000000–80999999",
  },
  {
    name: "Housing and property",
    examples:
      "Housing associations, asset management, repairs and maintenance, surveyors.",
    cpv: "50700000–50799999, 70000000–70999999",
  },
  {
    name: "Environmental and sustainability",
    examples:
      "Waste management, recycling, environmental consultancy, ecological surveys.",
    cpv: "90000000–90999999",
  },
  {
    name: "Transport and infrastructure",
    examples:
      "Transport planning, fleet management, traffic management, highway engineering.",
    cpv: "34000000–34999999, 63700000–63799999",
  },
  {
    name: "Nonprofits and social enterprise",
    examples:
      "Voluntary sector organisations, charities, community interest companies delivering public services.",
    cpv: "Various",
  },
];

export default function IndustriesPage() {
  return (
    <>
      <div style={{ marginBottom: 48 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: "var(--accent)" }}
        >
          Industries
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 36,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Built for UK suppliers
          <br />
          across <em>every sector</em>.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: 540,
          }}
        >
          UK Bid Intelligence is sector-agnostic. CPV code matching, keyword
          scoring, and region filters work for any supplier category. Here are
          the sectors we most commonly see represented.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
          marginBottom: 48,
        }}
      >
        {SECTORS.map((s) => (
          <div key={s.name} className="card card-pad">
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 16,
                marginBottom: 8,
                color: "var(--ink)",
              }}
            >
              {s.name}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.6,
                marginBottom: 8,
              }}
            >
              {s.examples}
            </p>
            <p
              style={{
                fontSize: 11.5,
                color: "var(--muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              CPV {s.cpv}
            </p>
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
          Don&apos;t see your sector?
        </p>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          The platform works for any UK supplier category. CPV code matching
          covers the full 9-digit taxonomy. If you supply into UK public sector,
          this tool is for you.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/login" className="btn primary">
            Start free
          </Link>
          <Link href="/contact" className="btn ghost">
            Talk to us
          </Link>
        </div>
      </div>
    </>
  );
}
