export const metadata = {
  title: "Contact — UK Bid Intelligence",
  description: "Get in touch with the UK Bid Intelligence team.",
};

export default function ContactPage() {
  return (
    <>
      <div style={{ marginBottom: 40 }}>
        <div
          className="eyebrow"
          style={{ marginBottom: 12, color: "var(--accent)" }}
        >
          Contact
        </div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 36,
            lineHeight: 1.2,
            marginBottom: 16,
          }}
        >
          Get in touch.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--ink-2)",
            lineHeight: 1.7,
            maxWidth: 480,
          }}
        >
          Questions about the platform, custom plans, data sovereignty
          requirements, or partnership enquiries — we&apos;re happy to talk.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
        }}
      >
        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Email
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>
              For all general enquiries, support questions, and partnership
              discussions, email us directly. We aim to respond within one
              business day.
            </p>
            <a
              href="mailto:hello@bidintelligence.co.uk"
              style={{
                display: "inline-block",
                marginTop: 12,
                fontSize: 14,
                color: "var(--accent)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              hello@bidintelligence.co.uk
            </a>
          </div>

          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Enterprise and custom
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>
              If you need a self-hosted deployment, custom source integrations,
              data residency guarantees, or volume pricing for a large team,
              email us with details of your requirements.
            </p>
          </div>

          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Office
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.7 }}>
              United Kingdom
            </p>
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 16 }}>
            Send a message
          </div>
          <form
            action="mailto:hello@bidintelligence.co.uk"
            method="get"
            encType="text/plain"
          >
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Name
              </label>
              <input
                name="name"
                className="input"
                style={{ width: "100%" }}
                placeholder="Your name"
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Email
              </label>
              <input
                name="email"
                type="email"
                className="input"
                style={{ width: "100%" }}
                placeholder="your@email.com"
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 4,
                  color: "var(--ink)",
                }}
              >
                Message
              </label>
              <textarea
                name="body"
                className="input"
                rows={5}
                style={{ width: "100%", resize: "vertical" }}
                placeholder="How can we help?"
              />
            </div>
            <button
              type="submit"
              className="btn primary"
              style={{ width: "100%" }}
            >
              Send message
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
