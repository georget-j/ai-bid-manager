import Link from "next/link";

export const metadata = {
  title: "Pricing — UK Bid Intelligence",
  description: "Simple, transparent pricing for UK public-sector suppliers.",
};

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: null,
    description:
      "For individual consultants and micro businesses exploring public-sector bidding.",
    features: [
      "Up to 50 opportunities per month",
      "1 organisation profile",
      "Find a Tender sync",
      "Basic fit scoring",
      "5 compliance matrices per month",
      "Knowledge base (up to 20 documents)",
      "RFP batch processing",
      "Word export",
    ],
    cta: "Get started free",
    ctaHref: "/login",
    highlight: false,
  },
  {
    name: "Professional",
    price: "£149",
    period: "/ month",
    description:
      "For SMEs and consultancies actively bidding into the public sector.",
    features: [
      "Unlimited opportunities",
      "1 organisation profile",
      "All 4 UK procurement sources",
      "Full fit + readiness scoring",
      "Unlimited compliance matrices",
      "Knowledge base (up to 200 documents)",
      "Unlimited RFP batch processing",
      "Alert rules and saved searches",
      "Bid pipeline",
      "Word + HTML export",
      "Review queue and routing",
      "Email support",
    ],
    cta: "Start free trial",
    ctaHref: "/login",
    highlight: true,
  },
  {
    name: "Team",
    price: "£399",
    period: "/ month",
    description:
      "For bid teams and larger organisations managing multiple pipelines.",
    features: [
      "Everything in Professional",
      "Up to 10 team members",
      "Multi-user review workflow",
      "Unlimited documents",
      "Priority support",
      "Custom routing rules",
      "Dedicated onboarding call",
    ],
    cta: "Contact us",
    ctaHref: "/contact",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: "var(--accent)" }}
        >
          Pricing
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 36,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Simple pricing.
          <br />
          <em>Cancel any time.</em>
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: 500,
            margin: "0 auto",
          }}
        >
          No per-seat fees for smaller teams. No hidden costs. All plans include
          full access to the procurement sources we support.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 48,
        }}
      >
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="card card-pad"
            style={{
              border: plan.highlight ? "2px solid var(--accent)" : undefined,
              position: "relative",
            }}
          >
            {plan.highlight && (
              <div
                style={{
                  position: "absolute",
                  top: -12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 12px",
                  borderRadius: 999,
                  whiteSpace: "nowrap",
                }}
              >
                Most popular
              </div>
            )}

            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {plan.name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 32,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              >
                {plan.price}
              </span>
              {plan.period && (
                <span
                  style={{ fontSize: 14, color: "var(--muted)", marginLeft: 4 }}
                >
                  {plan.period}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.5,
                marginBottom: 20,
              }}
            >
              {plan.description}
            </p>

            <Link
              href={plan.ctaHref}
              className={plan.highlight ? "btn primary" : "btn"}
              style={{
                display: "block",
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              {plan.cta}
            </Link>

            <ul
              style={{
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {plan.features.map((f) => (
                <li
                  key={f}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: 13,
                    color: "var(--ink-2)",
                  }}
                >
                  <span style={{ color: "#059669", flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="card card-pad"
        style={{ background: "var(--bg-tint)", textAlign: "center" }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            marginBottom: 8,
          }}
        >
          Need a custom arrangement?
        </p>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          If you have specific data sovereignty requirements, need more sources,
          or want a self-hosted deployment, get in touch.
        </p>
        <Link href="/contact" className="btn">
          Talk to us
        </Link>
      </div>
    </>
  );
}
