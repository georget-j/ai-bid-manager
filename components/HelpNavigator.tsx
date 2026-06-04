"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

const STORAGE_KEY = "rfp_agent_welcomed_v2";

type Tab = "tips" | "scenarios" | "features" | "pipeline";

const TAB_LABELS: Record<Tab, string> = {
  tips: "Tips",
  scenarios: "Scenarios",
  features: "Features",
  pipeline: "How it works",
};

// ── Data ──────────────────────────────────────────────────────────────────

const TIP_GROUPS = [
  {
    label: "Ask",
    href: "/ask",
    tips: [
      {
        text: "Press ⌘+Enter (Ctrl+Enter on Windows) to submit without clicking the Ask button.",
      },
      {
        text: 'Use "Add RFP context" to narrow by industry, response type, and tone — it improves relevance significantly for specialised topics.',
      },
      {
        text: "The confidence badge shows how well your knowledge base covered the question. Below 75% surfaces a review prompt; you can skip it or send it to the queue.",
      },
      {
        text: 'Off-topic test: ask something completely unrelated to your documents. A healthy system returns "no relevant sources" rather than a plausible-sounding invention.',
      },
    ],
  },
  {
    label: "RFP Runs",
    href: "/rfp",
    tips: [
      {
        text: "Upload a PDF or DOCX and the agent extracts every numbered requirement automatically — no copy-pasting.",
      },
      {
        text: "Deselect individual questions before running. Only answer what is relevant to this specific submission.",
      },
      {
        text: "Low-confidence answers show a confirmation prompt before going to the review queue — you control what gets routed.",
      },
      {
        text: "Export to Word after reviewing. The document includes all answers, citations, and context tags.",
      },
    ],
  },
  {
    label: "Review queue",
    href: "/review",
    tips: [
      {
        text: "Filter by risk level or status to focus on what needs attention first.",
      },
      {
        text: "Edit and approval are separate steps — save your edits first, then approve when you are satisfied.",
      },
      {
        text: 'Hover the "Edited by reviewer" badge on any approved answer to see the original AI draft before changes.',
      },
      {
        text: 'Use "Notify [Team]" on a missing-information item to send an email to the right owner without leaving the card.',
      },
    ],
  },
  {
    label: "Knowledge base",
    href: "/documents",
    tips: [
      {
        text: "Click any document to see how it was chunked. Each chunk is its own embedding — this is the unit of retrieval.",
      },
      {
        text: 'Documents with clear headings chunk better. The section title prefix (e.g. "Security Policy › Access Control") is what makes vector search accurate.',
      },
      {
        text: "Re-upload updated documents to refresh the embeddings. Stale docs produce stale answers.",
      },
    ],
  },
  {
    label: "Admin & routing",
    href: "/admin",
    tips: [
      {
        text: "Each topic (Legal, Engineering, Commercial) can have its own owner email, notification channel, and escalation SLA.",
      },
      {
        text: "Escalation hours: items not reviewed within that window are automatically escalated to the backup contact.",
      },
      {
        text: 'Set the notification channel to "Both" to send email and Slack simultaneously for high-risk topics.',
      },
    ],
  },
];

const SCENARIOS = [
  {
    id: "fintech-aml",
    title: "Fintech AML RFP",
    description:
      "A digital bank evaluating AI vendors to improve AML compliance. Covers past success, implementation approach, and security posture.",
    industry: "Fintech",
    questions: [
      {
        label: "Reduction in AML review time",
        query:
          "Draft a response to a fintech customer asking how we reduce AML review time. Include quantified evidence if available.",
        context: { industry: "fintech", response_type: "case-study" },
      },
      {
        label: "Security and data handling",
        query:
          "The customer is a regulated financial institution asking about our data handling and security certifications. What can we tell them?",
        context: { industry: "fintech", response_type: "security-compliance" },
      },
      {
        label: "Implementation timeline",
        query:
          "What is our standard implementation timeline and what do we need from the customer team?",
        context: {
          industry: "fintech",
          response_type: "implementation-approach",
        },
      },
    ],
  },
  {
    id: "legaltech",
    title: "Legaltech Contract Review",
    description:
      "A law firm wanting to reduce associate time on first-pass contract review. Evaluating AI for clause extraction and playbook comparison.",
    industry: "Legaltech",
    questions: [
      {
        label: "Contract review case study",
        query:
          "Which case studies are relevant to a legaltech workflow automation pitch for contract review?",
        context: { industry: "legaltech", response_type: "case-study" },
      },
      {
        label: "First-pass review time reduction",
        query:
          "What evidence do we have that our platform reduces first-pass contract review time?",
        context: { industry: "legaltech" },
      },
      {
        label: "Human-in-the-loop oversight",
        query:
          "The law firm wants to understand how we maintain human oversight and accountability when using AI for legal document review.",
        context: { industry: "legaltech", response_type: "technical-answer" },
      },
    ],
  },
  {
    id: "enterprise-security",
    title: "Enterprise Security Due Diligence",
    description:
      "An enterprise buyer's infosec team reviewing the platform before procurement. Specifics on certifications, data handling, and access controls.",
    industry: "Enterprise SaaS",
    questions: [
      {
        label: "SOC 2 and certifications",
        query:
          "Do we have SOC 2 certification? What security certifications do we hold?",
        context: { response_type: "security-compliance" },
      },
      {
        label: "Data isolation and residency",
        query:
          "The customer wants to know how we isolate their data and whether they can choose data residency.",
        context: { response_type: "security-compliance" },
      },
      {
        label: "Off-topic test — hallucination check",
        query:
          "Can this platform help with hospital staffing optimisation and NHS workforce planning?",
        context: {},
      },
    ],
  },
];

const FEATURES = [
  {
    icon: "⬆",
    title: "Document ingestion",
    desc: "PDF, DOCX, CSV, XLSX, HTML, JSON, Markdown, plain text. ~500-token overlapping chunks, pgvector embeddings.",
  },
  {
    icon: "⌕",
    title: "Hybrid search + rerank",
    desc: "BM25 + vector search in parallel, Reciprocal Rank Fusion, then gpt-4o-mini reranks top 14 down to 6.",
  },
  {
    icon: "≋",
    title: "Streaming generation",
    desc: "Token-by-token SSE stream. Executive summary appears within ~1 second.",
  },
  {
    icon: "✓",
    title: "Citation verification",
    desc: "Cited chunk IDs are checked against retrieved set post-generation. Invented citations are stripped.",
  },
  {
    icon: "⬡",
    title: "RFP batch processing",
    desc: "Extract requirements from a full RFP PDF/DOCX, answer in parallel, export as Word.",
  },
  {
    icon: "⚐",
    title: "Review queue",
    desc: "Low-confidence or high-risk answers route to the queue with SLA timers and topic-owner assignment.",
  },
  {
    icon: "✎",
    title: "Review editing",
    desc: "Edit and approval are separate. Edited answers show a badge revealing the original AI draft on hover.",
  },
  {
    icon: "⚙",
    title: "Admin routing",
    desc: "Per-topic owner, email/Slack channel, and escalation SLA.",
  },
  {
    icon: "▶",
    title: "Demo scenarios",
    desc: "3 preloaded industry scenarios with one-click launch links.",
  },
  {
    icon: "◷",
    title: "Query history",
    desc: "Every answer stored and expandable. Re-run with one click.",
  },
  {
    icon: "✉",
    title: "Info requests",
    desc: "Notify a specific team about missing information directly from a review card.",
  },
];

const PIPELINE_STEPS = [
  {
    phase: "Ingest",
    colour: "var(--accent)",
    headline: "Documents → chunks → embeddings → Postgres",
    tech: "8 file types. Split on headings into overlapping ~500-token chunks, each prefixed with document title and section. OpenAI text-embedding-3-small → 1536-dim vectors in Supabase pgvector.",
  },
  {
    phase: "Retrieve",
    colour: "var(--warn)",
    headline: "BM25 + pgvector → RRF fusion → gpt-4o-mini rerank",
    tech: "Full-text (tsvector) and cosine similarity searches run in parallel, merged with Reciprocal Rank Fusion. Top 14 candidates pass to gpt-4o-mini which reranks to the 6 most relevant chunks.",
  },
  {
    phase: "Generate",
    colour: "var(--terra)",
    headline: "GPT-4o structured output → SSE stream → citation check",
    tech: "Chunks + question go to GPT-4o with a Zod-validated schema. Response streams token-by-token via SSE. Post-stream pass strips any chunk IDs not in the retrieved set.",
  },
  {
    phase: "Review",
    colour: "var(--success)",
    headline: "Confidence threshold → queue → human approval",
    tech: "Score < 0.75 or high-risk topic surfaces a confirmation prompt before routing to the queue. Each item assigned to a topic owner with email/Slack notification and audit log.",
  },
];

// ── Sub-tab components ────────────────────────────────────────────────────

function TipsTab() {
  const [open, setOpen] = useState<string>(TIP_GROUPS[0].label);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {TIP_GROUPS.map((group) => {
        const isOpen = open === group.label;
        return (
          <div
            key={group.label}
            className="card"
            style={{ overflow: "hidden" }}
          >
            <button
              onClick={() => setOpen(isOpen ? "" : group.label)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                gap: 10,
              }}
            >
              <span
                style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
              >
                {group.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {group.tips.length} tips
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{
                    color: "var(--muted)",
                    transform: isOpen ? "rotate(180deg)" : "none",
                    transition: "transform 150ms",
                    flexShrink: 0,
                  }}
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </div>
            </button>
            {isOpen && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {group.tips.map((tip, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "10px 14px",
                      borderBottom:
                        i < group.tips.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                      background: "var(--bg)",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background:
                          "color-mix(in oklch, var(--accent) 15%, transparent)",
                        color: "var(--accent)",
                        fontSize: 9,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      ✦
                    </span>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "var(--muted)",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {tip.text}
                    </p>
                  </div>
                ))}
                <div
                  style={{
                    padding: "8px 14px",
                    background: "var(--bg)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <Link
                    href={group.href}
                    className="btn ghost sm"
                    style={{ fontSize: 11 }}
                  >
                    Go to {group.label} →
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScenariosTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          padding: "8px 12px",
          background: "color-mix(in oklch, var(--warn) 10%, var(--surface))",
          border: "1px solid color-mix(in oklch, var(--warn) 25%, transparent)",
          borderRadius: "var(--r-sm)",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        Load the sample dataset from the Dashboard before running these
        scenarios.
      </div>
      {SCENARIOS.map((scenario) => (
        <div key={scenario.id} className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <h3 style={{ fontSize: 13, fontWeight: 600 }}>{scenario.title}</h3>
            <span className="badge mono" style={{ fontSize: 10.5 }}>
              {scenario.industry}
            </span>
          </div>
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              {scenario.description}
            </p>
          </div>
          <div>
            {scenario.questions.map((q, i) => {
              const params = new URLSearchParams({ q: q.query });
              if (q.context)
                Object.entries(q.context).forEach(([k, v]) => params.set(k, v));
              return (
                <div
                  key={i}
                  style={{
                    padding: "11px 16px",
                    borderBottom:
                      i < scenario.questions.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: "var(--ink)",
                        marginBottom: 2,
                      }}
                    >
                      {q.label}
                    </p>
                    <p
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                      }}
                    >
                      {q.query}
                    </p>
                  </div>
                  <Link
                    href={`/ask?${params.toString()}`}
                    className="btn sm"
                    style={{ flexShrink: 0, fontSize: 11.5 }}
                    onClick={onClose}
                  >
                    Ask →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeaturesTab() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {FEATURES.map((f) => (
        <div key={f.title} className="card" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 18, marginBottom: 6, lineHeight: 1 }}>
            {f.icon}
          </div>
          <p
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: 4,
            }}
          >
            {f.title}
          </p>
          <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
            {f.desc}
          </p>
        </div>
      ))}
    </div>
  );
}

function PipelineTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {PIPELINE_STEPS.map((step) => (
        <div
          key={step.phase}
          className="card card-pad"
          style={{ borderLeft: `3px solid ${step.colour}` }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: step.colour,
                background: `color-mix(in oklch, ${step.colour} 12%, var(--surface))`,
                padding: "2px 7px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {step.phase}
            </span>
          </div>
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: 6,
              lineHeight: 1.4,
              fontFamily: "var(--font-serif)",
            }}
          >
            {step.headline}
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            {step.tech}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function HelpNavigator() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("tips");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setTab("tips");
    };
    window.addEventListener("show-welcome", handler);
    if (!localStorage.getItem(STORAGE_KEY)) {
      window.dispatchEvent(new CustomEvent("show-welcome"));
    }
    return () => window.removeEventListener("show-welcome", handler);
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-scrim" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-nav-title"
        className="drawer slide-in-right"
        style={{ width: 520 }}
      >
        <div
          className="drawer-head"
          style={{ justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}
            >
              ?
            </div>
            <span
              id="help-nav-title"
              style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}
            >
              Tips &amp; Help
            </span>
          </div>
          <button
            ref={closeRef}
            onClick={dismiss}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--muted)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
            padding: "0 18px",
            flexShrink: 0,
          }}
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "9px 14px",
                fontSize: 12.5,
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "var(--ink)" : "var(--muted)",
                marginBottom: -1,
                background: "none",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: tab === t ? "var(--accent)" : "transparent",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transition: "color 150ms",
              }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === "tips" && <TipsTab />}
          {tab === "scenarios" && <ScenariosTab onClose={dismiss} />}
          {tab === "features" && <FeaturesTab />}
          {tab === "pipeline" && <PipelineTab />}
        </div>
      </div>
    </>
  );
}
