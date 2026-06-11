import { Suspense } from "react";
import { AskPageClient } from "@/components/AskPageClient";

const EXAMPLE_QUESTIONS = [
  "Draft a response to a fintech customer asking how we reduce AML review time.",
  "Do we have SOC 2 certification? What is our security compliance status?",
  "Which case studies are relevant to a legaltech workflow automation pitch?",
  "Describe our standard implementation timeline and what we need from the customer.",
  "What evidence do we have that our platform reduces manual review time?",
  "Generate a response to an RFP question about our AI and human oversight approach.",
];

export default function AskPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Ask</div>
        <h1>
          Ask anything. <em>Cited from</em>
          <br />
          your knowledge base.
        </h1>
        <p className="subtitle">
          Type an RFP question or proposal prompt. The agent searches your
          indexed documents and returns a structured response with source
          citations and an evidence assessment.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <Suspense
            fallback={
              <div
                className="card card-pad"
                style={{
                  minHeight: 200,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div className="eyebrow">Loading…</div>
              </div>
            }
          >
            <AskPageClient />
          </Suspense>
        </div>

        <aside style={{ position: "sticky", top: 80 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Try one of these
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <a
                key={i}
                href={`/ask?q=${encodeURIComponent(q)}`}
                className="ask-example"
                style={{ textDecoration: "none" }}
              >
                {q}
              </a>
            ))}
          </div>
        </aside>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          textAlign: "center",
          marginTop: 28,
        }}
      >
        🔒 Answers come only from your evidence library — private to your
        organisation.
      </p>
    </div>
  );
}
