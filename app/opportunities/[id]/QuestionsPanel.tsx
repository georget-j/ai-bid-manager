"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { ExtractedQuestion } from "@/app/api/opportunities/[id]/extract-questions/route";

type QuestionClass = "question" | "requirement" | "guidance";

interface Citation {
  source_title: string;
  chunk_id: string;
  excerpt: string;
  relevance: string;
}

interface SavedQuestion {
  id: string;
  question_text: string;
  section_ref: string | null;
  question_type: string;
  question_class: QuestionClass;
  sort_order: number | null;
  word_limit: number | null;
  is_mandatory: boolean;
  ai_draft: string | null;
  answer_status: string;
  confidence_level: "high" | "medium" | "low" | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  citations: Citation[] | null;
}

interface ProgressEvent {
  questionId: string;
  status: "drafted" | "needs-review";
  preview: string;
  answered: number;
  total: number;
}

type FilterTab = "all" | "question" | "requirement" | "guidance";

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
  unanswered: { label: "No answer", color: "#6b7280", bg: "#f3f4f6" },
  drafted: { label: "AI answered", color: "#1d4ed8", bg: "#dbeafe" },
  "needs-review": { label: "Needs review", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "✓ Approved", color: "#059669", bg: "#d1fae5" },
};

const CONF_BADGE: Record<string, { label: string; color: string; bg: string }> =
  {
    high: { label: "High confidence", color: "#059669", bg: "#d1fae5" },
    medium: { label: "Medium confidence", color: "#d97706", bg: "#fef3c7" },
    low: { label: "Low confidence", color: "#dc2626", bg: "#fee2e2" },
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

function SectionHeader({
  label,
  counts,
}: {
  label: string;
  counts: { question: number; requirement: number; guidance: number };
}) {
  const parts: string[] = [];
  if (counts.question > 0)
    parts.push(
      `${counts.question} question${counts.question !== 1 ? "s" : ""}`,
    );
  if (counts.requirement > 0)
    parts.push(
      `${counts.requirement} requirement${counts.requirement !== 1 ? "s" : ""}`,
    );
  if (counts.guidance > 0)
    parts.push(`${counts.guidance} note${counts.guidance !== 1 ? "s" : ""}`);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 20px 6px",
        borderBottom: "1px solid var(--border)",
        borderTop: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--muted)",
          fontStyle: "italic",
        }}
      >
        {parts.join(" · ")}
      </span>
    </div>
  );
}

function GuidanceBanner({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 20px",
        background: "color-mix(in oklch, #f59e0b 6%, var(--surface))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: "#b45309",
          flexShrink: 0,
          marginTop: 1,
          lineHeight: 1,
        }}
      >
        ℹ
      </span>
      <p
        style={{
          fontSize: 12.5,
          color: "#92400e",
          lineHeight: 1.55,
          fontStyle: "italic",
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
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
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    new Set(),
  );
  const [answersReadyCount, setAnswersReadyCount] = useState<number | null>(
    null,
  );
  const [fetchError, setFetchError] = useState(false);
  const [confirmReextract, setConfirmReextract] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);

  // Load saved questions on mount
  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/questions`)
      .then((r) => r.json())
      .then((d: { questions?: SavedQuestion[] }) => {
        const qs = (d.questions ?? []).slice().sort((a, b) => {
          if (a.sort_order !== null && b.sort_order !== null)
            return a.sort_order - b.sort_order;
          if (a.sort_order !== null) return -1;
          if (b.sort_order !== null) return 1;
          return 0;
        });
        setSavedQuestions(qs);
      })
      .catch(() => {
        setSavedQuestions([]);
        setFetchError(true);
      });
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

      // Refresh from DB to get full drafts + new confidence/citations
      const refreshed = await fetch(
        `/api/opportunities/${opportunityId}/questions`,
      );
      const refreshedData = (await refreshed.json()) as {
        questions?: SavedQuestion[];
      };
      const sorted = (refreshedData.questions ?? []).slice().sort((a, b) => {
        if (a.sort_order !== null && b.sort_order !== null)
          return a.sort_order - b.sort_order;
        if (a.sort_order !== null) return -1;
        if (b.sort_order !== null) return 1;
        return 0;
      });
      setSavedQuestions(sorted);
      // Show "answers ready" banner — count questions that now have a draft
      const readyCount = sorted.filter(
        (q) =>
          q.question_class !== "guidance" &&
          q.ai_draft &&
          q.answer_status !== "unanswered",
      ).length;
      if (readyCount > 0 && !questionIds) {
        setAnswersReadyCount(readyCount);
        setTimeout(() => setAnswersReadyCount(null), 8000);
      }
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
          requirements: savedQuestions
            .filter((q) => q.question_class !== "guidance")
            .map((q) => ({
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

  async function approveQuestion(qId: string) {
    await fetch(`/api/opportunities/${opportunityId}/questions/${qId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer_status: "approved" }),
    });
    setSavedQuestions((prev) =>
      (prev ?? []).map((sq) =>
        sq.id === qId ? { ...sq, answer_status: "approved" } : sq,
      ),
    );
  }

  async function approveAllHighConfidence() {
    const targets = (savedQuestions ?? []).filter(
      (q) =>
        q.question_class !== "guidance" &&
        q.answer_status === "drafted" &&
        q.confidence_level === "high",
    );
    if (targets.length === 0) return;
    setApprovingAll(true);
    for (const q of targets) {
      await approveQuestion(q.id);
    }
    setApprovingAll(false);
  }

  async function saveDraft(
    qId: string,
    text: string,
    approve: boolean = false,
  ) {
    setSavingIds((prev) => new Set(prev).add(qId));
    try {
      const newStatus = approve ? "approved" : "drafted";
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${qId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ai_draft: text, answer_status: newStatus }),
        },
      );
      if (res.ok) {
        setSavedQuestions((prev) =>
          (prev ?? []).map((q) =>
            q.id === qId
              ? { ...q, ai_draft: text, answer_status: newStatus }
              : q,
          ),
        );
        setDraftEdits((prev) => {
          const next = { ...prev };
          delete next[qId];
          return next;
        });
        setEditingIds((prev) => {
          const next = new Set(prev);
          next.delete(qId);
          return next;
        });
      }
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(qId);
        return next;
      });
    }
  }

  function toggleSources(qId: string) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  }

  // ── Derived counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    if (!savedQuestions) return { question: 0, requirement: 0, guidance: 0 };
    return {
      question: savedQuestions.filter((q) => q.question_class === "question")
        .length,
      requirement: savedQuestions.filter(
        (q) => q.question_class === "requirement",
      ).length,
      guidance: savedQuestions.filter((q) => q.question_class === "guidance")
        .length,
    };
  }, [savedQuestions]);

  const unansweredAnswerable = useMemo(
    () =>
      (savedQuestions ?? []).filter(
        (q) =>
          q.question_class !== "guidance" && q.answer_status === "unanswered",
      ),
    [savedQuestions],
  );

  const draftedCount = useMemo(
    () =>
      (savedQuestions ?? []).filter(
        (q) =>
          q.question_class !== "guidance" &&
          q.ai_draft &&
          q.answer_status !== "unanswered",
      ).length,
    [savedQuestions],
  );

  const statusCounts = useMemo(() => {
    const answerable = (savedQuestions ?? []).filter(
      (q) => q.question_class !== "guidance",
    );
    return {
      total: answerable.length,
      approved: answerable.filter((q) => q.answer_status === "approved").length,
      drafted: answerable.filter((q) => q.answer_status === "drafted").length,
      needsReview: answerable.filter((q) => q.answer_status === "needs-review")
        .length,
      unanswered: answerable.filter((q) => q.answer_status === "unanswered")
        .length,
      highConfidenceDrafted: answerable.filter(
        (q) => q.answer_status === "drafted" && q.confidence_level === "high",
      ).length,
    };
  }, [savedQuestions]);

  const filteredQuestions = useMemo(() => {
    if (!savedQuestions) return [];
    if (filterTab === "all") return savedQuestions;
    return savedQuestions.filter((q) => q.question_class === filterTab);
  }, [savedQuestions, filterTab]);

  // Group filtered questions by section_ref
  const sections = useMemo(() => {
    const map = new Map<string, { label: string; items: SavedQuestion[] }>();
    for (const q of filteredQuestions) {
      const key = q.section_ref ?? "__general__";
      if (!map.has(key)) {
        map.set(key, {
          label: q.section_ref ?? "General",
          items: [],
        });
      }
      map.get(key)!.items.push(q);
    }
    return Array.from(map.values());
  }, [filteredQuestions]);

  // ── Render: not yet loaded ────────────────────────────────────────────────
  if (savedQuestions === null) {
    return (
      <div
        className="card card-pad"
        id="questions"
        style={{ marginBottom: 16 }}
      >
        <div className="eyebrow">ITT Questions</div>
        {fetchError ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 8,
            }}
          >
            <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>
              Could not load questions.
            </p>
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: "3px 10px" }}
              onClick={() => {
                setFetchError(false);
                setSavedQuestions(null);
                fetch(`/api/opportunities/${opportunityId}/questions`)
                  .then((r) => r.json())
                  .then((d: { questions?: SavedQuestion[] }) => {
                    const qs = (d.questions ?? []).slice().sort((a, b) => {
                      if (a.sort_order !== null && b.sort_order !== null)
                        return a.sort_order - b.sort_order;
                      if (a.sort_order !== null) return -1;
                      if (b.sort_order !== null) return 1;
                      return 0;
                    });
                    setSavedQuestions(qs);
                  })
                  .catch(() => {
                    setSavedQuestions([]);
                    setFetchError(true);
                  });
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
            Loading…
          </p>
        )}
      </div>
    );
  }

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
              {extracted.length} items extracted — review and save
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
              {saving ? "Saving…" : `Save ${extracted.length} items`}
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
            {counts.question > 0 && <span>{counts.question} questions</span>}
            {counts.requirement > 0 && (
              <span>
                {counts.question > 0 ? " · " : ""}
                {counts.requirement} requirements
              </span>
            )}
            {counts.guidance > 0 && (
              <span>
                {counts.question + counts.requirement > 0 ? " · " : ""}
                {counts.guidance} notes
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn ghost"
            onClick={() => {
              if (savedQuestions.length > 0) {
                setConfirmReextract(true);
              } else {
                extractQuestions();
              }
            }}
            disabled={extracting || answering}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {extracting ? "Extracting…" : "Re-extract"}
          </button>
          {unansweredAnswerable.length > 0 && (
            <button
              className="btn primary"
              onClick={() => answerAll(unansweredAnswerable.map((q) => q.id))}
              disabled={answering}
              style={{ fontSize: 12, padding: "4px 14px" }}
            >
              {answering
                ? `Answering ${progress.answered}/${progress.total}…`
                : `Answer All (${unansweredAnswerable.length})`}
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
          {draftedCount > 0 ? (
            <button
              className="btn primary"
              onClick={() => setShowExportPanel((v) => !v)}
              style={{ fontSize: 12, padding: "4px 12px" }}
            >
              Export DOCX ({statusCounts.approved}/{statusCounts.total})
            </button>
          ) : (
            <span
              style={{
                fontSize: 12,
                color: "var(--muted)",
                padding: "4px 2px",
              }}
              title="Generate answers first, then export"
            >
              Export (answer questions first)
            </span>
          )}
        </div>
      </div>

      {/* Re-extract confirmation */}
      {confirmReextract && (
        <div
          style={{
            padding: "12px 20px",
            background: "#fef3c7",
            borderBottom: "1px solid #fcd34d",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ fontSize: 13, color: "#92400e", margin: 0 }}>
            ⚠ This will delete {savedQuestions.length} existing questions and
            all their answers. Any approved answers will be lost.
          </p>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: "3px 10px" }}
              onClick={() => setConfirmReextract(false)}
            >
              Cancel
            </button>
            <button
              className="btn primary"
              style={{
                fontSize: 12,
                padding: "3px 10px",
                background: "#dc2626",
              }}
              onClick={() => {
                setConfirmReextract(false);
                extractQuestions();
              }}
            >
              Yes, re-extract
            </button>
          </div>
        </div>
      )}

      {/* Export panel */}
      {showExportPanel && (
        <div
          style={{
            padding: "14px 20px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: 10,
            }}
          >
            Export bid pack
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "4px 12px",
              fontSize: 12,
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            <span style={{ color: "#059669" }}>✓ Approved</span>
            <span>{statusCounts.approved}</span>
            <span style={{ color: "#1d4ed8" }}>~ AI answered (draft)</span>
            <span>
              {statusCounts.drafted} — will be labelled &quot;AI DRAFT – not
              reviewed&quot;
            </span>
            <span style={{ color: "#d97706" }}>⚠ Needs review</span>
            <span>
              {statusCounts.needsReview} — will be labelled &quot;AI DRAFT –
              flagged&quot;
            </span>
            <span style={{ color: "var(--muted)" }}>✕ No answer</span>
            <span style={{ color: "var(--muted)" }}>
              {statusCounts.unanswered} — excluded from export
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {statusCounts.approved > 0 && (
              <a
                href={`/api/opportunities/${opportunityId}/export-response?mode=approved`}
                className="btn primary"
                style={{ fontSize: 12, padding: "4px 12px" }}
                onClick={() => setShowExportPanel(false)}
              >
                Export approved only ({statusCounts.approved})
              </a>
            )}
            <a
              href={`/api/opportunities/${opportunityId}/export-response`}
              className="btn"
              style={{ fontSize: 12, padding: "4px 12px" }}
              onClick={() => setShowExportPanel(false)}
            >
              Export all answered ({draftedCount})
            </a>
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => setShowExportPanel(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generation progress bar */}
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

      {/* Status progress bar */}
      {statusCounts.total > 0 && (
        <div
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              display: "flex",
              height: 6,
              borderRadius: 999,
              overflow: "hidden",
              background: "#e5e7eb",
              marginBottom: 6,
            }}
          >
            {statusCounts.approved > 0 && (
              <div
                title={`${statusCounts.approved} approved`}
                style={{
                  width: `${(statusCounts.approved / statusCounts.total) * 100}%`,
                  background: "#059669",
                }}
              />
            )}
            {statusCounts.drafted > 0 && (
              <div
                title={`${statusCounts.drafted} AI answered`}
                style={{
                  width: `${(statusCounts.drafted / statusCounts.total) * 100}%`,
                  background: "#3b82f6",
                }}
              />
            )}
            {statusCounts.needsReview > 0 && (
              <div
                title={`${statusCounts.needsReview} needs review`}
                style={{
                  width: `${(statusCounts.needsReview / statusCounts.total) * 100}%`,
                  background: "#f59e0b",
                }}
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              fontSize: 11,
              color: "var(--muted)",
              flexWrap: "wrap",
            }}
          >
            {statusCounts.approved > 0 && (
              <span style={{ color: "#059669" }}>
                ✓ {statusCounts.approved} approved
              </span>
            )}
            {statusCounts.drafted > 0 && (
              <span style={{ color: "#3b82f6" }}>
                {statusCounts.drafted} AI answered
              </span>
            )}
            {statusCounts.needsReview > 0 && (
              <button
                onClick={() => setFilterTab("all")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#d97706",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                ⚠ {statusCounts.needsReview} needs review
              </button>
            )}
            {statusCounts.unanswered > 0 && (
              <span>{statusCounts.unanswered} unanswered</span>
            )}
            {statusCounts.highConfidenceDrafted > 0 && !approvingAll && (
              <button
                onClick={approveAllHighConfidence}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  color: "#059669",
                  padding: 0,
                  marginLeft: "auto",
                  textDecoration: "underline",
                }}
              >
                ✓ Approve all high-confidence (
                {statusCounts.highConfidenceDrafted})
              </button>
            )}
            {approvingAll && (
              <span style={{ marginLeft: "auto", color: "#059669" }}>
                Approving…
              </span>
            )}
          </div>
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

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["all", `All (${savedQuestions.length})`],
            ["question", `Questions (${counts.question})`],
            ["requirement", `Requirements (${counts.requirement})`],
            ["guidance", `Notes (${counts.guidance})`],
          ] as [FilterTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setFilterTab(tab)}
            style={{
              background:
                filterTab === tab
                  ? "var(--ink)"
                  : "color-mix(in oklch, var(--ink) 8%, transparent)",
              color: filterTab === tab ? "var(--bg)" : "var(--muted)",
              border: "none",
              borderRadius: 999,
              padding: "3px 12px",
              fontSize: 12,
              fontWeight: filterTab === tab ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Answers-ready banner */}
      {answersReadyCount !== null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            background: "#d1fae5",
            borderBottom: "1px solid #6ee7b7",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 13, color: "#065f46", fontWeight: 500 }}>
            ✓ {answersReadyCount} answer
            {answersReadyCount !== 1 ? "s" : ""} generated — scroll down to
            review, edit, and approve
          </span>
          <button
            onClick={() => setAnswersReadyCount(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "#065f46",
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 && (
        <p
          style={{ padding: "16px 20px", fontSize: 13, color: "var(--muted)" }}
        >
          No items in this category.
        </p>
      )}

      {sections.map((section) => {
        const sectionCounts = {
          question: section.items.filter((q) => q.question_class === "question")
            .length,
          requirement: section.items.filter(
            (q) => q.question_class === "requirement",
          ).length,
          guidance: section.items.filter((q) => q.question_class === "guidance")
            .length,
        };

        return (
          <div key={section.label}>
            {sections.length > 1 && (
              <SectionHeader label={section.label} counts={sectionCounts} />
            )}

            {section.items.map((q) => {
              // ── Guidance banner ──────────────────────────────────────────
              if (q.question_class === "guidance") {
                return <GuidanceBanner key={q.id} text={q.question_text} />;
              }

              const typeBadge =
                TYPE_BADGE[q.question_type] ?? TYPE_BADGE.general;
              const statusBadge =
                STATUS_BADGE[q.answer_status] ?? STATUS_BADGE.unanswered;
              const confBadge = q.confidence_level
                ? CONF_BADGE[q.confidence_level]
                : null;
              const isAnsweringThis = answeringId === q.id;
              const isSavingThis = savingIds.has(q.id);
              const sourcesExpanded = expandedSources.has(q.id);
              const localDraft = draftEdits[q.id];
              const displayDraft =
                localDraft !== undefined ? localDraft : q.ai_draft;
              const isDirty =
                localDraft !== undefined && localDraft !== q.ai_draft;
              const citations = q.citations ?? [];
              const isRequirement = q.question_class === "requirement";
              const isEditingThis = editingIds.has(q.id);

              // ── Requirement row ──────────────────────────────────────────
              if (isRequirement && !displayDraft) {
                return (
                  <div
                    key={q.id}
                    style={{
                      padding: "10px 20px",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#b45309",
                        background: "#fef3c7",
                        borderRadius: 999,
                        padding: "2px 8px",
                        flexShrink: 0,
                      }}
                    >
                      REQ
                    </span>
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--ink)",
                        lineHeight: 1.5,
                        flex: 1,
                        margin: 0,
                      }}
                    >
                      {q.question_text}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Chip
                        label={statusBadge.label}
                        color={statusBadge.color}
                        bg={statusBadge.bg}
                      />
                      {q.answer_status === "unanswered" && (
                        <button
                          className="btn ghost"
                          onClick={() => answerAll([q.id])}
                          disabled={isAnsweringThis || answering}
                          style={{
                            fontSize: 11,
                            padding: "3px 10px",
                            flexShrink: 0,
                          }}
                        >
                          {isAnsweringThis ? "Generating…" : "Generate answer"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // ── Standard question card ───────────────────────────────────
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
                      {confBadge && (
                        <Chip
                          label={
                            q.confidence_score
                              ? `${confBadge.label} (${q.confidence_score}%)`
                              : confBadge.label
                          }
                          color={confBadge.color}
                          bg={confBadge.bg}
                        />
                      )}
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
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {(q.answer_status === "drafted" ||
                        q.answer_status === "needs-review") && (
                        <button
                          className="btn primary"
                          onClick={() => approveQuestion(q.id)}
                          style={{
                            fontSize: 11,
                            padding: "3px 10px",
                            background: "#059669",
                          }}
                        >
                          ✓ Approve
                        </button>
                      )}
                      <button
                        className="btn ghost"
                        onClick={() => answerAll([q.id])}
                        disabled={isAnsweringThis || answering}
                        style={{ fontSize: 11, padding: "3px 10px" }}
                      >
                        {isAnsweringThis
                          ? "Answering…"
                          : q.answer_status === "unanswered"
                            ? "Answer"
                            : "Re-answer"}
                      </button>
                    </div>
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
                    <>
                      {/* Label row + needs-review reason */}
                      <div style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom:
                              q.answer_status === "needs-review" &&
                              q.confidence_reason
                                ? 4
                                : 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            AI Draft
                          </span>
                        </div>
                        {q.answer_status === "needs-review" &&
                          q.confidence_reason && (
                            <p
                              style={{
                                fontSize: 12,
                                color: "#92400e",
                                background: "#fef3c7",
                                borderLeft: "3px solid #f59e0b",
                                padding: "5px 10px",
                                margin: 0,
                                borderRadius: "0 4px 4px 0",
                                lineHeight: 1.4,
                              }}
                            >
                              ⚠ {q.confidence_reason}
                            </p>
                          )}
                      </div>
                      {/* Read-only answer block / edit textarea */}
                      {isEditingThis ? (
                        <textarea
                          value={displayDraft}
                          onChange={(e) =>
                            setDraftEdits((prev) => ({
                              ...prev,
                              [q.id]: e.target.value,
                            }))
                          }
                          rows={8}
                          autoFocus
                          style={{
                            width: "100%",
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: "var(--ink)",
                            background: "var(--surface-2)",
                            border: `1.5px solid ${isDirty ? "var(--accent)" : "var(--border)"}`,
                            borderRadius: "var(--r-sm)",
                            padding: "10px 12px",
                            resize: "vertical",
                            fontFamily: "inherit",
                            boxSizing: "border-box",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 13.5,
                            lineHeight: 1.7,
                            color: "var(--ink)",
                            background: "var(--surface-2)",
                            borderLeft: "3px solid var(--accent)",
                            borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                            padding: "12px 16px",
                            cursor: "text",
                          }}
                          onClick={() => {
                            setEditingIds((prev) => {
                              const next = new Set(prev);
                              next.add(q.id);
                              return next;
                            });
                            if (!(q.id in draftEdits)) {
                              setDraftEdits((prev) => ({
                                ...prev,
                                [q.id]: q.ai_draft ?? "",
                              }));
                            }
                          }}
                          title="Click to edit"
                        >
                          {displayDraft}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 6,
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6 }}>
                          {isEditingThis && isDirty && (
                            <>
                              <button
                                className="btn ghost"
                                onClick={() =>
                                  saveDraft(q.id, displayDraft, false)
                                }
                                disabled={isSavingThis}
                                style={{ fontSize: 11, padding: "3px 10px" }}
                              >
                                {isSavingThis ? "Saving…" : "Save draft"}
                              </button>
                              <button
                                className="btn primary"
                                onClick={() =>
                                  saveDraft(q.id, displayDraft, true)
                                }
                                disabled={isSavingThis}
                                style={{
                                  fontSize: 11,
                                  padding: "3px 10px",
                                  background: "#059669",
                                }}
                              >
                                Save & approve
                              </button>
                            </>
                          )}
                          {isEditingThis && !isDirty && (
                            <button
                              className="btn ghost"
                              onClick={() => {
                                setEditingIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(q.id);
                                  return next;
                                });
                                setDraftEdits((prev) => {
                                  const next = { ...prev };
                                  delete next[q.id];
                                  return next;
                                });
                              }}
                              style={{ fontSize: 11, padding: "3px 8px" }}
                            >
                              Done
                            </button>
                          )}
                          {!isEditingThis && (
                            <button
                              className="btn ghost"
                              onClick={() => {
                                setEditingIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(q.id);
                                  return next;
                                });
                                if (!(q.id in draftEdits)) {
                                  setDraftEdits((prev) => ({
                                    ...prev,
                                    [q.id]: q.ai_draft ?? "",
                                  }));
                                }
                              }}
                              style={{
                                fontSize: 11,
                                padding: "3px 10px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              ✎ Edit
                            </button>
                          )}
                        </div>
                        {q.word_limit ? (
                          <p
                            style={{
                              fontSize: 11.5,
                              color:
                                displayDraft.trim().split(/\s+/).filter(Boolean)
                                  .length > q.word_limit
                                  ? "#dc2626"
                                  : "var(--muted)",
                              margin: 0,
                            }}
                          >
                            {
                              displayDraft.trim().split(/\s+/).filter(Boolean)
                                .length
                            }{" "}
                            / {q.word_limit} words
                          </p>
                        ) : (
                          <p
                            style={{
                              fontSize: 11.5,
                              color: "var(--muted)",
                              margin: 0,
                            }}
                          >
                            {
                              displayDraft.trim().split(/\s+/).filter(Boolean)
                                .length
                            }{" "}
                            words
                          </p>
                        )}
                      </div>

                      {/* Sources panel */}
                      {citations.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            onClick={() => toggleSources(q.id)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 11.5,
                              color: "var(--muted)",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                transform: sourcesExpanded
                                  ? "rotate(90deg)"
                                  : "none",
                                transition: "transform 0.15s",
                                fontSize: 10,
                              }}
                            >
                              ▶
                            </span>
                            Sources ({citations.length})
                          </button>

                          {sourcesExpanded && (
                            <div style={{ marginTop: 8 }}>
                              {citations.map((c, ci) => (
                                <div
                                  key={ci}
                                  style={{
                                    padding: "8px 10px",
                                    marginBottom: 6,
                                    background: "var(--bg-tint)",
                                    borderLeft: "3px solid var(--accent)",
                                    borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: 11.5,
                                      fontWeight: 600,
                                      color: "var(--ink)",
                                      marginBottom: 3,
                                    }}
                                  >
                                    {c.source_title}
                                  </p>
                                  <p
                                    style={{
                                      fontSize: 11.5,
                                      color: "var(--ink-2)",
                                      fontStyle: "italic",
                                      lineHeight: 1.5,
                                      marginBottom: 3,
                                    }}
                                  >
                                    "{c.excerpt}"
                                  </p>
                                  <p
                                    style={{
                                      fontSize: 11,
                                      color: "var(--muted)",
                                    }}
                                  >
                                    {c.relevance}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
