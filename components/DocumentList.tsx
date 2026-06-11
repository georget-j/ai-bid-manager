"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { fileBadge } from "@/lib/file-type";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";

type DocumentRow = {
  id: string;
  title: string;
  source_type: string;
  file_name: string | null;
  created_at: string;
  chunk_count: number;
};

type Chunk = {
  id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
};

type DocumentDetail = {
  doc: DocumentRow & { raw_text: string | null };
  chunks: Chunk[];
};

type Collection = "main" | "procurement";

interface DocumentListProps {
  refreshKey?: number;
  /** Reports how many documents the current tab holds — lets the page show a first-run state. */
  onCountChange?: (collection: Collection, count: number) => void;
}

// ── pure copy helpers (exported for tests) ─────────────────────────────────────

/** Row status — never expose chunk/token vocabulary to users. */
export function readinessLabel(chunkCount: number): string {
  return chunkCount > 0 ? "Ready to use" : "No readable text";
}

/** Detail-view wording: "3 sections indexed" — the most technical we get. */
export function sectionsIndexedLabel(count: number): string {
  return count === 1 ? "1 section indexed" : `${count} sections indexed`;
}

/** Plain-English source label — the raw source_type enum never reaches users. */
export function sourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case "sample":
      return "Sample";
    case "procurement":
      return "Tender";
    default:
      return "Uploaded";
  }
}

const TAB_LABELS: Record<Collection, string> = {
  main: "Shared — used for every answer",
  procurement: "Tender documents",
};

function SectionViewer({
  docId,
  onClose,
}: {
  docId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"sections" | "raw">("sections");

  useEffect(() => {
    fetch(`/api/documents/${docId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDetail(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [docId]);

  return (
    <tr>
      <td colSpan={5} className="bg-gray-50 border-t border-gray-200 px-4 py-4">
        {loading && <LoadingState message="Loading document…" />}
        {error && <ErrorAlert message={error} onDismiss={onClose} />}
        {detail && (
          <div>
            {/* Tab bar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTab("sections")}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    tab === "sections"
                      ? "bg-gray-900 text-white"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  Contents
                </button>
                {detail.doc.raw_text && (
                  <button
                    onClick={() => setTab("raw")}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                      tab === "raw"
                        ? "bg-gray-900 text-white"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    Full text
                  </button>
                )}
                <span className="text-xs text-gray-400 ml-2">
                  {sectionsIndexedLabel(detail.chunks.length)}
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Close ✕
              </button>
            </div>

            {/* Sections tab */}
            {tab === "sections" && (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {detail.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        Section {chunk.chunk_index + 1}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Full text tab */}
            {tab === "raw" && detail.doc.raw_text && (
              <div className="max-h-96 overflow-y-auto">
                <pre className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3 font-sans">
                  {detail.doc.raw_text}
                </pre>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function DocumentList({
  refreshKey = 0,
  onCountChange,
}: DocumentListProps) {
  const [collection, setCollection] = useState<Collection>("main");
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents?collection=${collection}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load documents");
        return res.json() as Promise<DocumentRow[]>;
      })
      .then((data) => {
        setDocs(data);
        setExpandedId(null);
        setError(null);
        setLoading(false);
        onCountChange?.(collection, data.length);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Error loading documents",
        );
        setLoading(false);
      });
  }, [refreshKey, collection, onCountChange]);

  async function handleDelete(doc: DocumentRow) {
    if (
      !confirm(
        `Remove "${doc.title}" from your evidence library? The AI will no longer use it when drafting your answers.`,
      )
    )
      return;
    setDeleting(doc.id);
    try {
      const res = await fetch(`/api/documents?id=${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("We couldn't remove it — please try again.");
      const next = docs.filter((d) => d.id !== doc.id);
      setDocs(next);
      onCountChange?.(collection, next.length);
      if (expandedId === doc.id) setExpandedId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't remove it — please try again.",
      );
    } finally {
      setDeleting(null);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const emptyMessage =
    collection === "main"
      ? "Your library is empty. Use the upload box above to add your first documents, or load the sample set to explore."
      : "When you save a tender's documents from an opportunity page, they appear here and ground your answers for that bid.";

  return (
    <div>
      {/* Collection tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["main", "procurement"] as Collection[]).map((col) => (
          <button
            key={col}
            onClick={() => setCollection(col)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              collection === col
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {TAB_LABELS[col]}
            {!loading && collection === col && docs.length > 0 && (
              <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                {docs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <LoadingState message="Loading documents…" />}
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {!loading && !error && docs.length === 0 && (
        <EmptyState
          title={
            collection === "main"
              ? "No documents yet"
              : "No tender documents yet"
          }
          description={emptyMessage}
        />
      )}

      {!loading && !error && docs.length > 0 && (
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                  Added
                </th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {docs.map((doc) => (
                <>
                  <tr
                    key={doc.id}
                    className={`transition-colors ${expandedId === doc.id ? "bg-gray-50" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(doc.id)}
                        className="text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 transition-colors">
                            {doc.title}
                          </p>
                          {(() => {
                            const badge = fileBadge(doc.file_name);
                            return badge ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {doc.file_name && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {doc.file_name}
                          </p>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          doc.source_type === "sample"
                            ? "bg-blue-50 text-blue-700"
                            : doc.source_type === "procurement"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {sourceTypeLabel(doc.source_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs hidden sm:table-cell">
                      <span
                        className={
                          doc.chunk_count > 0
                            ? "text-green-700"
                            : "text-amber-700"
                        }
                      >
                        {readinessLabel(doc.chunk_count)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => toggleExpand(doc.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium"
                        >
                          {expandedId === doc.id ? "Hide ▲" : "View ▼"}
                        </button>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={deleting === doc.id}
                          className="text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          {deleting === doc.id ? "…" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === doc.id && (
                    <SectionViewer
                      key={`viewer-${doc.id}`}
                      docId={doc.id}
                      onClose={() => setExpandedId(null)}
                    />
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
