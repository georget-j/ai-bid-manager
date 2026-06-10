"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ErrorAlert } from "./ErrorAlert";
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
}: RFPProcessorProps = {}) {
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
  const [selected, setSelected] = useState<Set<number>>(
    new Set(initialSelected ?? (initialQuestions ?? []).map((q) => q.id)),
  );

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

  const [exporting, setExporting] = useState(false);
  const [rfpRunId, setRfpRunId] = useState<string | null>(null);
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
      setSelected(new Set(extracted.map((q) => q.id)));
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
  }

  // ── Step 3: Batch answering ───────────────────────────────────────────────

  async function handleAnswerAll() {
    const toAnswer = questions.filter((q) => selected.has(q.id));
    if (toAnswer.length === 0) return;

    setAnswers(new Map());
    setAnswering(new Set(toAnswer.map((q) => q.id)));
    setProgress({ done: 0, total: toAnswer.length });
    setStep("answering");

    try {
      const res = await fetch("/api/rfp/answer-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfp_title: rfpTitle,
          questions: toAnswer,
          rfp_run_id: rfpRunId ?? undefined,
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
            setAnswers((prev) => {
              const next = new Map(prev);
              next.set(event.question_id, event as AnsweredQuestion);
              return next;
            });
            setAnswering((prev) => {
              const next = new Set(prev);
              next.delete(event.question_id);
              return next;
            });
            setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          } else if (event.type === "question_error") {
            setAnswering((prev) => {
              const next = new Set(prev);
              next.delete(event.question_id);
              return next;
            });
            setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          } else if (event.type === "done") {
            setPendingReview(event.pending_review ?? []);
            setRfpRunIdForRouting(event.rfp_run_id ?? "");
            setRfpTitleForRouting(event.rfp_title ?? rfpTitle);
            if (event.rfp_run_id) setRfpRunId(event.rfp_run_id);
            setStep("done");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("reviewing");
    }
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
              <p className="text-sm text-gray-500">Analysing RFP document…</p>
            </div>
          ) : (
            <>
              <div className="text-3xl mb-3">📄</div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                Upload your RFP document
              </p>
              <p className="text-xs text-gray-400">
                PDF, DOCX, TXT, HTML — up to 4 MB
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
                {questions.length} requirement
                {questions.length !== 1 ? "s" : ""} extracted
                {selected.size < questions.length &&
                  ` · ${selected.size} selected`}
                {savedAt && <span style={{ color: "#059669" }}> · Saved</span>}
              </p>
            </div>
            {step === "reviewing" && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setSelected(new Set(questions.map((q) => q.id)))
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
                <button
                  onClick={handleAnswerAll}
                  disabled={selected.size === 0}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  Answer {selected.size} requirement
                  {selected.size !== 1 ? "s" : ""}
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
                <button
                  onClick={handleExportAll}
                  disabled={exporting}
                  className="btn sm"
                  style={{ background: "var(--ink)", color: "var(--surface)" }}
                >
                  {exporting ? "Exporting…" : "⬇ Export all as Word"}
                </button>
                <button onClick={handlePrintAsPdf} className="btn ghost sm">
                  ⎙ Save as PDF
                </button>
              </div>
            )}
          </div>

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

          {/* Question groups by section */}
          <div className="space-y-4">
            {Object.entries(sectionGroups).map(([section, qs]) => (
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
                  {qs.map((q) => {
                    const answer = answers.get(q.id);
                    const isInProgress = answering.has(q.id);
                    const isPending =
                      step === "answering" && !answer && !isInProgress;
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
                            <p className="text-sm text-gray-800 leading-relaxed">
                              {q.text}
                            </p>
                            {answer && (
                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <ConfidenceBadge
                                    confidence={answer.response.confidence}
                                  />
                                </div>
                                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                                  {answer.response.executive_summary}
                                </p>
                              </div>
                            )}
                            {isInProgress && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                <span className="text-xs text-gray-400">
                                  Generating…
                                </span>
                              </div>
                            )}
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
                </div>
              </div>
            ))}
          </div>

          {step === "reviewing" && (
            <button
              onClick={() => {
                setStep("upload");
                setQuestions([]);
                setSelected(new Set());
                setAnswers(new Map());
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
