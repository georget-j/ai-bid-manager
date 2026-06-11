"use client";

import { useState } from "react";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidencePanel } from "./EvidencePanel";
import { CitationCard } from "./CitationCard";
import { MissingInfoPanel } from "./MissingInfoPanel";
import { SuggestedActionsList } from "./SuggestedActionsList";
import type {
  AskResponse,
  PartialRFPResponse,
  RetrievedChunk,
} from "@/lib/schema";

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
      {title}
    </h3>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-gray-100 pt-5">
      <SectionHeader title={title} />
      {children}
    </div>
  );
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-gray-100 rounded"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface ResponseCardProps {
  result?: AskResponse;
  partial?: PartialRFPResponse;
  retrievedChunks?: RetrievedChunk[];
  isStreaming?: boolean;
  query?: string;
  /** Card heading — defaults to the tender-side label. */
  title?: string;
  /** Stated word limit for this answer — shows a live count that flags overruns. */
  wordLimit?: number | null;
  /** Called when the user saves an edit — lets the parent persist the new draft. */
  onDraftSaved?: (draft: string) => void;
}

export function ResponseCard({
  result,
  partial,
  retrievedChunks = [],
  isStreaming,
  query = "",
  title = "Draft RFP Response",
  wordLimit = null,
  onDraftSaved,
}: ResponseCardProps) {
  const response = result?.response ?? partial;
  const chunks = result?.retrieved_chunks ?? retrievedChunks;

  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!response) return null;

  const chunkMap = Object.fromEntries(chunks.map((c) => [c.id, c]));
  const isDone = !!result && !isStreaming;
  const draftAnswer = response.draft_answer ?? "";
  const execSummary = response.executive_summary ?? "";
  const confidence =
    result?.response.confidence ??
    (partial?.confidence?.level ? partial.confidence : undefined);
  const displayDraft = editedDraft ?? draftAnswer;
  const isEdited = editedDraft !== null && editedDraft !== draftAnswer;
  const wordCount = countWords(displayDraft);
  const overLimit = wordLimit != null && wordCount > wordLimit;

  function buildMarkdown() {
    const citations = (response?.citations ?? [])
      .map((c) => `- **${c.source_title}**: "${c.excerpt}"`)
      .join("\n");
    return `## RFP Response\n\n${displayDraft}\n\n## Sources\n\n${citations}`;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExport() {
    if (!result) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/export/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          response: result.response,
          edited_draft: isEdited ? editedDraft : undefined,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rfp-response.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <SectionHeader title={title} />
          {confidence && (
            <ConfidenceBadge
              confidence={confidence as AskResponse["response"]["confidence"]}
            />
          )}
          {isEdited && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200">
              Edited
            </span>
          )}
          {isStreaming && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Generating…
            </span>
          )}
        </div>
        {isDone && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                // Committing an edit: hand the new draft to the parent so it
                // can persist it (the card itself keeps no server state).
                if (editing && isEdited && editedDraft !== null) {
                  onDraftSaved?.(editedDraft);
                }
                setEditing((e) => !e);
              }}
              className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2.5 py-1 rounded transition-colors"
            >
              {editing
                ? onDraftSaved
                  ? "✓ Save changes"
                  : "✓ Done editing"
                : onDraftSaved
                  ? "Edit this answer"
                  : "Edit draft"}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "⬇ Export as Word"}
            </button>
            <button
              onClick={handleCopy}
              className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2.5 py-1 rounded transition-colors"
            >
              {copied ? "✓ Copied" : "Copy as markdown"}
            </button>
          </div>
        )}
      </div>

      {exportError && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
          {exportError}
        </div>
      )}

      <div className="px-6 py-5 space-y-5">
        {/* Executive Summary */}
        <div>
          <SectionHeader title="Executive Summary" />
          {execSummary ? (
            <p className="text-sm text-gray-600 leading-relaxed">
              {execSummary}
              {isStreaming && !result?.response.executive_summary && (
                <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
              )}
            </p>
          ) : (
            <Skeleton lines={2} />
          )}
        </div>

        {/* Draft Answer */}
        <Section title="Full Response">
          {draftAnswer || editing ? (
            editing ? (
              <textarea
                value={displayDraft}
                onChange={(e) => setEditedDraft(e.target.value)}
                rows={12}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y font-sans"
              />
            ) : (
              <div className="prose prose-sm max-w-none text-gray-800">
                {displayDraft.split("\n\n").map((para, i) => (
                  <p key={i} className="mb-3 last:mb-0 text-sm leading-relaxed">
                    {para}
                    {isStreaming &&
                      i === displayDraft.split("\n\n").length - 1 && (
                        <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />
                      )}
                  </p>
                ))}
              </div>
            )
          ) : (
            <Skeleton lines={5} />
          )}
          {/* Live word count — red once the funder's stated limit is exceeded */}
          {(editing || wordLimit != null) && (draftAnswer || editing) && (
            <p
              className={`mt-2 text-xs ${
                overLimit ? "text-red-600 font-semibold" : "text-gray-400"
              }`}
            >
              {wordCount}
              {wordLimit != null ? ` / ${wordLimit}` : ""} words
              {overLimit ? " — over the limit" : ""}
            </p>
          )}
        </Section>

        {/* Full details once streaming is done */}
        {isDone && result && (
          <>
            <Section title="Confidence Assessment">
              <ConfidenceBadge
                confidence={result.response.confidence}
                showReason
              />
            </Section>

            {result.response.supporting_evidence.length > 0 && (
              <Section title="Supporting Evidence">
                <EvidencePanel evidence={result.response.supporting_evidence} />
              </Section>
            )}

            {result.response.citations.length > 0 && (
              <Section
                title={`Source Citations (${result.response.citations.length})`}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {result.response.citations.map((citation) => (
                    <CitationCard
                      key={citation.chunk_id}
                      citation={citation}
                      chunk={chunkMap[citation.chunk_id]}
                    />
                  ))}
                </div>
              </Section>
            )}

            {result.response.missing_information.length > 0 && (
              <Section
                title={`Missing Information (${result.response.missing_information.length})`}
              >
                <MissingInfoPanel items={result.response.missing_information} />
              </Section>
            )}

            {result.response.suggested_next_actions.length > 0 && (
              <Section title="Suggested Next Actions">
                <SuggestedActionsList
                  actions={result.response.suggested_next_actions}
                />
              </Section>
            )}
          </>
        )}

        {/* During streaming: show retrieved sources */}
        {isStreaming && chunks.length > 0 && (
          <Section
            title={`Searching ${chunks.length} source${chunks.length !== 1 ? "s" : ""}`}
          >
            <div className="space-y-1.5">
              {chunks.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 text-xs text-gray-500"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0" />
                  {c.document_title}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
