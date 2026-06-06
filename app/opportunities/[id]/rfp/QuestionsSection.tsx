"use client";

import { useState, useEffect } from "react";

interface OppQuestion {
  id: string;
  question_text: string;
  section_ref: string | null;
  source_document: string | null;
  question_class: string;
  word_limit: number | null;
  is_mandatory: boolean;
  ai_draft: string | null;
  answer_status: string;
  confidence_level: string | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  citations: Array<{
    source_title: string;
    excerpt: string;
    relevance: string;
  }> | null;
}

type FilterTab = "all" | "unanswered" | "attention";

const CONFIDENCE_CONFIG = {
  high: { label: "High confidence", color: "#059669", bg: "#d1fae5" },
  medium: { label: "Medium confidence", color: "#d97706", bg: "#fef3c7" },
  low: { label: "Low confidence", color: "#dc2626", bg: "#fee2e2" },
} as const;

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Per-question card ─────────────────────────────────────────────────────────

function QuestionCard({
  q,
  opportunityId,
  onUpdate,
  onAnswered,
  onApproval,
  streamingText,
}: {
  q: OppQuestion;
  opportunityId: string;
  onUpdate: (updated: OppQuestion) => void;
  onAnswered: () => Promise<void>;
  onApproval?: () => void;
  streamingText?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.ai_draft ?? "");
  const [saving, setSaving] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(q.ai_draft ?? "");
  }, [q.ai_draft, editing]);

  async function answerSingle() {
    setAnswering(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/answer-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIds: [q.id] }),
        },
      );
      if (res.ok && res.body) {
        // Drain the stream (backend writes DB before sending events)
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      // Reload from DB once stream is complete
      await onAnswered();
    } finally {
      setAnswering(false);
    }
  }

  async function saveDraft(approve = false) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${q.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ai_draft: draft,
            answer_status: approve ? "approved" : "drafted",
          }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { question: OppQuestion };
        onUpdate(data.question);
        setEditing(false);
        if (approve) onApproval?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function approveDirect() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${q.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer_status: "approved" }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { question: OppQuestion };
        onUpdate(data.question);
        onApproval?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function unapprove() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${q.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer_status: "drafted" }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { question: OppQuestion };
        onUpdate(data.question);
        onApproval?.();
      }
    } finally {
      setSaving(false);
    }
  }

  const confCfg =
    q.confidence_level && q.confidence_level in CONFIDENCE_CONFIG
      ? CONFIDENCE_CONFIG[q.confidence_level as keyof typeof CONFIDENCE_CONFIG]
      : null;

  const isStreaming = !!streamingText && q.answer_status === "unanswered";
  const displayText = isStreaming ? streamingText : q.ai_draft;
  const wc = wordCount(editing ? draft : (displayText ?? ""));
  const overLimit = q.word_limit != null && wc > q.word_limit;

  const borderColor =
    q.answer_status === "approved"
      ? "#059669"
      : q.answer_status === "needs-review"
        ? "#d97706"
        : q.answer_status === "drafted"
          ? "#3b82f6"
          : "var(--border)";

  return (
    <div
      className="card"
      style={{ padding: "14px 18px", borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            {q.source_document && (
              <span
                title="Where this came from"
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "1px 7px",
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {q.source_document}
              </span>
            )}
            {q.section_ref && (
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                }}
              >
                {q.section_ref}
              </span>
            )}
            {q.word_limit && (
              <span
                style={{ fontSize: 10.5, color: "var(--muted)" }}
              >{`${q.word_limit} words`}</span>
            )}
            {q.is_mandatory && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#dc2626",
                  background: "#fee2e2",
                  borderRadius: 999,
                  padding: "1px 6px",
                }}
              >
                Mandatory
              </span>
            )}
            {confCfg && q.answer_status !== "unanswered" && (
              <span
                style={{
                  fontSize: 10.5,
                  color: confCfg.color,
                  background: confCfg.bg,
                  borderRadius: 999,
                  padding: "1px 7px",
                  fontWeight: 600,
                }}
              >
                {confCfg.label}
                {q.confidence_score != null ? ` · ${q.confidence_score}%` : ""}
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--ink)",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {q.question_text}
          </p>
        </div>

        {/* Quick approve / unapprove */}
        {(q.answer_status === "drafted" ||
          q.answer_status === "needs-review") &&
          !editing && (
            <button
              className="btn"
              onClick={approveDirect}
              disabled={saving}
              style={{ fontSize: 11.5, padding: "3px 10px", flexShrink: 0 }}
            >
              ✓ Approve
            </button>
          )}
        {q.answer_status === "approved" && !editing && (
          <button
            className="btn ghost"
            onClick={unapprove}
            disabled={saving}
            style={{ fontSize: 11.5, padding: "3px 10px", flexShrink: 0 }}
          >
            Unapprove
          </button>
        )}
      </div>

      {/* Needs-review callout */}
      {q.answer_status === "needs-review" && q.confidence_reason && (
        <div
          style={{
            padding: "6px 10px",
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: "var(--r-sm)",
            fontSize: 12,
            color: "#92400e",
            marginBottom: 8,
          }}
        >
          {q.confidence_reason}
        </div>
      )}

      {/* Streaming preview */}
      {isStreaming && (
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            lineHeight: 1.65,
            margin: "4px 0 8px",
            fontStyle: "italic",
          }}
        >
          {streamingText}
          <span className="cursor-blink">▌</span>
        </p>
      )}

      {/* Answer display */}
      {displayText && !editing && !isStreaming && (
        <div style={{ marginTop: 4 }}>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: "var(--ink-2)",
              margin: "0 0 8px",
              whiteSpace: "pre-wrap",
              background: "var(--surface-2)",
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--border)",
            }}
          >
            {displayText}
          </p>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(q.ai_draft ?? "");
                setEditing(true);
              }}
              style={{ fontSize: 11.5, padding: "3px 10px" }}
            >
              Edit
            </button>
            <button
              className="btn ghost"
              onClick={answerSingle}
              disabled={answering}
              style={{ fontSize: 11.5, padding: "3px 10px" }}
            >
              {answering ? "Regenerating…" : "Regenerate"}
            </button>
            {q.citations && q.citations.length > 0 && (
              <button
                className="btn ghost"
                onClick={() => setShowCitations((v) => !v)}
                style={{ fontSize: 11.5, padding: "3px 10px" }}
              >
                {showCitations
                  ? "Hide sources"
                  : `Sources (${q.citations.length})`}
              </button>
            )}
            <span
              style={{
                fontSize: 11,
                color: overLimit ? "#dc2626" : "var(--muted)",
                marginLeft: "auto",
                fontWeight: overLimit ? 600 : 400,
              }}
            >
              {wc}
              {q.word_limit ? ` / ${q.word_limit}` : ""} words
            </span>
          </div>
        </div>
      )}

      {/* Unanswered CTA */}
      {q.answer_status === "unanswered" && !isStreaming && (
        <button
          className="btn ghost"
          onClick={answerSingle}
          disabled={answering}
          style={{ fontSize: 12, padding: "4px 12px", marginTop: 4 }}
        >
          {answering ? "Generating answer…" : "Generate answer"}
        </button>
      )}

      {/* Edit mode */}
      {editing && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            style={{
              width: "100%",
              fontSize: 13,
              lineHeight: 1.6,
              padding: "8px 12px",
              border: "1.5px solid var(--accent)",
              borderRadius: "var(--r-sm)",
              background: "var(--bg)",
              color: "var(--ink)",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn"
              onClick={() => saveDraft(false)}
              disabled={saving}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              className="btn primary"
              onClick={() => saveDraft(true)}
              disabled={saving}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              Save & approve
            </button>
            <button
              className="btn ghost"
              onClick={() => setEditing(false)}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Cancel
            </button>
            <span
              style={{
                fontSize: 11,
                color: overLimit ? "#dc2626" : "var(--muted)",
                marginLeft: "auto",
                fontWeight: overLimit ? 600 : 400,
              }}
            >
              {wc}
              {q.word_limit ? ` / ${q.word_limit}` : ""} words
            </span>
          </div>
        </div>
      )}

      {/* Citations */}
      {showCitations && q.citations && q.citations.length > 0 && (
        <div
          style={{
            marginTop: 10,
            borderTop: "1px solid var(--border)",
            paddingTop: 10,
          }}
        >
          {q.citations.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "6px 0",
                borderBottom:
                  i < (q.citations?.length ?? 0) - 1
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <p
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--ink)",
                  margin: "0 0 2px",
                }}
              >
                {c.source_title}
              </p>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--muted)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {c.excerpt}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export function QuestionsSection({
  opportunityId,
  initialTotal,
  onApproval,
}: {
  opportunityId: string;
  initialTotal: number;
  onApproval?: () => void;
}) {
  const [questions, setQuestions] = useState<OppQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [answeringAll, setAnsweringAll] = useState(false);
  const [answerProgress, setAnswerProgress] = useState<{
    answered: number;
    total: number;
  } | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => {
    if (initialTotal > 0) loadQuestions();
  }, [initialTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadQuestions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/questions`);
      const data = (await res.json()) as { questions: OppQuestion[] };
      setQuestions(
        (data.questions ?? []).filter((q) => q.question_class === "question"),
      );
    } finally {
      setLoading(false);
    }
  }

  function updateQ(updated: OppQuestion) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updated.id ? updated : q)),
    );
  }

  async function answerAll() {
    const unanswered = questions
      .filter((q) => q.answer_status === "unanswered")
      .map((q) => q.id);
    if (unanswered.length === 0) return;

    setAnsweringAll(true);
    setAnswerProgress({ answered: 0, total: unanswered.length });

    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/answer-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIds: unanswered }),
        },
      );
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const evt = JSON.parse(line.slice(5)) as {
                answered?: number;
                total?: number;
              };
              if (evt.answered != null && evt.total != null) {
                setAnswerProgress({ answered: evt.answered, total: evt.total });
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // network error — still reload below
    }

    // Single reload after all questions are answered
    await loadQuestions();
    setAnsweringAll(false);
    setAnswerProgress(null);
  }

  async function approveAllHighConfidence() {
    setApprovingAll(true);
    const toApprove = questions.filter(
      (q) => q.answer_status === "drafted" && q.confidence_level === "high",
    );
    await Promise.allSettled(
      toApprove.map(async (q) => {
        const res = await fetch(
          `/api/opportunities/${opportunityId}/questions/${q.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answer_status: "approved" }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as { question: OppQuestion };
          updateQ(data.question);
        }
      }),
    );
    setApprovingAll(false);
    onApproval?.();
  }

  if (initialTotal === 0) return null;

  const approved = questions.filter(
    (q) => q.answer_status === "approved",
  ).length;
  const drafted = questions.filter((q) => q.answer_status === "drafted").length;
  const needsReview = questions.filter(
    (q) => q.answer_status === "needs-review",
  ).length;
  const unanswered = questions.filter(
    (q) => q.answer_status === "unanswered",
  ).length;
  const highConfDrafted = questions.filter(
    (q) => q.answer_status === "drafted" && q.confidence_level === "high",
  ).length;

  const filtered =
    filter === "all"
      ? questions
      : filter === "unanswered"
        ? questions.filter((q) => q.answer_status === "unanswered")
        : questions.filter(
            (q) =>
              q.answer_status === "unanswered" ||
              q.answer_status === "needs-review",
          );

  return (
    <div id="questions">
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--ink)",
              margin: "0 0 4px",
            }}
          >
            Questions to answer
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            AI drafts each answer from your knowledge base. Review, edit, and
            approve before exporting.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {highConfDrafted > 0 && (
            <button
              className="btn ghost"
              onClick={approveAllHighConfidence}
              disabled={approvingAll}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              {approvingAll
                ? "Approving…"
                : `Approve high-confidence (${highConfDrafted})`}
            </button>
          )}
          {unanswered > 0 && (
            <button
              className="btn primary"
              onClick={answerAll}
              disabled={answeringAll}
              style={{ fontSize: 12.5, padding: "6px 14px" }}
            >
              {answeringAll
                ? `Answering… (${answerProgress?.answered ?? 0}/${answerProgress?.total ?? unanswered})`
                : `Answer all (${unanswered})`}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {questions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              height: 6,
              borderRadius: 99,
              overflow: "hidden",
              background: "var(--border)",
              marginBottom: 6,
            }}
          >
            {approved > 0 && (
              <div
                style={{
                  width: `${(approved / questions.length) * 100}%`,
                  background: "#059669",
                  transition: "width 300ms",
                }}
              />
            )}
            {drafted > 0 && (
              <div
                style={{
                  width: `${(drafted / questions.length) * 100}%`,
                  background: "#3b82f6",
                  transition: "width 300ms",
                }}
              />
            )}
            {needsReview > 0 && (
              <div
                style={{
                  width: `${(needsReview / questions.length) * 100}%`,
                  background: "#d97706",
                  transition: "width 300ms",
                }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 11.5 }}>
            <span
              style={{ color: "#059669", cursor: "pointer" }}
              onClick={() => setFilter("all")}
            >
              ✓ {approved} approved
            </span>
            {drafted > 0 && (
              <span style={{ color: "#3b82f6" }}>{drafted} drafted</span>
            )}
            {needsReview > 0 && (
              <span
                style={{ color: "#d97706", cursor: "pointer" }}
                onClick={() => setFilter("attention")}
              >
                ⚠ {needsReview} needs review
              </span>
            )}
            {unanswered > 0 && (
              <span
                style={{ color: "var(--muted)", cursor: "pointer" }}
                onClick={() => setFilter("unanswered")}
              >
                {unanswered} unanswered
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}
      >
        {(["all", "unanswered", "attention"] as FilterTab[]).map((f) => {
          const label =
            f === "all"
              ? `All (${questions.length})`
              : f === "unanswered"
                ? `Unanswered (${unanswered})`
                : `Needs attention (${unanswered + needsReview})`;
          const count =
            f === "all"
              ? questions.length
              : f === "unanswered"
                ? unanswered
                : unanswered + needsReview;
          if (f !== "all" && count === 0) return null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 12,
                padding: "4px 12px",
                borderRadius: 99,
                border: "1px solid",
                borderColor: filter === f ? "var(--accent)" : "var(--border)",
                background:
                  filter === f ? "var(--accent-tint)" : "var(--surface-2)",
                color: filter === f ? "var(--accent)" : "var(--ink)",
                cursor: "pointer",
                fontWeight: filter === f ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Loading questions…
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          {filter === "all"
            ? "No questions extracted."
            : "No items match this filter."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              opportunityId={opportunityId}
              onUpdate={updateQ}
              onAnswered={loadQuestions}
              onApproval={onApproval}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Export section ────────────────────────────────────────────────────────────

export function ExportSection({
  opportunityId,
  requirements,
  questions,
  approvalKey,
}: {
  opportunityId: string;
  requirements: number;
  questions: number;
  approvalKey: number;
}) {
  const [reqApproved, setReqApproved] = useState(0);
  const [qApproved, setQApproved] = useState(0);
  const [mandatoryUnapproved, setMandatoryUnapproved] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (requirements + questions === 0) return;
    fetch(`/api/opportunities/${opportunityId}/questions`)
      .then((r) => r.json())
      .then((data: { questions: OppQuestion[] }) => {
        const all = data.questions ?? [];
        setReqApproved(
          all.filter(
            (q) =>
              q.question_class === "requirement" &&
              q.answer_status === "approved",
          ).length,
        );
        setQApproved(
          all.filter(
            (q) =>
              q.question_class === "question" && q.answer_status === "approved",
          ).length,
        );
        setMandatoryUnapproved(
          all
            .filter(
              (q) =>
                q.is_mandatory &&
                q.question_class !== "guidance" &&
                q.answer_status !== "approved",
            )
            .map((q) =>
              q.question_text.length > 80
                ? q.question_text.slice(0, 80) + "…"
                : q.question_text,
            ),
        );
        setLoaded(true);
      })
      .catch(() => {});
  }, [opportunityId, requirements, questions, approvalKey]);

  if (requirements + questions === 0) return null;

  return (
    <div
      id="export"
      className="card card-pad"
      style={{ background: "var(--surface-2)" }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ink)",
          margin: "0 0 6px",
        }}
      >
        Review & export
      </h2>

      {loaded && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            {requirements > 0 && (
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Requirements:{" "}
                <strong style={{ color: "#059669" }}>
                  {reqApproved}/{requirements}
                </strong>{" "}
                approved
              </span>
            )}
            {questions > 0 && (
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Questions:{" "}
                <strong style={{ color: "#059669" }}>
                  {qApproved}/{questions}
                </strong>{" "}
                approved
              </span>
            )}
          </div>

          {mandatoryUnapproved.length > 0 && (
            <div
              style={{
                padding: "10px 14px",
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                borderRadius: "var(--r-sm)",
                marginBottom: 14,
              }}
            >
              <p
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#92400e",
                  margin: "0 0 6px",
                }}
              >
                ⚠ {mandatoryUnapproved.length} mandatory item
                {mandatoryUnapproved.length !== 1 ? "s" : ""} not yet approved —
                approve {mandatoryUnapproved.length !== 1 ? "these" : "this"} to
                export the approved response:
              </p>
              <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                {mandatoryUnapproved.map((t, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12,
                      color: "#92400e",
                      marginBottom: 2,
                    }}
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {mandatoryUnapproved.length > 0 ? (
          <span
            className="btn primary"
            aria-disabled="true"
            title="Approve all mandatory items first"
            style={{
              fontSize: 13,
              padding: "7px 18px",
              opacity: 0.5,
              cursor: "not-allowed",
              pointerEvents: "none",
            }}
          >
            Export approved only
          </span>
        ) : (
          <a
            href={`/api/opportunities/${opportunityId}/export-response?mode=approved`}
            className="btn primary"
            style={{ fontSize: 13, padding: "7px 18px" }}
          >
            Export approved only
          </a>
        )}
        <a
          href={`/api/opportunities/${opportunityId}/export-response`}
          className="btn"
          style={{ fontSize: 13, padding: "7px 18px" }}
        >
          Export all answered
        </a>
      </div>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--muted)",
          marginTop: 10,
        }}
      >
        Exports a DOCX with your compliance statements and answers. “Approved
        only” excludes drafts and flagged items
        {mandatoryUnapproved.length > 0
          ? " and is locked until every mandatory item is approved."
          : "."}
      </p>
    </div>
  );
}
