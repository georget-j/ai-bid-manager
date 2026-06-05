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
  unanswered: { label: "Unanswered", color: "#6b7280", bg: "#f3f4f6" },
  drafted: { label: "Drafted", color: "#059669", bg: "#d1fae5" },
  "needs-review": { label: "Needs review", color: "#d97706", bg: "#fef3c7" },
  approved: { label: "Approved", color: "#1d4ed8", bg: "#dbeafe" },
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
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    new Set(),
  );

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

  async function saveDraft(qId: string, text: string) {
    setSavingIds((prev) => new Set(prev).add(qId));
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/questions/${qId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ai_draft: text, answer_status: "approved" }),
        },
      );
      if (res.ok) {
        setSavedQuestions((prev) =>
          (prev ?? []).map((q) =>
            q.id === qId
              ? { ...q, ai_draft: text, answer_status: "approved" }
              : q,
          ),
        );
        setDraftEdits((prev) => {
          const next = { ...prev };
          delete next[qId];
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
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          Loading…
        </p>
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
            {draftedCount > 0 && (
              <span style={{ color: "#059669" }}>
                {" "}
                · {draftedCount} drafted
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
          <a
            href={
              draftedCount > 0
                ? `/api/opportunities/${opportunityId}/export-response`
                : undefined
            }
            className={`btn${draftedCount === 0 ? " disabled" : ""}`}
            style={{
              fontSize: 12,
              padding: "4px 12px",
              opacity: draftedCount === 0 ? 0.4 : 1,
              pointerEvents: draftedCount === 0 ? "none" : "auto",
            }}
          >
            Export response ({draftedCount}/
            {counts.question + counts.requirement})
          </a>
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
                          {isAnsweringThis ? "Confirming…" : "Confirm"}
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
                      {q.answer_status !== "unanswered" &&
                        (q.answer_status === "drafted" ||
                          q.answer_status === "needs-review") && (
                          <button
                            className="btn primary"
                            onClick={() =>
                              fetch(
                                `/api/opportunities/${opportunityId}/questions/${q.id}`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    answer_status: "approved",
                                  }),
                                },
                              ).then(() =>
                                setSavedQuestions((prev) =>
                                  (prev ?? []).map((sq) =>
                                    sq.id === q.id
                                      ? { ...sq, answer_status: "approved" }
                                      : sq,
                                  ),
                                ),
                              )
                            }
                            style={{ fontSize: 11, padding: "3px 10px" }}
                          >
                            Approve
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
                            : "Regenerate"}
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
                      {/* AI Draft label + confidence reason */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          marginBottom: 6,
                          gap: 8,
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
                        {q.confidence_reason && (
                          <span
                            style={{
                              fontSize: 11,
                              color: confBadge?.color ?? "var(--muted)",
                              fontStyle: "italic",
                              flex: 1,
                              textAlign: "right",
                            }}
                          >
                            {q.confidence_reason}
                          </span>
                        )}
                      </div>
                      <textarea
                        value={displayDraft}
                        onChange={(e) =>
                          setDraftEdits((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        rows={5}
                        style={{
                          width: "100%",
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: "var(--ink-2)",
                          background: "var(--bg-tint)",
                          border: `1px solid ${isDirty ? "var(--accent)" : "var(--border)"}`,
                          borderRadius: "var(--r-sm)",
                          padding: "8px 10px",
                          resize: "vertical",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 6,
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8 }}>
                          {isDirty && (
                            <button
                              className="btn primary"
                              onClick={() => saveDraft(q.id, displayDraft)}
                              disabled={isSavingThis}
                              style={{ fontSize: 11, padding: "3px 12px" }}
                            >
                              {isSavingThis ? "Saving…" : "Save edits"}
                            </button>
                          )}
                          {isDirty && (
                            <button
                              className="btn ghost"
                              onClick={() =>
                                setDraftEdits((prev) => {
                                  const next = { ...prev };
                                  delete next[q.id];
                                  return next;
                                })
                              }
                              style={{ fontSize: 11, padding: "3px 8px" }}
                            >
                              Discard
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
