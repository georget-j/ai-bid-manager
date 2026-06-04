"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ExtractedQuestion } from "@/app/api/opportunities/[id]/extract-questions/route";

interface SavedQuestion {
  id: string;
  question_text: string;
  section_ref: string | null;
  question_type: string;
  word_limit: number | null;
  is_mandatory: boolean;
  ai_draft: string | null;
  answer_status: string;
}

interface ProgressEvent {
  questionId: string;
  status: "drafted" | "needs-review";
  preview: string;
  answered: number;
  total: number;
}

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> =
  {
    technical: { label: "Technical", color: "#1d4ed8", bg: "#dbeafe" },
    experience: { label: "Experience", color: "#7c3aed", bg: "#ede9fe" },
    financial: { label: "Financial", color: "#059669", bg: "#d1fae5" },
    "social-value": { label: "Social value", color: "#b45309", bg: "#fef3c7" },
    general: { label: "General", color: "#6b7280", bg: "#f3f4f6" },
  };

const STATUS_BADGE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  unanswered: { label: "Unanswered", color: "#6b7280", bg: "#f3f4f6" },
  drafted: { label: "Drafted", color: "#059669", bg: "#d1fae5" },
  "needs-review": { label: "Needs review", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "Approved", color: "#1d4ed8", bg: "#dbeafe" },
};

function Chip({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: bg,
        color,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

export function QuestionsPanel({
  opportunityId,
  opportunityTitle,
}: {
  opportunityId: string;
  opportunityTitle: string;
}) {
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[] | null>(
    null,
  );
  const [extracted, setExtracted] = useState<ExtractedQuestion[] | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number }>(
    { answered: 0, total: 0 },
  );
  const [generatingMatrix, setGeneratingMatrix] = useState(false);
  const [matrixId, setMatrixId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load saved questions on mount
  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/questions`)
      .then((r) => r.json())
      .then((d: { questions?: SavedQuestion[] }) => {
        setSavedQuestions(d.questions ?? []);
      })
      .catch(() => setSavedQuestions([]));
  }, [opportunityId]);

  async function extractQuestions() {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/extract-questions`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        questions?: ExtractedQuestion[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Extraction failed");
      } else {
        setExtracted(data.questions ?? []);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setExtracting(false);
    }
  }

  async function saveQuestions(questions: ExtractedQuestion[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const data = (await res.json()) as {
        questions?: SavedQuestion[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
      } else {
        setSavedQuestions(data.questions ?? []);
        setExtracted(null);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function answerAll(questionIds?: string[]) {
    if (questionIds?.length === 1) {
      setAnsweringId(questionIds[0]);
    } else {
      setAnswering(true);
      setProgress({ answered: 0, total: 0 });
    }
    setError(null);

    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/answer-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(questionIds ? { questionIds } : {}),
        },
      );

      if (!res.ok || !res.body) {
        setError("Answer generation failed");
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const eventMatch = chunk.match(/^event: (\w+)/m);
          const dataMatch = chunk.match(/^data: (.+)/m);
          if (!dataMatch) continue;

          const eventType = eventMatch?.[1] ?? "message";
          try {
            const payload = JSON.parse(dataMatch[1]);

            if (eventType === "start") {
              setProgress({ answered: 0, total: payload.total as number });
            } else if (eventType === "progress") {
              const p = payload as ProgressEvent;
              setProgress({ answered: p.answered, total: p.total });
              setSavedQuestions((prev) =>
                (prev ?? []).map((q) =>
                  q.id === p.questionId
                    ? { ...q, answer_status: p.status, ai_draft: p.preview }
                    : q,
                ),
              );
            }
          } catch {
            // malformed event — skip
          }
        }
      }

      // Refresh from DB to get full drafts
      const refreshed = await fetch(
        `/api/opportunities/${opportunityId}/questions`,
      );
      const refreshedData = (await refreshed.json()) as {
        questions?: SavedQuestion[];
      };
      setSavedQuestions(refreshedData.questions ?? []);
    } catch {
      setError("Network error during answer generation.");
    } finally {
      setAnswering(false);
      setAnsweringId(null);
    }
  }

  async function generateMatrix() {
    if (!savedQuestions || savedQuestions.length === 0) return;
    setGeneratingMatrix(true);
    setError(null);
    try {
      const res = await fetch("/api/compliance-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity_id: opportunityId,
          title: opportunityTitle,
          requirements: savedQuestions.map((q) => ({
            requirement_text: q.question_text,
            section_reference: q.section_ref ?? undefined,
            mandatory: q.is_mandatory,
          })),
        }),
      });
      const data = (await res.json()) as { matrix_id?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Matrix generation failed");
      } else if (data.matrix_id) {
        setMatrixId(data.matrix_id);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGeneratingMatrix(false);
    }
  }

  // ── Render: not yet loaded ────────────────────────────────────────────────
  if (savedQuestions === null) {
    return (
      <div
        className="card card-pad"
        id="questions"
        style={{ marginBottom: 16 }}
      >
        <div className="eyebrow">ITT Questions</div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          Loading…
        </p>
      </div>
    );
  }

  const unansweredCount = savedQuestions.filter(
    (q) => q.answer_status === "unanswered",
  ).length;
  const draftedCount = savedQuestions.filter(
    (q) => q.answer_status === "drafted" || q.answer_status === "approved",
  ).length;

  // ── Render: extraction preview (before saving) ────────────────────────────
  if (extracted !== null) {
    return (
      <div
        className="card card-pad"
        id="questions"
        style={{ marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <div className="eyebrow">ITT Questions</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {extracted.length} questions extracted — review and save
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn ghost"
              onClick={() => setExtracted(null)}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              Discard
            </button>
            <button
              className="btn primary"
              onClick={() => saveQuestions(extracted)}
              disabled={saving || extracted.length === 0}
              style={{ fontSize: 12, padding: "4px 14px" }}
            >
              {saving ? "Saving…" : `Save ${extracted.length} questions`}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 10 }}>
            {error}
          </p>
        )}

        {extracted.map((q, i) => {
          const typeBadge = TYPE_BADGE[q.question_type] ?? TYPE_BADGE.general;
          return (
            <div
              key={i}
              style={{
                padding: "10px 0",
                borderBottom:
                  i < extracted.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 4,
                }}
              >
                <Chip
                  label={typeBadge.label}
                  color={typeBadge.color}
                  bg={typeBadge.bg}
                />
                {!q.is_mandatory && (
                  <Chip label="Optional" color="#6b7280" bg="#f3f4f6" />
                )}
                {q.word_limit && (
                  <Chip
                    label={`${q.word_limit}w`}
                    color="#6b7280"
                    bg="#f3f4f6"
                  />
                )}
                {q.section_ref && (
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {q.section_ref}
                  </span>
                )}
              </div>
              <p
                style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}
              >
                {q.question_text}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render: no questions yet ──────────────────────────────────────────────
  if (savedQuestions.length === 0) {
    return (
      <div
        className="card card-pad"
        id="questions"
        style={{ marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div className="eyebrow">ITT Questions</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Extract tender questions from the opportunity description
            </p>
          </div>
          <button
            className="btn primary"
            onClick={extractQuestions}
            disabled={extracting}
            style={{ fontSize: 12, padding: "4px 14px" }}
          >
            {extracting ? "Extracting…" : "Extract Questions"}
          </button>
        </div>
        {error && (
          <p style={{ fontSize: 13, color: "#dc2626", marginTop: 10 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Render: saved questions list ──────────────────────────────────────────
  return (
    <div
      className="card"
      id="questions"
      style={{ marginBottom: 16, overflow: "hidden" }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div className="eyebrow">ITT Questions</div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {savedQuestions.length} questions
            {draftedCount > 0 && (
              <span style={{ color: "#059669" }}>
                {" "}
                · {draftedCount} drafted
              </span>
            )}
            {unansweredCount > 0 && (
              <span style={{ color: "var(--muted)" }}>
                {" "}
                · {unansweredCount} unanswered
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn ghost"
            onClick={extractQuestions}
            disabled={extracting || answering}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {extracting ? "Extracting…" : "Re-extract"}
          </button>
          {unansweredCount > 0 && (
            <button
              className="btn primary"
              onClick={() => answerAll()}
              disabled={answering}
              style={{ fontSize: 12, padding: "4px 14px" }}
            >
              {answering
                ? `Answering ${progress.answered}/${progress.total}…`
                : `Answer All (${unansweredCount})`}
            </button>
          )}
          {matrixId ? (
            <Link href={`/compliance/${matrixId}`} className="btn">
              ✓ View matrix
            </Link>
          ) : (
            <button
              className="btn"
              onClick={generateMatrix}
              disabled={generatingMatrix}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              {generatingMatrix ? "Generating…" : "Create Compliance Matrix"}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {answering && progress.total > 0 && (
        <div
          style={{
            height: 3,
            background: "var(--bg-tint)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(progress.answered / progress.total) * 100}%`,
              background: "var(--accent)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "8px 20px",
            fontSize: 13,
            color: "#dc2626",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {error}
        </div>
      )}

      {/* Question rows */}
      {savedQuestions.map((q) => {
        const typeBadge = TYPE_BADGE[q.question_type] ?? TYPE_BADGE.general;
        const statusBadge =
          STATUS_BADGE[q.answer_status] ?? STATUS_BADGE.unanswered;
        const isAnsweringThis = answeringId === q.id;
        const localDraft = draftEdits[q.id];
        const displayDraft = localDraft !== undefined ? localDraft : q.ai_draft;

        return (
          <div
            key={q.id}
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                  flex: 1,
                }}
              >
                <Chip
                  label={typeBadge.label}
                  color={typeBadge.color}
                  bg={typeBadge.bg}
                />
                <Chip
                  label={statusBadge.label}
                  color={statusBadge.color}
                  bg={statusBadge.bg}
                />
                {!q.is_mandatory && (
                  <Chip label="Optional" color="#6b7280" bg="#f3f4f6" />
                )}
                {q.word_limit && (
                  <Chip
                    label={`${q.word_limit}w`}
                    color="#6b7280"
                    bg="#f3f4f6"
                  />
                )}
                {q.section_ref && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      fontStyle: "italic",
                    }}
                  >
                    {q.section_ref}
                  </span>
                )}
              </div>
              {q.answer_status === "unanswered" && (
                <button
                  className="btn ghost"
                  onClick={() => answerAll([q.id])}
                  disabled={isAnsweringThis || answering}
                  style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0 }}
                >
                  {isAnsweringThis ? "Answering…" : "Answer"}
                </button>
              )}
            </div>

            <p
              style={{
                fontSize: 13.5,
                color: "var(--ink)",
                lineHeight: 1.5,
                marginBottom: displayDraft ? 10 : 0,
              }}
            >
              {q.question_text}
            </p>

            {displayDraft && (
              <textarea
                value={displayDraft}
                onChange={(e) =>
                  setDraftEdits((prev) => ({
                    ...prev,
                    [q.id]: e.target.value,
                  }))
                }
                rows={4}
                style={{
                  width: "100%",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--ink-2)",
                  background: "var(--bg-tint)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: "8px 10px",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
