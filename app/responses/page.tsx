"use client";

import { useState, useEffect, useCallback } from "react";
import { RFPProcessor } from "@/components/RFPProcessor";
import type { ExtractedQuestion } from "@/lib/rfp-extract";

interface Summary {
  id: string;
  rfp_title: string;
  status: string;
  question_count: number;
  answered_count: number;
  opportunity_id: string | null;
  updated_at: string;
}

interface FullDraft extends Summary {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_questions: any[];
  selected_question_ids: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: Record<string, any>;
}

interface Tab {
  key: string;
  draftId?: string;
  title: string;
  draft?: FullDraft;
}

type Step = "upload" | "reviewing" | "answering" | "done";

function stepFor(d: FullDraft): Step {
  if (Object.keys(d.answers ?? {}).length > 0) return "done";
  if ((d.extracted_questions ?? []).length > 0) return "reviewing";
  return "upload";
}

const STATUS_COLOR: Record<string, string> = {
  draft: "#6b7280",
  answering: "#3b82f6",
  completed: "#059669",
};

export default function ResponsesPage() {
  const [drafts, setDrafts] = useState<Summary[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/rfp/drafts");
      const b = (await r.json()) as { drafts?: Summary[] };
      setDrafts(b.drafts ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetch("/api/rfp/drafts")
      .then((r) => r.json())
      .then((b: { drafts?: Summary[] }) => setDrafts(b.drafts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openDraft(id: string) {
    const existing = tabs.find((t) => t.draftId === id);
    if (existing) {
      setActive(existing.key);
      return;
    }
    const r = await fetch(`/api/rfp/drafts/${id}`);
    const b = (await r.json()) as { draft?: FullDraft };
    if (!b.draft) return;
    const key = `d-${id}`;
    setTabs((prev) => [
      ...prev,
      { key, draftId: id, title: b.draft!.rfp_title, draft: b.draft },
    ]);
    setActive(key);
  }

  function newTab() {
    const key = `new-${Date.now()}`;
    setTabs((prev) => [...prev, { key, title: "New response" }]);
    setActive(key);
  }

  function closeTab(key: string) {
    setTabs((prev) => prev.filter((t) => t.key !== key));
    setActive((prev) => (prev === key ? null : prev));
    void refresh();
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Respond</div>
        <h1>
          Your <em>responses</em>
        </h1>
        <p className="subtitle">
          Every answer document you&apos;ve drafted, for tenders and grants —
          your work saves automatically as you go.
        </p>
      </div>

      {/* Tab strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border)",
          marginBottom: 16,
          paddingBottom: 8,
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: 12.5,
              maxWidth: 220,
              background:
                active === t.key ? "var(--accent-tint)" : "var(--surface-2)",
              color: active === t.key ? "var(--accent)" : "var(--ink-2)",
              border: `1px solid ${active === t.key ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.title || "Untitled"}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.key);
              }}
              style={{ color: "var(--muted)", fontWeight: 700 }}
            >
              ✕
            </span>
          </div>
        ))}
        <button
          className="btn primary"
          onClick={newTab}
          style={{ fontSize: 12, padding: "5px 14px" }}
        >
          + New response
        </button>
      </div>

      {/* Open tabs — kept mounted so state (and in-flight answering) is preserved */}
      {tabs.map((t) => (
        <div
          key={t.key}
          style={{ display: active === t.key ? "block" : "none" }}
        >
          <RFPProcessor
            draftId={t.draftId}
            initialTitle={t.draft?.rfp_title ?? ""}
            initialOpportunityId={t.draft?.opportunity_id ?? undefined}
            initialQuestions={
              t.draft?.extracted_questions as ExtractedQuestion[] | undefined
            }
            initialSelected={t.draft?.selected_question_ids}
            initialAnswers={t.draft?.answers}
            initialStep={t.draft ? stepFor(t.draft) : undefined}
            onDraftCreated={(id) => {
              setTabs((prev) =>
                prev.map((x) => (x.key === t.key ? { ...x, draftId: id } : x)),
              );
              void refresh();
            }}
          />
        </div>
      ))}

      {/* Saved drafts list — shown when no tab is active */}
      {active === null && (
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Saved responses
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
          ) : drafts.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              No saved responses yet. Click “New response” to start — it saves
              automatically as you go.
            </p>
          ) : (
            drafts.map((d) => (
              <div
                key={d.id}
                onClick={() => openDraft(d.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {d.rfp_title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {d.answered_count}/{d.question_count} answered · updated{" "}
                    {new Date(d.updated_at).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: STATUS_COLOR[d.status] ?? "#6b7280",
                    background: `${STATUS_COLOR[d.status] ?? "#6b7280"}18`,
                    borderRadius: 999,
                    padding: "2px 8px",
                  }}
                >
                  {d.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
