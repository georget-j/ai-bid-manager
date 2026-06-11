"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ErrorAlert } from "./ErrorAlert";
import { ResponseCard, countWords } from "./ResponseCard";
import { CitationCard } from "./CitationCard";
import { MissingInfoPanel } from "./MissingInfoPanel";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import type { RFPResponse, RetrievedChunk } from "@/lib/schema";
import type { BatchItem } from "@/lib/export-docx";

export type AnsweredQuestion = {
  question_id: number;
  question_text: string;
  section: string;
  response: RFPResponse;
  retrieved_chunks: RetrievedChunk[];
};

type Step = "upload" | "reviewing" | "answering" | "done";

/** A batch that finished early — feeds the "we answered X of N" banner. */
type PartialBatchInfo = {
  answered: number;
  total: number;
  remaining: number;
  reason: "timeout" | "error";
};

function isGuidance(q: ExtractedQuestion): boolean {
  return q.question_class === "guidance";
}

interface RFPProcessorProps {
  initialTitle?: string;
  initialOpportunityId?: string;
  /** When set, answers retrieve this grant's scoped KB collection (imported grant docs/links). */
  initialGrantId?: string;
  initialQuestions?: ExtractedQuestion[];
  /** When set, the processor loads/saves this persisted draft. */
  draftId?: string;
  initialStep?: Step;
  initialSelected?: number[];
  initialAnswers?: Record<string, AnsweredQuestion>;
  /** Called once when a brand-new draft is auto-created (so the parent can track it). */
  onDraftCreated?: (id: string) => void;
  /** Called after each successful autosave — lets a parent refresh derived state (e.g. the step spine). */
  onSaved?: () => void;
  /**
   * Hands the parent a stable trigger that answers the remaining selected
   * questions — lets a surrounding page (e.g. the grant step spine) pin its
   * own "Draft answers" CTA outside this component.
   */
  onRegisterAnswerRemaining?: (trigger: () => void) => void;
}

export function RFPProcessor({
  initialTitle = "",
  initialOpportunityId,
  initialGrantId,
  initialQuestions,
  draftId,
  initialStep,
  initialSelected,
  initialAnswers,
  onDraftCreated,
  onSaved,
  onRegisterAnswerRemaining,
}: RFPProcessorProps = {}) {
  // Grant applications get plain-English copy and the richer per-answer
  // review UI; the tender-side experience is unchanged.
  const isGrant = !!initialGrantId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(
    initialStep ??
      (initialQuestions && initialQuestions.length > 0
        ? "reviewing"
        : "upload"),
  );
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rfpTitle, setRfpTitle] = useState(initialTitle);

  const [questions, setQuestions] = useState<ExtractedQuestion[]>(
    initialQuestions ?? [],
  );
  const [selected, setSelected] = useState<Set<number>>(() => {
    // Guidance items are the funder's notes, not questions — they're never
    // auto-selected and never answered. Older saved drafts may still carry
    // guidance ids in their selection, so strip them here too.
    const qs = initialQuestions ?? [];
    const guidanceIds = new Set(qs.filter(isGuidance).map((q) => q.id));
    const base = initialSelected ?? qs.map((q) => q.id);
    return new Set(base.filter((id) => !guidanceIds.has(id)));
  });

  const [answers, setAnswers] = useState<Map<number, AnsweredQuestion>>(() => {
    const m = new Map<number, AnsweredQuestion>();
    if (initialAnswers) {
      for (const [k, v] of Object.entries(initialAnswers)) m.set(Number(k), v);
    }
    return m;
  });

  // ── Draft autosave ─────────────────────────────────────────────────────────
  const draftIdRef = useRef<string | null>(draftId ?? null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Debounced persistence: create the draft on first meaningful change, then PATCH.
  // Serialise the Map/Set state to JSON-friendly shapes.
  useEffect(() => {
    if (questions.length === 0 && !draftIdRef.current) return;
    const timer = setTimeout(async () => {
      const answersObj: Record<string, AnsweredQuestion> = {};
      answers.forEach((v, k) => {
        answersObj[String(k)] = v;
      });
      const payload = {
        rfp_title: rfpTitle,
        extracted_questions: questions,
        selected_question_ids: Array.from(selected),
        answers: answersObj,
        status:
          step === "done"
            ? "completed"
            : step === "answering"
              ? "answering"
              : "draft",
      };
      try {
        if (!draftIdRef.current) {
          const res = await fetch("/api/rfp/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              opportunity_id: initialOpportunityId ?? null,
            }),
          });
          const body = await res.json();
          if (body?.draft?.id) {
            draftIdRef.current = body.draft.id as string;
            onDraftCreated?.(draftIdRef.current);
          }
        } else {
          await fetch(`/api/rfp/drafts/${draftIdRef.current}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        setSavedAt(Date.now());
        onSaved?.();
      } catch {
        /* autosave is best-effort — ignore transient failures */
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    rfpTitle,
    questions,
    selected,
    answers,
    step,
    initialOpportunityId,
    onDraftCreated,
    onSaved,
  ]);
  const [answering, setAnswering] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Question ids whose full answer (draft + sources + gaps) is expanded.
  const [openAnswers, setOpenAnswers] = useState<Set<number>>(new Set());
  // Live draft text per question while the server streams 'delta' events
  // (each delta carries the full accumulated text so far, not a diff).
  const [streamingDrafts, setStreamingDrafts] = useState<Map<number, string>>(
    new Map(),
  );
  // Set when a batch ends early (server timeout, error, or a dropped stream).
  const [partialInfo, setPartialInfo] = useState<PartialBatchInfo | null>(null);
  // Question id open in the one-by-one review stepper; null = list view.
  const [reviewId, setReviewId] = useState<number | null>(null);

  // Keep the latest "answer remaining" handler available to the parent via a
  // stable trigger (the handler itself closes over fresh state every render).
  const answerRemainingRef = useRef<() => void>(() => {});
  useEffect(() => {
    answerRemainingRef.current = handleAnswerRemaining;
  });
  useEffect(() => {
    onRegisterAnswerRemaining?.(() => answerRemainingRef.current());
  }, [onRegisterAnswerRemaining]);

  const [exporting, setExporting] = useState(false);
  const [pendingReview, setPendingReview] = useState<
    Array<{
      queryId: string;
      topic: string;
      teamLabel: string;
      riskLevel: string;
      score: number;
    }>
  >([]);
  const [rfpRunIdForRouting, setRfpRunIdForRouting] = useState("");
  const [rfpTitleForRouting, setRfpTitleForRouting] = useState("");
  const [routingSent, setRoutingSent] = useState(false);
  const [sendingRouting, setSendingRouting] = useState(false);

  // ── Step 1: Upload & extract ──────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setError(
        "File too large — maximum upload size is 4 MB. Try compressing the PDF or saving as plain text.",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setError(null);
    setExtracting(true);
    setRfpTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/rfp/extract", {
        method: "POST",
        body: formData,
      });
      const text = await res.text();
      let data: { error?: string; questions?: ExtractedQuestion[] };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok
            ? "Unexpected response from server"
            : `Server error ${res.status} — try again`,
        );
      }
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");

      const extracted: ExtractedQuestion[] = data.questions ?? [];
      setQuestions(extracted);
      // Guidance items are shown as notes, never selected for answering.
      setSelected(
        new Set(extracted.filter((q) => !isGuidance(q)).map((q) => q.id)),
      );
      setReviewId(null);
      setStep("reviewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Step 2: Review ────────────────────────────────────────────────────────

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeQuestion(id: number) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // If the removed question was open in the stepper, fall back to the list.
    setReviewId((prev) => (prev === id ? null : prev));
  }

  // ── Step 3: Batch answering ───────────────────────────────────────────────

  // Runs the given questions through the batch endpoint and MERGES results
  // into the existing answers map — existing answers are only ever replaced
  // by a fresh result for the same question, never wiped wholesale.
  // A fresh server run is started every time: reusing a run id across a
  // different question subset would replay cached results by index and
  // attach them to the wrong questions.
  async function runBatch(
    toAnswer: ExtractedQuestion[],
    { updateRouting = true }: { updateRouting?: boolean } = {},
  ) {
    if (toAnswer.length === 0 || answering.size > 0) return;

    const stepBefore = step;
    const hadAnswersBefore = answers.size > 0;
    setError(null);
    setPartialInfo(null);
    setAnswering(new Set(toAnswer.map((q) => q.id)));
    setStreamingDrafts(new Map());
    setProgress({ done: 0, total: toAnswer.length });
    setStep("answering");

    // Tracked locally so an abruptly-closed stream (no 'done' event) can
    // still be reported as partial completion instead of stuck spinners.
    let answeredCount = 0;
    let sawDone = false;

    try {
      const res = await fetch("/api/rfp/answer-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfp_title: rfpTitle,
          // Send the per-question extras (word_limit / mandatory / priority)
          // explicitly — the server uses them to keep drafts within limits.
          questions: toAnswer.map((q) => ({
            id: q.id,
            section: q.section,
            text: q.text,
            topic: q.topic,
            risk_level: q.risk_level,
            word_limit: q.word_limit ?? null,
            mandatory: q.mandatory ?? false,
            priority: q.priority ?? "medium",
          })),
          opportunity_id: initialOpportunityId ?? undefined,
          grant_id: initialGrantId ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Batch answering failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";

        for (const msg of messages) {
          if (!msg.startsWith("data: ")) continue;
          const event = JSON.parse(msg.slice(6));

          if (event.type === "result") {
            answeredCount += 1;
            setAnswers((prev) => {
              const next = new Map(prev);
              next.set(event.question_id, event as AnsweredQuestion);
              return next;
            });
            setStreamingDrafts((prev) => {
              if (!prev.has(event.question_id)) return prev;
              const next = new Map(prev);
              next.delete(event.question_id);
              return next;
            });
            setAnswering((prev) => {
              const next = new Set(prev);
              next.delete(event.question_id);
              return next;
            });
            setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          } else if (event.type === "delta") {
            // The question's draft so far (full accumulated text, not a
            // diff) — typed live into the question's card.
            const qid = Number(event.question_id);
            const text = typeof event.text === "string" ? event.text : "";
            setStreamingDrafts((prev) => {
              const next = new Map(prev);
              next.set(qid, text);
              return next;
            });
          } else if (event.type === "question_error") {
            setAnswering((prev) => {
              const next = new Set(prev);
              next.delete(event.question_id);
              return next;
            });
            setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          } else if (event.type === "done") {
            sawDone = true;
            // A one-question retry must not clobber the routing summary of
            // the wider run, so only full runs update it.
            if (updateRouting) {
              setPendingReview(event.pending_review ?? []);
              setRfpRunIdForRouting(event.rfp_run_id ?? "");
              setRfpTitleForRouting(event.rfp_title ?? rfpTitle);
            }
            // The server always sends 'done' last, flagging anything it
            // didn't get to (timeout/error) so we can offer a clean resume.
            const unansweredIds: number[] = Array.isArray(event.unanswered_ids)
              ? event.unanswered_ids.map((id: string | number) => Number(id))
              : [];
            if (event.partial && unansweredIds.length > 0) {
              setPartialInfo({
                answered: toAnswer.length - unansweredIds.length,
                total: toAnswer.length,
                remaining: unansweredIds.length,
                reason: event.reason === "error" ? "error" : "timeout",
              });
            }
            setStep(
              answeredCount > 0 || hadAnswersBefore ? "done" : "reviewing",
            );
          }
        }
      }

      // The stream can also end without a 'done' event (proxy cut, hard
      // timeout) — treat that exactly like a partial completion.
      if (!sawDone) {
        const remaining = toAnswer.length - answeredCount;
        if (remaining > 0) {
          setPartialInfo({
            answered: answeredCount,
            total: toAnswer.length,
            remaining,
            reason: "timeout",
          });
        }
        setStep(
          answeredCount > 0 || hadAnswersBefore || stepBefore === "done"
            ? "done"
            : "reviewing",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep(stepBefore === "done" ? "done" : "reviewing");
    } finally {
      // Whatever happened, never leave a question stuck on "Generating…".
      setAnswering(new Set());
      setStreamingDrafts(new Map());
    }
  }

  /** Default path: answer only the selected questions with no answer yet. */
  function handleAnswerRemaining() {
    void runBatch(
      questions.filter((q) => selected.has(q.id) && !answers.has(q.id)),
    );
  }

  /**
   * Explicit do-over: replaces every selected answer. Confirmation happens in
   * the inline RedoAllConfirm popover, never a browser dialog.
   */
  function handleRedoAll() {
    const toRedo = questions.filter((q) => selected.has(q.id));
    if (toRedo.length === 0) return;
    void runBatch(toRedo);
  }

  /** Re-runs a single question and replaces just that answer. */
  function handleRetryOne(q: ExtractedQuestion) {
    void runBatch([q], { updateRouting: false });
  }

  /** Persist an inline edit: merge the new draft into the saved answers. */
  function handleAnswerEdited(questionId: number, draft: string) {
    setAnswers((prev) => {
      const current = prev.get(questionId);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(questionId, {
        ...current,
        response: { ...current.response, draft_answer: draft },
      });
      return next;
    });
  }

  // ── Send for review ───────────────────────────────────────────────────────

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
          rfp_run_id: rfpRunIdForRouting || undefined,
          rfp_title: rfpTitleForRouting,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      setRoutingSent(true);
      setPendingReview([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send for review",
      );
    } finally {
      setSendingRouting(false);
    }
  }

  // ── Export all ────────────────────────────────────────────────────────────

  async function handleExportAll() {
    const items: BatchItem[] = Array.from(answers.values()).map((a) => ({
      section: a.section,
      question: a.question_text,
      response: a.response,
    }));

    setExporting(true);
    try {
      const res = await fetch("/api/export/rfp-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfpTitle, items }),
      });
      if (!res.ok) {
        const msg = await res.text().then((t) => {
          try {
            return JSON.parse(t).error;
          } catch {
            return null;
          }
        });
        throw new Error(msg ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${rfpTitle || "rfp"}-responses.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handlePrintAsPdf() {
    const items: BatchItem[] = Array.from(answers.values()).map((a) => ({
      section: a.section,
      question: a.question_text,
      response: a.response,
    }));
    try {
      const res = await fetch("/api/export/rfp-batch-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfpTitle, items }),
      });
      if (!res.ok) throw new Error("Export failed");
      const html = await res.text();
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      win.print();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const sectionGroups = questions.reduce<Record<string, ExtractedQuestion[]>>(
    (acc, q) => {
      const arr = acc[q.section] ?? [];
      arr.push(q);
      acc[q.section] = arr;
      return acc;
    },
    {},
  );

  const answerableQuestions = questions.filter((q) => !isGuidance(q));
  const guidanceCount = questions.length - answerableQuestions.length;
  // The one-by-one review stepper walks the answerable questions in document
  // order; a stale reviewId (e.g. after re-extracting) falls back to the list.
  const reviewItems = answerableQuestions;
  const reviewQuestion =
    reviewId !== null
      ? (reviewItems.find((q) => q.id === reviewId) ?? null)
      : null;
  const answeredReviewIds = reviewItems
    .filter((q) => answers.has(q.id))
    .map((q) => q.id);
  const allExpanded =
    answeredReviewIds.length > 0 &&
    answeredReviewIds.every((id) => openAnswers.has(id));

  function openReview(startId?: number) {
    const target = startId ?? answeredReviewIds[0] ?? reviewItems[0]?.id;
    if (target != null) setReviewId(target);
  }

  const selectedUnanswered = questions.filter(
    (q) => selected.has(q.id) && !answers.has(q.id),
  );
  const busy = answering.size > 0;
  // Plain-English copy for grant applicants; tender wording is unchanged.
  const noun = isGrant ? "question" : "requirement";

  return (
    <div className="space-y-6">
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Step 1 — Upload */}
      {step === "upload" && (
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-gray-400 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.html"
            className="hidden"
            onChange={handleFileChange}
          />
          {extracting ? (
            <div className="space-y-3">
              <div className="flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-sm text-gray-500">
                {isGrant
                  ? "Reading the form and pulling out the questions…"
                  : "Analysing RFP document…"}
              </p>
            </div>
          ) : (
            <>
              <div className="text-3xl mb-3">📄</div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                {isGrant
                  ? "Upload the funder's application form (PDF or Word) and I'll pull out the questions"
                  : "Upload your RFP document"}
              </p>
              <p className="text-xs text-gray-400">
                {isGrant
                  ? "PDF, Word, text or HTML — up to 4 MB"
                  : "PDF, DOCX, TXT, HTML — up to 4 MB"}
              </p>
            </>
          )}
        </div>
      )}

      {/* Step 2 — Review extracted questions */}
      {(step === "reviewing" || step === "answering" || step === "done") && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {rfpTitle}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {answerableQuestions.length} {noun}
                {answerableQuestions.length !== 1 ? "s" : ""}{" "}
                {isGrant ? "found" : "extracted"}
                {guidanceCount > 0 &&
                  ` · ${guidanceCount} guidance note${guidanceCount !== 1 ? "s" : ""}`}
                {selected.size < answerableQuestions.length &&
                  ` · ${selected.size} selected`}
                {savedAt && <span style={{ color: "#059669" }}> · Saved</span>}
              </p>
            </div>
            {step === "reviewing" && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() =>
                    setSelected(new Set(answerableQuestions.map((q) => q.id)))
                  }
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-800 underline"
                >
                  Deselect all
                </button>
                {isGrant && answers.size > 0 && (
                  <RedoAllConfirm
                    count={selected.size}
                    disabled={busy || selected.size === 0}
                    onConfirm={handleRedoAll}
                    buttonLabel="Redo all answers"
                    buttonClassName="text-xs text-gray-500 hover:text-gray-800 underline disabled:opacity-40"
                  />
                )}
                <button
                  onClick={handleAnswerRemaining}
                  disabled={selectedUnanswered.length === 0 || busy}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  Answer {selectedUnanswered.length}
                  {answers.size > 0 ? " remaining" : ""} {noun}
                  {selectedUnanswered.length !== 1 ? "s" : ""}
                </button>
              </div>
            )}
            {step === "answering" && (
              <div className="flex items-center gap-3">
                <div className="w-40 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-900 rounded-full transition-all duration-300"
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {progress.done} / {progress.total}
                </span>
              </div>
            )}
            {step === "done" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {isGrant ? (
                  // Grant flow: downloads live in "Review & submit" below, so
                  // this header offers the answer-again paths instead.
                  <>
                    {selectedUnanswered.length > 0 && (
                      <button
                        onClick={handleAnswerRemaining}
                        disabled={busy}
                        className="btn sm"
                        style={{
                          background: "var(--ink)",
                          color: "var(--surface)",
                        }}
                      >
                        Answer {selectedUnanswered.length} remaining question
                        {selectedUnanswered.length !== 1 ? "s" : ""}
                      </button>
                    )}
                    <RedoAllConfirm
                      count={selected.size}
                      disabled={busy || selected.size === 0}
                      onConfirm={handleRedoAll}
                      buttonLabel="↻ Redo all answers"
                      buttonClassName="btn ghost sm"
                    />
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleExportAll}
                      disabled={exporting}
                      className="btn sm"
                      style={{
                        background: "var(--ink)",
                        color: "var(--surface)",
                      }}
                    >
                      {exporting ? "Exporting…" : "⬇ Export all as Word"}
                    </button>
                    <button onClick={handlePrintAsPdf} className="btn ghost sm">
                      ⎙ Save as PDF
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* A batch that ended early — explain what happened, offer the rest */}
          {partialInfo && selectedUnanswered.length > 0 && (
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
                We answered {partialInfo.answered} of {partialInfo.total} before{" "}
                {partialInfo.reason === "error"
                  ? "something went wrong"
                  : "running out of time"}{" "}
                — nothing was lost.
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                Your finished answers are saved below. Pick up the rest whenever
                you&apos;re ready.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    setPartialInfo(null);
                    handleAnswerRemaining();
                  }}
                  disabled={busy}
                  className="btn accent sm"
                >
                  Answer the remaining {selectedUnanswered.length}
                </button>
                <button
                  onClick={() => setPartialInfo(null)}
                  className="btn ghost sm"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          {/* Review routing — confirmation prompt */}
          {step === "done" && pendingReview.length > 0 && (
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
                {pendingReview.length} answer
                {pendingReview.length !== 1 ? "s" : ""} may need human review
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                {Array.from(
                  new Set(pendingReview.map((c) => c.teamLabel)),
                ).join(", ")}{" "}
                — Send for review?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={sendForReview}
                  disabled={sendingRouting}
                  className="btn accent sm"
                >
                  {sendingRouting
                    ? "Sending…"
                    : `Yes, send ${pendingReview.length} for review`}
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

          {/* Review routing — sent confirmation */}
          {step === "done" && routingSent && (
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
                }}
              >
                Sent for human review
              </p>
              <Link href="/review" className="btn accent sm">
                View review queue →
              </Link>
            </div>
          )}

          {/* Review tools — one-by-one stepper entry + expand all */}
          {answers.size > 0 && !reviewQuestion && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => openReview()}
                className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Review answers one by one
              </button>
              {isGrant && answeredReviewIds.length > 0 && (
                <button
                  onClick={() =>
                    setOpenAnswers(
                      allExpanded ? new Set() : new Set(answeredReviewIds),
                    )
                  }
                  className="text-xs text-gray-500 hover:text-gray-900 underline"
                >
                  {allExpanded ? "Collapse all answers" : "Expand all answers"}
                </button>
              )}
            </div>
          )}

          {/* One-by-one review stepper (replaces the list while open) */}
          {reviewQuestion ? (
            <ReviewStepper
              items={reviewItems}
              answers={answers}
              answering={answering}
              streamingDrafts={streamingDrafts}
              currentId={reviewQuestion.id}
              onNavigate={setReviewId}
              onClose={() => setReviewId(null)}
              onEdit={handleAnswerEdited}
              onRetry={handleRetryOne}
              busy={busy}
              isGrant={isGrant}
            />
          ) : (
            /* Question groups by section — the overview list */
            <div className="space-y-4">
              {Object.entries(sectionGroups).map(([section, qs]) => {
                const answerableQs = qs.filter((x) => !isGuidance(x));
                const guidanceQs = qs.filter(isGuidance);
                return (
                  <div
                    key={section}
                    className="border border-gray-200 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        {section}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {answerableQs.map((q) => {
                        const answer = answers.get(q.id);
                        const isInProgress = answering.has(q.id);
                        const streamingText = streamingDrafts.get(q.id);
                        const isPending =
                          step === "answering" && !answer && !isInProgress;
                        const canOpenReview = answers.size > 0;
                        return (
                          <div key={q.id} className="px-4 py-3">
                            <div className="flex items-start gap-3">
                              {step === "reviewing" && (
                                <input
                                  type="checkbox"
                                  checked={selected.has(q.id)}
                                  onChange={() => toggleSelect(q.id)}
                                  className="mt-0.5 rounded border-gray-300 shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                {canOpenReview ? (
                                  <button
                                    onClick={() => openReview(q.id)}
                                    className="block w-full text-left text-sm text-gray-800 leading-relaxed hover:text-gray-950 hover:underline decoration-gray-300 underline-offset-2 cursor-pointer"
                                  >
                                    {q.text}
                                  </button>
                                ) : (
                                  <p className="text-sm text-gray-800 leading-relaxed">
                                    {q.text}
                                  </p>
                                )}
                                <BriefingStrip q={q} isGrant={isGrant} />
                                {answer && !isInProgress && (
                                  <div className="mt-2 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <ConfidenceBadge
                                        confidence={answer.response.confidence}
                                      />
                                      <button
                                        onClick={() => openReview(q.id)}
                                        className="text-xs text-gray-500 hover:text-gray-900 underline"
                                      >
                                        Review & edit
                                      </button>
                                      {isGrant && (
                                        <button
                                          onClick={() => handleRetryOne(q)}
                                          disabled={busy}
                                          className="text-xs text-gray-500 hover:text-gray-900 underline disabled:opacity-40"
                                        >
                                          Try again
                                        </button>
                                      )}
                                    </div>
                                    {!(isGrant && openAnswers.has(q.id)) && (
                                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                                        {answer.response.executive_summary}
                                      </p>
                                    )}
                                    {isGrant && openAnswers.has(q.id) && (
                                      <div className="mt-2">
                                        <ResponseCard
                                          // Remount when the draft changes
                                          // (retry or saved edit) so local
                                          // edit state resets to the new
                                          // canonical answer.
                                          key={`${q.id}:${answer.response.draft_answer}`}
                                          result={{
                                            query_id: String(q.id),
                                            response: answer.response,
                                            retrieved_chunks:
                                              answer.retrieved_chunks ?? [],
                                          }}
                                          query={q.text}
                                          title="Your draft answer"
                                          wordLimit={q.word_limit ?? null}
                                          onDraftSaved={(draft) =>
                                            handleAnswerEdited(q.id, draft)
                                          }
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isInProgress &&
                                  (streamingText ? (
                                    isGrant ? (
                                      <div className="mt-2">
                                        {/* Draft text types in live as the server streams it */}
                                        <ResponseCard
                                          partial={{
                                            draft_answer: streamingText,
                                          }}
                                          isStreaming
                                          query={q.text}
                                          title="Your draft answer"
                                          wordLimit={q.word_limit ?? null}
                                        />
                                      </div>
                                    ) : (
                                      <p className="mt-2 text-xs text-gray-500 leading-relaxed line-clamp-3 whitespace-pre-line">
                                        {streamingText}
                                        <span className="inline-block w-0.5 h-3 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
                                      </p>
                                    )
                                  ) : (
                                    <div className="mt-2 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                      <span className="text-xs text-gray-400">
                                        {isGrant
                                          ? "Writing your draft…"
                                          : "Generating…"}
                                      </span>
                                    </div>
                                  ))}
                                {isPending && (
                                  <p className="mt-1 text-xs text-gray-300">
                                    Queued…
                                  </p>
                                )}
                              </div>
                              {step === "reviewing" && (
                                <button
                                  onClick={() => removeQuestion(q.id)}
                                  className="text-gray-300 hover:text-red-500 transition-colors text-xs shrink-0"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {/* The funder's instructions for this section — notes, not questions */}
                      {guidanceQs.length > 0 && (
                        <div className="px-4 py-3 bg-gray-50/60">
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                            {isGrant
                              ? "From the funder's guidance"
                              : "From the buyer's guidance"}
                          </p>
                          <div className="space-y-1.5">
                            {guidanceQs.map((g) => (
                              <div
                                key={g.id}
                                className="flex items-start gap-2"
                              >
                                <p className="flex-1 text-xs text-gray-400 leading-relaxed">
                                  {g.text}
                                </p>
                                {step === "reviewing" && (
                                  <button
                                    onClick={() => removeQuestion(g.id)}
                                    className="text-gray-300 hover:text-red-500 transition-colors text-xs shrink-0"
                                    aria-label="Remove this note"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === "reviewing" && !reviewQuestion && (
            <button
              onClick={() => {
                setStep("upload");
                setQuestions([]);
                setSelected(new Set());
                setAnswers(new Map());
                setReviewId(null);
                setPartialInfo(null);
              }}
              className="text-xs text-gray-400 hover:text-gray-700 underline"
            >
              ← Upload a different document
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Briefing strip ─────────────────────────────────────────────────────────
// What the funder/buyer is asking for, at a glance: mandatory, topic, word
// limit, priority. Rendered under each question in the list and the stepper.

const TOPIC_LABELS: Record<string, string> = {
  security_compliance: "Security & compliance",
  legal: "Legal",
  pricing: "Pricing",
  technical: "Technical",
  engineering: "Engineering",
  commercial: "Commercial",
  implementation: "Delivery",
  support: "Support",
  // "general" is deliberately omitted — it tells the reader nothing.
};

function topicLabel(topic: string, isGrant: boolean): string | null {
  if (topic === "pricing" && isGrant) return "Budget & costs";
  return TOPIC_LABELS[topic] ?? null;
}

const CHIP_TONES = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  gray: "bg-gray-50 text-gray-500 border-gray-200",
} as const;

function BriefingStrip({
  q,
  isGrant,
}: {
  q: ExtractedQuestion;
  isGrant: boolean;
}) {
  const topic = topicLabel(q.topic, isGrant);
  const chips: Array<{ label: string; tone: keyof typeof CHIP_TONES }> = [];
  if (q.mandatory) chips.push({ label: "Mandatory", tone: "amber" });
  else if (q.priority === "high")
    chips.push({ label: "High priority", tone: "blue" });
  if (topic) chips.push({ label: topic, tone: "gray" });
  if (q.word_limit != null)
    chips.push({ label: `Limit: ${q.word_limit} words`, tone: "gray" });
  if (chips.length === 0) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded border ${CHIP_TONES[c.tone]}`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ── Inline redo confirmation ───────────────────────────────────────────────
// Replaces window.confirm: names the count and warns that edits are replaced.

function RedoAllConfirm({
  count,
  disabled,
  onConfirm,
  buttonLabel,
  buttonClassName,
}: {
  count: number;
  disabled?: boolean;
  onConfirm: () => void;
  buttonLabel: string;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={buttonClassName}
      >
        {buttonLabel}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Confirm starting all answers again"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 20,
            marginTop: 6,
            width: 270,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            padding: "12px 14px",
            textAlign: "left",
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: 0,
              color: "var(--ink, #111827)",
            }}
          >
            Start all {count} answer{count === 1 ? "" : "s"} again?
          </p>
          <p
            style={{
              fontSize: 12,
              color: "var(--muted, #6b7280)",
              margin: "6px 0 10px",
              lineHeight: 1.45,
            }}
          >
            This replaces every answer, including any edits you&apos;ve made.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
              style={{
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Yes, start again
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                color: "var(--muted, #6b7280)",
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 7,
                padding: "5px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Keep my answers
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// ── One-by-one review stepper ──────────────────────────────────────────────
// Walks the answerable questions; the draft is always an editable textarea
// (no read/edit toggles) that autosaves on blur via the parent's existing
// debounced PATCH. Citations and gaps sit behind one quiet disclosure.

function ReviewStepper({
  items,
  answers,
  answering,
  streamingDrafts,
  currentId,
  onNavigate,
  onClose,
  onEdit,
  onRetry,
  busy,
  isGrant,
}: {
  items: ExtractedQuestion[];
  answers: Map<number, AnsweredQuestion>;
  answering: Set<number>;
  streamingDrafts: Map<number, string>;
  currentId: number;
  onNavigate: (id: number) => void;
  onClose: () => void;
  onEdit: (questionId: number, draft: string) => void;
  onRetry: (q: ExtractedQuestion) => void;
  busy: boolean;
  isGrant: boolean;
}) {
  const index = items.findIndex((q) => q.id === currentId);
  const q = items[index];
  const prevQ = index > 0 ? items[index - 1] : null;
  const nextQ = index < items.length - 1 ? items[index + 1] : null;

  // Arrow keys move between questions — but never while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "TEXTAREA" ||
          t.tagName === "INPUT" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowRight" && nextQ) onNavigate(nextQ.id);
      else if (e.key === "ArrowLeft" && prevQ) onNavigate(prevQ.id);
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevQ, nextQ, onNavigate, onClose]);

  if (!q) return null;

  const answer = answers.get(q.id);
  const streamingText = streamingDrafts.get(q.id);
  const isGenerating = answering.has(q.id);
  const citations = answer?.response.citations ?? [];
  const missing = answer?.response.missing_information ?? [];
  const chunkMap = Object.fromEntries(
    (answer?.retrieved_chunks ?? []).map((c) => [c.id, c]),
  );

  const navButtonClass =
    "text-xs text-gray-600 hover:text-gray-900 border border-gray-200 px-2.5 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-default";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Position + navigation */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-900 underline"
        >
          ← Back to all questions
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Question {index + 1} of {items.length}
          </span>
          <button
            onClick={() => prevQ && onNavigate(prevQ.id)}
            disabled={!prevQ}
            aria-label="Previous question"
            className={navButtonClass}
          >
            ← Previous
          </button>
          <button
            onClick={() => nextQ && onNavigate(nextQ.id)}
            disabled={!nextQ}
            aria-label="Next question"
            className={navButtonClass}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {q.section}
        </p>
        <p className="text-sm font-medium text-gray-900 leading-relaxed">
          {q.text}
        </p>
        <BriefingStrip q={q} isGrant={isGrant} />

        {isGenerating ? (
          streamingText ? (
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {isGrant ? "Writing your draft…" : "Generating…"}
              </p>
              <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50">
                {streamingText}
                <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {isGrant ? "Writing your draft…" : "Generating…"}
            </p>
          )
        ) : answer ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <ConfidenceBadge confidence={answer.response.confidence} />
              <button
                onClick={() => onRetry(q)}
                disabled={busy}
                className="text-xs text-gray-500 hover:text-gray-900 underline disabled:opacity-40"
              >
                Try again
              </button>
            </div>
            <StepperDraftEditor
              // Remount when the canonical draft changes (retry or a saved
              // edit) so the textarea resets to the new text.
              key={`${q.id}:${answer.response.draft_answer}`}
              draft={answer.response.draft_answer ?? ""}
              wordLimit={q.word_limit ?? null}
              onCommit={(text) => onEdit(q.id, text)}
            />
            {(citations.length > 0 || missing.length > 0) && (
              <details>
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-800 select-none">
                  Where this came from
                  {citations.length > 0 &&
                    ` · ${citations.length} source${citations.length === 1 ? "" : "s"}`}
                  {missing.length > 0 &&
                    ` · ${missing.length} gap${missing.length === 1 ? "" : "s"}`}
                </summary>
                <div className="mt-3 space-y-4">
                  {citations.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {citations.map((citation) => (
                        <CitationCard
                          key={citation.chunk_id}
                          citation={citation}
                          chunk={chunkMap[citation.chunk_id]}
                        />
                      ))}
                    </div>
                  )}
                  {missing.length > 0 && <MissingInfoPanel items={missing} />}
                </div>
              </details>
            )}
          </>
        ) : (
          <div className="border border-dashed border-gray-200 rounded-lg px-4 py-5 text-center">
            <p className="text-xs text-gray-400 mb-2">No answer drafted yet.</p>
            <button
              onClick={() => onRetry(q)}
              disabled={busy}
              className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              Draft this answer
            </button>
          </div>
        )}

        <p className="text-[11px] text-gray-300">
          Tip: use the ← and → arrow keys to move between questions.
        </p>
      </div>
    </div>
  );
}

// The draft is always directly editable; changes are handed to the parent on
// blur, which feeds the existing debounced autosave PATCH.
function StepperDraftEditor({
  draft,
  wordLimit,
  onCommit,
}: {
  draft: string;
  wordLimit: number | null;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(draft);
  const words = countWords(text);
  const over = wordLimit != null && words > wordLimit;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <span className="text-xs text-gray-400">
          Edit freely — changes save when you click away.
        </span>
        <span
          className={`text-xs ${over ? "text-red-600 font-semibold" : "text-gray-400"}`}
        >
          {words}
          {wordLimit != null ? ` / ${wordLimit}` : ""} words
          {over ? " — over the limit" : ""}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== draft) onCommit(text);
        }}
        rows={14}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y font-sans"
      />
    </div>
  );
}
