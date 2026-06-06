"use client";

import { useState, useEffect, useRef } from "react";

interface OppQuestion {
  id: string;
  question_text: string;
  section_ref: string | null;
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

const FIT_CONFIG = {
  high: { label: "High fit", color: "#059669", bg: "#d1fae5" },
  medium: { label: "Review needed", color: "#d97706", bg: "#fef3c7" },
  low: { label: "Gap", color: "#dc2626", bg: "#fee2e2" },
} as const;

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Per-requirement card ──────────────────────────────────────────────────────

function RequirementCard({
  req,
  opportunityId,
  onUpdate,
  onAnswered,
  onApproval,
}: {
  req: OppQuestion;
  opportunityId: string;
  onUpdate: (updated: OppQuestion) => void;
  onAnswered: () => Promise<void>;
  onApproval?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(req.ai_draft ?? "");
  const [saving, setSaving] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  // Keep draft in sync if parent updates
  useEffect(() => {
    if (!editing) setDraft(req.ai_draft ?? "");
  }, [req.ai_draft, editing]);

  async function startAnswering() {
    setAnswering(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/answer-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIds: [req.id] }),
        },
      );
      if (res.ok && res.body) {
        // Drain the stream — DB is written before each SSE event
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      await onAnswered();
    } catch {
      // network error — still reload
      await onAnswered();
    } finally {
      setAnswering(false);
    }
  }

  async function saveDraft(approve = false) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${req.id}`,
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

  async function approve() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${req.id}`,
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

  const fitConfig =
    req.confidence_level && req.confidence_level in FIT_CONFIG
      ? FIT_CONFIG[req.confidence_level as keyof typeof FIT_CONFIG]
      : null;

  const statusColor =
    req.answer_status === "approved"
      ? "#059669"
      : req.answer_status === "drafted" || req.answer_status === "needs-review"
        ? "#d97706"
        : "var(--muted)";

  const statusLabel =
    req.answer_status === "approved"
      ? "✓ Approved"
      : req.answer_status === "drafted"
        ? "Draft"
        : req.answer_status === "needs-review"
          ? "Needs review"
          : "Not assessed";

  const wc = wordCount(draft);

  return (
    <div
      className="card"
      style={{
        padding: "14px 18px",
        borderLeft: `3px solid ${
          req.answer_status === "approved"
            ? "#059669"
            : req.answer_status === "needs-review"
              ? "#d97706"
              : req.answer_status === "drafted"
                ? "#3b82f6"
                : "var(--border)"
        }`,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            {req.section_ref && (
              <span
                style={{
                  fontSize: 10.5,
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                }}
              >
                {req.section_ref}
              </span>
            )}
            {req.is_mandatory && (
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
            {fitConfig && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: fitConfig.color,
                  background: fitConfig.bg,
                  borderRadius: 999,
                  padding: "1px 7px",
                }}
              >
                {fitConfig.label}
                {req.confidence_score != null
                  ? ` · ${req.confidence_score}%`
                  : ""}
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
            {req.question_text}
          </p>
        </div>

        {/* Status + actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>
            {statusLabel}
          </span>
          {req.answer_status === "unanswered" && (
            <button
              className="btn primary"
              onClick={startAnswering}
              disabled={answering}
              style={{ fontSize: 11.5, padding: "3px 10px" }}
            >
              {answering ? "Drafting…" : "Draft statement"}
            </button>
          )}
          {(req.answer_status === "drafted" ||
            req.answer_status === "needs-review") &&
            !editing && (
              <button
                className="btn"
                onClick={() => approve()}
                disabled={saving}
                style={{ fontSize: 11.5, padding: "3px 10px" }}
              >
                ✓ Approve
              </button>
            )}
        </div>
      </div>

      {/* Needs-review callout */}
      {req.answer_status === "needs-review" && req.confidence_reason && (
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
          {req.confidence_reason}
        </div>
      )}

      {/* Compliance statement */}
      {req.ai_draft && !editing && (
        <div style={{ marginTop: 6 }}>
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
            {req.ai_draft}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(req.ai_draft ?? "");
                setEditing(true);
              }}
              style={{ fontSize: 11.5, padding: "3px 10px" }}
            >
              Edit
            </button>
            <button
              className="btn ghost"
              onClick={startAnswering}
              disabled={answering}
              style={{ fontSize: 11.5, padding: "3px 10px" }}
            >
              {answering ? "Regenerating…" : "Regenerate"}
            </button>
            {req.citations && req.citations.length > 0 && (
              <button
                className="btn ghost"
                onClick={() => setShowCitations((v) => !v)}
                style={{ fontSize: 11.5, padding: "3px 10px" }}
              >
                {showCitations
                  ? "Hide sources"
                  : `Sources (${req.citations.length})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Edit textarea */}
      {editing && (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
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
              alignItems: "center",
              gap: 8,
              marginTop: 6,
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
                fontSize: 11.5,
                color: "var(--muted)",
                marginLeft: "auto",
              }}
            >
              {wc} word{wc !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Citations */}
      {showCitations && req.citations && req.citations.length > 0 && (
        <div
          style={{
            marginTop: 10,
            borderTop: "1px solid var(--border)",
            paddingTop: 10,
          }}
        >
          {req.citations.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "6px 0",
                borderBottom:
                  i < (req.citations?.length ?? 0) - 1
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

export function RequirementsSection({
  opportunityId,
  initialTotal,
  onApproval,
}: {
  opportunityId: string;
  initialTotal: number;
  onApproval?: () => void;
}) {
  const [requirements, setRequirements] = useState<OppQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [answeringAll, setAnsweringAll] = useState(false);
  const [answerProgress, setAnswerProgress] = useState<{
    answered: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (initialTotal > 0) loadRequirements();
  }, [initialTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRequirements() {
    setLoading(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/questions`);
      const data = (await res.json()) as { questions: OppQuestion[] };
      setRequirements(
        (data.questions ?? []).filter(
          (q) => q.question_class === "requirement",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function updateReq(updated: OppQuestion) {
    setRequirements((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    );
  }

  async function draftAll() {
    const unanswered = requirements
      .filter((r) => r.answer_status === "unanswered")
      .map((r) => r.id);
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
      // network error — still reload
    }

    await loadRequirements();
    setAnsweringAll(false);
    setAnswerProgress(null);
  }

  if (initialTotal === 0) return null;

  const approved = requirements.filter(
    (r) => r.answer_status === "approved",
  ).length;
  const drafted = requirements.filter(
    (r) => r.answer_status === "drafted" || r.answer_status === "needs-review",
  ).length;
  const unanswered = requirements.filter(
    (r) => r.answer_status === "unanswered",
  ).length;

  return (
    <div id="requirements">
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
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
            Compliance requirements
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            For each requirement, draft a compliance statement that evidences
            how you meet it. These go directly into the export.
          </p>
        </div>
        {unanswered > 0 && (
          <button
            className="btn primary"
            onClick={draftAll}
            disabled={answeringAll}
            style={{ fontSize: 12.5, padding: "6px 14px", flexShrink: 0 }}
          >
            {answeringAll
              ? `Drafting… (${answerProgress?.answered ?? 0}/${answerProgress?.total ?? unanswered})`
              : `Draft all (${unanswered})`}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {requirements.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              gap: 4,
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
                  width: `${(approved / requirements.length) * 100}%`,
                  background: "#059669",
                  transition: "width 300ms",
                }}
              />
            )}
            {drafted > 0 && (
              <div
                style={{
                  width: `${(drafted / requirements.length) * 100}%`,
                  background: "#3b82f6",
                  transition: "width 300ms",
                }}
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 11.5,
              color: "var(--muted)",
            }}
          >
            <span style={{ color: "#059669" }}>✓ {approved} approved</span>
            {drafted > 0 && (
              <span style={{ color: "#3b82f6" }}>{drafted} drafted</span>
            )}
            {unanswered > 0 && <span>{unanswered} not yet assessed</span>}
          </div>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Loading requirements…
        </p>
      ) : requirements.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No requirements extracted. Go to Step 4 to extract from the tender
          description or documents.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {requirements.map((req) => (
            <RequirementCard
              key={req.id}
              req={req}
              opportunityId={opportunityId}
              onUpdate={updateReq}
              onAnswered={loadRequirements}
              onApproval={onApproval}
            />
          ))}
        </div>
      )}
    </div>
  );
}
