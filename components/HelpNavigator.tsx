"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

const STORAGE_KEY = "rfp_agent_welcomed_v3";

type Tab = "tips" | "workflow" | "features" | "pipeline";

const TAB_LABELS: Record<Tab, string> = {
  tips: "Tips",
  workflow: "Workflow",
  features: "Features",
  pipeline: "How it works",
};

// ── Data ──────────────────────────────────────────────────────────────────

const TIP_GROUPS = [
  {
    label: "Opportunities",
    href: "/opportunities",
    tips: [
      {
        text: 'Click "Save opportunity" on any tender to add it to My Opportunities. The button shows "✓ Saved" if it\'s already in your pipeline.',
      },
      {
        text: 'Click "Analyse fit" to get an AI fit score, reasons, and missing evidence gaps based on your Organisation Profile.',
      },
      {
        text: 'On the "RFP Response" tab of an opportunity, click "Extract questions" next to an accessible tender document to download it and extract all questions automatically.',
      },
      {
        text: "Portal-required documents can be downloaded directly from the procurement portal — then upload them manually on the RFP Response tab.",
      },
    ],
  },
  {
    label: "RFP Response",
    href: "/opportunities",
    tips: [
      {
        text: 'The RFP Response tab lives on each opportunity page. Open any opportunity and click the "RFP Response" tab to start.',
      },
      {
        text: 'After extracting questions, click "Answer All" to generate AI-powered draft responses for every question at once using your knowledge base.',
      },
      {
        text: "Each question shows a confidence score based on how well your KB covered it. Low-confidence answers are flagged for review.",
      },
      {
        text: "Generate a Compliance Matrix directly from your extracted questions to track mandatory requirements and completion status.",
      },
    ],
  },
  {
    label: "My Opportunities",
    href: "/my-opportunities",
    tips: [
      {
        text: 'The "Opportunities" tab shows AI-recommended tenders matched to your profile, plus saved opportunities.',
      },
      {
        text: 'Switch to the "RFP Runs" tab to see all past RFP processing sessions with question counts and confidence breakdowns.',
      },
      {
        text: "Set up your Organisation Profile to receive AI-matched recommendations. Profile keywords, CPV codes and regions drive the matching engine.",
      },
    ],
  },
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
        text: "The confidence badge shows how well your knowledge base covered the question. Below 75% surfaces a review prompt.",
      },
      {
        text: 'Off-topic test: ask something unrelated to your documents. A healthy system returns "no relevant sources" rather than a plausible-sounding invention.',
      },
    ],
  },
  {
    label: "Knowledge base",
    href: "/documents",
    tips: [
      {
        text: "Upload any PDF, DOCX, XLSX, CSV, HTML, JSON, or Markdown file. Documents are chunked and embedded for semantic search.",
      },
      {
        text: 'Documents with clear headings chunk better. The section prefix (e.g. "Security Policy › Access Control") is what makes vector search accurate.',
      },
      {
        text: "Re-upload updated documents to refresh embeddings. Stale docs produce stale answers.",
      },
      {
        text: 'Accessible tender documents can also be added directly to your KB from an opportunity\'s Documents section using "Add to KB".',
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
        text: "Edit and approval are separate steps — save your edits first, then approve when satisfied.",
      },
      {
        text: 'Use "Notify [Team]" on a missing-information item to send an email to the right owner without leaving the card.',
      },
    ],
  },
  {
    label: "Admin & routing",
    href: "/admin",
    tips: [
      {
        text: "When you have no routing rules, all reviews default to your account. Add rules to assign specific topics to team members.",
      },
      {
        text: "Each topic (Legal, Engineering, Commercial) can have its own owner email, notification channel, and escalation SLA.",
      },
      {
        text: 'Set the notification channel to "Both" to send email and Slack simultaneously for high-risk topics.',
      },
    ],
  },
];

const WORKFLOW_STEPS = [
  {
    step: "1",
    colour: "var(--accent)",
    title: "Find tenders",
    desc: "Browse the Opportunities catalog or check My Opportunities for AI-matched recommendations. Use filters to narrow by region, stage, or keyword.",
    action: { label: "Browse opportunities →", href: "/opportunities" },
  },
  {
    step: "2",
    colour: "var(--warn)",
    title: "Save & analyse",
    desc: 'Click "Save opportunity" on any tender to add it to your pipeline. Run "Analyse fit" to get an AI score, reasons, and missing evidence gaps based on your Organisation Profile.',
    action: { label: "Set up your profile →", href: "/profile" },
  },
  {
    step: "3",
    colour: "var(--terra)",
    title: "Extract & respond",
    desc: 'Go to the "RFP Response" tab on an opportunity. Click "Extract questions" next to a tender document to download it and extract all questions automatically. Click "Answer All" to generate draft responses from your knowledge base.',
    action: { label: "View knowledge base →", href: "/documents" },
  },
  {
    step: "4",
    colour: "var(--success)",
    title: "Review & export",
    desc: "Low-confidence answers route to the Review Queue with topic-owner assignment and SLA timers. Approve or edit drafts, then export to Word or generate a Compliance Matrix.",
    action: { label: "Go to review queue →", href: "/review" },
  },
];

const FEATURES = [
  {
    icon: "⬆",
    title: "Document ingestion",
    desc: "PDF, DOCX, CSV, XLSX, HTML, JSON, Markdown. ~500-token overlapping chunks, pgvector embeddings.",
  },
  {
    icon: "⌕",
    title: "Hybrid search + rerank",
    desc: "BM25 + vector search in parallel, Reciprocal Rank Fusion, gpt-4o-mini reranks top 14 to 6.",
  },
  {
    icon: "≋",
    title: "Streaming generation",
    desc: "Token-by-token SSE stream with structured Zod output. Executive summary appears within ~1 second.",
  },
  {
    icon: "✓",
    title: "Citation verification",
    desc: "Cited chunk IDs are checked against the retrieved set post-generation. Invented citations are stripped.",
  },
  {
    icon: "⬡",
    title: "Tender document extraction",
    desc: "Download a PDF, DOCX, or XLSX tender document and extract all vendor questions automatically.",
  },
  {
    icon: "✦",
    title: "Opportunity RFP response",
    desc: "Per-opportunity RFP Response tab with question extraction, AI-powered answers, and compliance matrix generation.",
  },
  {
    icon: "⚐",
    title: "Review queue",
    desc: "Low-confidence or high-risk answers route to the queue with SLA timers and topic-owner assignment.",
  },
  {
    icon: "✎",
    title: "Review editing",
    desc: "Edit and approval are separate. Edited answers show a badge with the original AI draft on hover.",
  },
  {
    icon: "⚙",
    title: "Admin routing",
    desc: "Per-topic owner, email/Slack channel, escalation SLA. Defaults to your account when no rules are set.",
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
  {
    icon: "★",
    title: "Opportunity matching",
    desc: "AI scoring against your Organisation Profile — CPV codes, keywords, regions, and contract value range.",
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

function WorkflowTab({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--muted)",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        Four steps from finding a tender to a reviewed, exportable response.
      </p>
      {WORKFLOW_STEPS.map((step) => (
        <div
          key={step.step}
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
                letterSpacing: "0.06em",
              }}
            >
              Step {step.step}
            </span>
            <span
              style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
            >
              {step.title}
            </span>
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            {step.desc}
          </p>
          <Link
            href={step.action.href}
            className="btn ghost sm"
            style={{ fontSize: 11 }}
            onClick={onClose}
          >
            {step.action.label}
          </Link>
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
          {tab === "workflow" && <WorkflowTab onClose={dismiss} />}
          {tab === "features" && <FeaturesTab />}
          {tab === "pipeline" && <PipelineTab />}
        </div>
      </div>
    </>
  );
}
