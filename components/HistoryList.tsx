"use client";

import { useState, useEffect } from "react";
import { formatDate, truncate } from "@/lib/utils";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { ResponseCard } from "./ResponseCard";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { ErrorAlert } from "./ErrorAlert";
import type { QueryHistoryItem, AskResponse, RFPContext } from "@/lib/schema";

const INDUSTRY_LABELS: Record<string, string> = {
  fintech: "Fintech",
  legaltech: "Legaltech",
  "enterprise-saas": "Enterprise SaaS",
  healthcare: "Healthcare",
  industrial: "Industrial",
  other: "Other",
};

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  "executive-summary": "Executive summary",
  "technical-answer": "Technical answer",
  "implementation-approach": "Implementation approach",
  "security-compliance": "Security & compliance",
  "case-study": "Case study",
  "full-rfp-draft": "Full RFP draft",
};

const TONE_LABELS: Record<string, string> = {
  concise: "Concise",
  formal: "Formal",
  "founder-led": "Founder-led",
  technical: "Technical",
  commercial: "Commercial",
};

const MATURITY_LABELS: Record<string, string> = {
  startup: "Startup",
  "mid-market": "Mid-market",
  enterprise: "Enterprise",
};

function ContextChips({ ctx }: { ctx: RFPContext }) {
  const chips: string[] = [];
  if (ctx.industry) chips.push(INDUSTRY_LABELS[ctx.industry] ?? ctx.industry);
  if (ctx.response_type)
    chips.push(RESPONSE_TYPE_LABELS[ctx.response_type] ?? ctx.response_type);
  if (ctx.tone) chips.push(TONE_LABELS[ctx.tone] ?? ctx.tone);
  if (ctx.customer_maturity)
    chips.push(MATURITY_LABELS[ctx.customer_maturity] ?? ctx.customer_maturity);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function ExpandedResponse({
  queryId,
  onClose,
}: {
  queryId: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/queries/${queryId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setResult(data as AskResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [queryId]);

  return (
    <tr>
      <td colSpan={4} className="bg-gray-50 border-t border-gray-200 px-4 py-4">
        {loading && <LoadingState message="Loading response…" />}
        {error && <ErrorAlert message={error} onDismiss={onClose} />}
        {result && (
          <div>
            <div className="flex justify-end mb-3">
              <button
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                Close ✕
              </button>
            </div>
            <ResponseCard result={result} />
          </div>
        )}
      </td>
    </tr>
  );
}

export function HistoryList() {
  const [items, setItems] = useState<QueryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/queries")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState message="Loading history…" />;
  if (error)
    return <ErrorAlert message={error} onDismiss={() => setError(null)} />;

  if (items.length === 0) {
    return (
      <EmptyState
        title="No queries yet"
        description="Ask a question on the Ask page and your responses will appear here."
      />
    );
  }

  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Question
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
              Confidence
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
              Date
            </th>
            <th className="px-4 py-3 w-28"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {items.map((item) => (
            <>
              <tr
                key={item.id}
                className={`transition-colors ${expandedId === item.id ? "bg-gray-50" : "hover:bg-gray-50"}`}
              >
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 leading-snug">
                    {truncate(item.query_text, 120)}
                  </p>
                  {item.rfp_context && <ContextChips ctx={item.rfp_context} />}
                  {item.executive_summary && (
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {truncate(item.executive_summary, 160)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {item.confidence_level ? (
                    <ConfidenceBadge
                      confidence={{ level: item.confidence_level, reason: "" }}
                    />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-400 hidden md:table-cell">
                  {formatDate(item.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() =>
                        setExpandedId((prev) =>
                          prev === item.id ? null : item.id,
                        )
                      }
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium"
                    >
                      {expandedId === item.id ? "Hide ▲" : "View ▼"}
                    </button>
                    <a
                      href={`/ask?q=${encodeURIComponent(item.query_text)}`}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      Ask again
                    </a>
                  </div>
                </td>
              </tr>
              {expandedId === item.id && (
                <ExpandedResponse
                  key={`expanded-${item.id}`}
                  queryId={item.id}
                  onClose={() => setExpandedId(null)}
                />
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
