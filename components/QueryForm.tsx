"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorAlert } from "./ErrorAlert";
import { ResponseCard } from "./ResponseCard";
import type {
  AskResponse,
  PartialRFPResponse,
  RFPContext,
  RetrievedChunk,
} from "@/lib/schema";

const INDUSTRY_OPTIONS = [
  { value: "", label: "Any industry" },
  { value: "fintech", label: "Fintech" },
  { value: "legaltech", label: "Legaltech" },
  { value: "enterprise-saas", label: "Enterprise SaaS" },
  { value: "healthcare", label: "Healthcare" },
  { value: "industrial", label: "Industrial / Robotics" },
  { value: "other", label: "Other" },
];

const RESPONSE_TYPE_OPTIONS = [
  { value: "", label: "Any response type" },
  { value: "executive-summary", label: "Executive Summary" },
  { value: "technical-answer", label: "Technical Answer" },
  { value: "implementation-approach", label: "Implementation Approach" },
  { value: "security-compliance", label: "Security / Compliance" },
  { value: "case-study", label: "Case Study Recommendation" },
  { value: "full-rfp-draft", label: "Full RFP Draft" },
];

const TONE_OPTIONS = [
  { value: "", label: "Default tone" },
  { value: "concise", label: "Concise" },
  { value: "formal", label: "Formal" },
  { value: "founder-led", label: "Founder-led" },
  { value: "technical", label: "Technical" },
  { value: "commercial", label: "Commercial" },
];

type Phase = "idle" | "retrieving" | "generating" | "done";

interface QueryFormProps {
  initialQuery?: string;
  initialContext?: Partial<RFPContext>;
  autoSubmit?: boolean;
}

export function QueryForm({
  initialQuery = "",
  initialContext = {},
}: QueryFormProps) {
  const [query, setQuery] = useState(initialQuery);
  const [industry, setIndustry] = useState(initialContext.industry ?? "");
  const [responseType, setResponseType] = useState(
    initialContext.response_type ?? "",
  );
  const [tone, setTone] = useState(initialContext.tone ?? "");
  const [showContext, setShowContext] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [retrievedChunks, setRetrievedChunks] = useState<RetrievedChunk[]>([]);
  const [partial, setPartial] = useState<PartialRFPResponse | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [pendingReview, setPendingReview] = useState<
    Array<{
      queryId: string;
      topic: string;
      teamLabel: string;
      riskLevel: string;
      score: number;
    }>
  >([]);
  const [rfpTitleForRouting, setRfpTitleForRouting] = useState("");
  const [routingSent, setRoutingSent] = useState(false);
  const [sendingRouting, setSendingRouting] = useState(false);
  const [libraryHit, setLibraryHit] = useState<{
    id: string;
    question: string;
    answer: string;
    topic: string | null;
    similarity: number;
  } | null>(null);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setPhase("retrieving");
    setError(null);
    setResult(null);
    setPartial(null);
    setQueryId(null);
    setRetrievedChunks([]);
    setPendingReview([]);
    setRoutingSent(false);
    setLibraryHit(null);
    setSavedToLibrary(false);

    const rfpContext: RFPContext = {};
    if (industry) rfpContext.industry = industry as RFPContext["industry"];
    if (responseType)
      rfpContext.response_type = responseType as RFPContext["response_type"];
    if (tone) rfpContext.tone = tone as RFPContext["tone"];

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          rfp_context:
            Object.keys(rfpContext).length > 0 ? rfpContext : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Request failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latestPartial: PartialRFPResponse | null = null;
      let latestQueryId: string | null = null;
      let latestChunks: RetrievedChunk[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";

        for (const msg of messages) {
          if (!msg.startsWith("data: ")) continue;
          const event = JSON.parse(msg.slice(6));

          if (event.type === "meta") {
            latestQueryId = event.query_id;
            latestChunks = event.retrieved_chunks;
            setQueryId(event.query_id);
            setRetrievedChunks(event.retrieved_chunks);
            if (event.library_hit) setLibraryHit(event.library_hit);
            setPhase("generating");
          } else if (event.type === "partial") {
            latestPartial = event.object;
            setPartial(event.object);
          } else if (event.type === "done") {
            if (latestPartial && latestQueryId) {
              setResult({
                query_id: latestQueryId,
                response: latestPartial as AskResponse["response"],
                retrieved_chunks: latestChunks,
                unverified_citations_removed: event.removed_citations ?? 0,
              });
            }
            setPendingReview(event.pending_review ?? []);
            setRfpTitleForRouting(event.rfp_title ?? query);
            setPhase("done");
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  }

  async function saveToLibrary() {
    if (!result || !query) return;
    setSavingToLibrary(true);
    try {
      await fetch("/api/answer-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          answer: result.response.draft_answer,
          topic: result.response.confidence?.level,
          source_query_id: queryId ?? undefined,
        }),
      });
      setSavedToLibrary(true);
    } finally {
      setSavingToLibrary(false);
    }
  }

  async function sendForReview() {
    if (!pendingReview.length) return;
    setSendingRouting(true);
    try {
      const res = await fetch("/api/review/confirm-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: pendingReview.map(({ queryId, topic, riskLevel, score }) => ({
            queryId,
            topic,
            riskLevel,
            score,
          })),
          rfp_title: rfpTitleForRouting,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      setRoutingSent(true);
      setPendingReview([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send for review");
    } finally {
      setSendingRouting(false);
    }
  }

  const isLoading = phase === "retrieving" || phase === "generating";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div className="ask-input-wrap">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (query.trim() && !isLoading)
                  handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder="e.g. What's our SOC 2 status and when was the last audit?"
            rows={3}
            className="ask-input"
            required
          />
          <div className="ask-input-bar">
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                color: "var(--muted)",
                fontSize: 12,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 2h7l3 3v9H3V2z" />
                <path d="M10 2v3h3" />
                <path d="M6 7h4M6 10h4" />
              </svg>
              Knowledge base indexed
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginLeft: "auto",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                <span className="kbd">⌘</span> + <span className="kbd">↵</span>
              </span>
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="btn accent"
              >
                {isLoading ? (
                  <>{phase === "retrieving" ? "Searching…" : "Generating…"}</>
                ) : (
                  <>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="3,2 14,8 3,14" />
                    </svg>
                    Ask
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowContext(!showContext)}
            className="btn ghost sm"
          >
            {showContext ? "− Hide context" : "+ Add RFP context (optional)"}
          </button>
        </div>

        {showContext && (
          <div
            className="card card-pad-sm"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {[
              {
                label: "Industry",
                value: industry,
                setter: setIndustry,
                options: INDUSTRY_OPTIONS,
              },
              {
                label: "Response type",
                value: responseType,
                setter: setResponseType,
                options: RESPONSE_TYPE_OPTIONS,
              },
              {
                label: "Tone",
                value: tone,
                setter: setTone,
                options: TONE_OPTIONS,
              },
            ].map(({ label, value, setter, options }) => (
              <div key={label}>
                <label className="label">{label}</label>
                <select
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="input"
                  style={{ padding: "6px 9px" }}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </form>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {phase === "done" && pendingReview.length > 0 && (
        <div
          style={{
            padding: "14px 16px",
            background:
              "var(--warn-tint, color-mix(in oklch, var(--warn) 10%, var(--surface)))",
            border:
              "1px solid color-mix(in oklch, var(--warn) 25%, transparent)",
            borderRadius: "var(--r-sm)",
          }}
        >
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: 4,
            }}
          >
            This answer may need human review
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            Confidence is {Math.round((pendingReview[0]?.score ?? 0) * 100)}% —
            routed to <strong>{pendingReview[0]?.teamLabel}</strong>. Send for
            review?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={sendForReview}
              disabled={sendingRouting}
              className="btn accent sm"
            >
              {sendingRouting ? "Sending…" : "Yes, send for review"}
            </button>
            <button
              onClick={() => setPendingReview([])}
              disabled={sendingRouting}
              className="btn ghost sm"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {phase === "done" && routingSent && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            background: "var(--accent-tint)",
            border:
              "1px solid color-mix(in oklch, var(--accent) 20%, transparent)",
            borderRadius: "var(--r-sm)",
          }}
        >
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--accent)",
              margin: 0,
            }}
          >
            Sent for human review
          </p>
          <Link href="/review" className="btn accent sm">
            View review queue →
          </Link>
        </div>
      )}

      {libraryHit && phase !== "idle" && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--accent-tint)",
            border:
              "1px solid color-mix(in oklch, var(--accent) 20%, transparent)",
            borderRadius: "var(--r-sm)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
                margin: "0 0 2px",
              }}
            >
              Answer library match ({Math.round(libraryHit.similarity * 100)}%
              similar)
            </p>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--muted)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {libraryHit.answer.slice(0, 160)}
              {libraryHit.answer.length > 160 ? "…" : ""}
            </p>
          </div>
          <button
            className="btn ghost sm"
            style={{ flexShrink: 0 }}
            onClick={() => setLibraryHit(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {(partial || result) && (
        <ResponseCard
          result={result ?? undefined}
          partial={result ? undefined : (partial ?? undefined)}
          retrievedChunks={retrievedChunks}
          isStreaming={phase === "generating"}
          query={query}
        />
      )}

      {phase === "done" && result && !savedToLibrary && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn ghost sm"
            onClick={saveToLibrary}
            disabled={savingToLibrary}
          >
            {savingToLibrary ? "Saving…" : "Save to answer library"}
          </button>
        </div>
      )}

      {phase === "done" && savedToLibrary && (
        <p
          style={{
            fontSize: 12,
            color: "var(--success)",
            textAlign: "right",
            margin: 0,
          }}
        >
          Saved to answer library
        </p>
      )}
    </div>
  );
}
