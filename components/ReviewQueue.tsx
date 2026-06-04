"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ROUTING_THRESHOLD = 0.6;
const FLAG_THRESHOLD = 0.75;

function isOptionalReview(score: number | null, riskLevel: string): boolean {
  if (score === null) return false;
  return (
    score >= ROUTING_THRESHOLD && score < FLAG_THRESHOLD && riskLevel !== "high"
  );
}

type ReviewItem = {
  id: string;
  query_id: string;
  rfp_run_id: string | null;
  topic: string;
  risk_level: string;
  confidence_score: number | null;
  assigned_to: string;
  status: string;
  due_at: string | null;
  created_at: string;
  queries: {
    query_text: string;
    rfp_context: Record<string, unknown> | null;
  } | null;
};

const TOPIC_LABEL: Record<string, string> = {
  security_compliance: "Security & Compliance",
  legal: "Legal",
  pricing: "Pricing",
  technical: "Technical",
  engineering: "Engineering",
  commercial: "Commercial",
  implementation: "Implementation",
  support: "Support",
  general: "General",
};

type FilterTab = "pending" | "approved" | "rejected" | "all";

function slaInfo(dueAt: string | null): {
  label: string;
  variant: string;
  overdue: boolean;
} {
  if (!dueAt) return { label: "", variant: "", overdue: false };
  const msLeft = new Date(dueAt).getTime() - Date.now();
  if (msLeft < 0) {
    const hoursAgo = Math.round(Math.abs(msLeft) / 3_600_000);
    return {
      label: hoursAgo > 0 ? `${hoursAgo}h overdue` : "Overdue",
      variant: "danger",
      overdue: true,
    };
  }
  const hours = msLeft / 3_600_000;
  if (hours <= 1) {
    const mins = Math.round(msLeft / 60_000);
    return { label: `${mins}m left`, variant: "warn", overdue: false };
  }
  if (hours <= 8) {
    return {
      label: `${Math.round(hours)}h left`,
      variant: "warn",
      overdue: false,
    };
  }
  return {
    label: `${Math.round(hours)}h left`,
    variant: "success",
    overdue: false,
  };
}

function riskBadgeVariant(risk: string) {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warn";
  return "success";
}

function confColor(score: number | null): string {
  if (score === null) return "var(--muted)";
  if (score >= 0.75) return "var(--success)";
  if (score >= 0.6) return "var(--warn)";
  return "var(--danger)";
}

export function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);

  useEffect(() => {
    fetch("/api/review/queue")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setItems(data as ReviewItem[]);
        else setError((data as { error?: string }).error ?? "Failed to load");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load review queue");
        setLoading(false);
      });
  }, []);

  const filtered = items.filter((item) => {
    if (tab === "all") return true;
    if (tab === "pending")
      return (
        item.status === "pending" ||
        item.status === "assigned" ||
        item.status === "escalated"
      );
    return item.status === tab;
  });

  const pendingItems = filtered.filter(
    (i) =>
      i.status === "pending" ||
      i.status === "assigned" ||
      i.status === "escalated",
  );

  const counts = {
    pending: items.filter((i) =>
      ["pending", "assigned", "escalated"].includes(i.status),
    ).length,
    approved: items.filter((i) => i.status === "approved").length,
    rejected: items.filter((i) => i.status === "rejected").length,
    all: items.length,
  };

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === pendingItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingItems.map((i) => i.id)));
    }
  }

  async function bulkAction(action: "approve" | "reject") {
    if (!selected.size) return;
    setBulking(true);
    try {
      const res = await fetch("/api/review/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk action failed");
      // optimistically remove actioned items
      setItems((prev) =>
        prev.map((item) =>
          selected.has(item.id)
            ? {
                ...item,
                status: action === "approve" ? "approved" : "rejected",
              }
            : item,
        ),
      );
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulking(false);
    }
  }

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "approved", label: `Approved (${counts.approved})` },
    { key: "rejected", label: `Rejected (${counts.rejected})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  if (loading)
    return (
      <p style={{ fontSize: 13, color: "var(--muted)", padding: "24px 0" }}>
        Loading review queue…
      </p>
    );
  if (error)
    return (
      <p style={{ fontSize: 13, color: "var(--danger)", padding: "24px 0" }}>
        {error}
      </p>
    );

  return (
    <div>
      {/* Tab strip */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 20,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              background: "none",
              border: "none",
              borderBottom:
                tab === t.key
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
              marginBottom: -1,
              color: tab === t.key ? "var(--ink)" : "var(--muted)",
              cursor: "pointer",
              transition: "color 150ms",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {tab === "pending" && selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 12,
            background: "var(--accent-tint)",
            borderRadius: "var(--r-sm)",
            border:
              "1px solid color-mix(in oklch, var(--accent) 20%, transparent)",
          }}
        >
          <span
            style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}
          >
            {selected.size} selected
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => bulkAction("approve")}
            disabled={bulking}
            className="btn accent sm"
          >
            {bulking ? "Working…" : "Approve all"}
          </button>
          <button
            onClick={() => bulkAction("reject")}
            disabled={bulking}
            className="btn danger sm"
          >
            Reject all
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="btn ghost sm"
          >
            Clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            padding: "32px 0",
            textAlign: "center",
          }}
        >
          No items in this tab.
        </p>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {tab === "pending" && pendingItems.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg)",
              }}
            >
              <input
                type="checkbox"
                checked={
                  selected.size === pendingItems.length &&
                  pendingItems.length > 0
                }
                onChange={toggleAll}
                style={{
                  width: 14,
                  height: 14,
                  cursor: "pointer",
                  accentColor: "var(--accent)",
                }}
              />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Select all
              </span>
            </div>
          )}

          {filtered.map((item, i) => {
            const rfpTitle =
              (item.queries?.rfp_context?.rfp_title as string) ??
              "Untitled RFP";
            const questionText = item.queries?.query_text ?? "";
            const isPending =
              item.status === "pending" ||
              item.status === "assigned" ||
              item.status === "escalated";
            const sla = isPending ? slaInfo(item.due_at) : null;
            const isSelected = selected.has(item.id);
            const optional = isOptionalReview(
              item.confidence_score,
              item.risk_level,
            );

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom:
                    i < filtered.length - 1
                      ? "1px solid var(--border)"
                      : undefined,
                  background: sla?.overdue
                    ? "color-mix(in oklch, var(--danger) 4%, transparent)"
                    : isSelected
                      ? "var(--accent-tint)"
                      : undefined,
                  transition: "background 150ms",
                }}
              >
                {/* Checkbox (pending tab only) */}
                {tab === "pending" && isPending && (
                  <div style={{ paddingTop: 3, flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      style={{
                        width: 14,
                        height: 14,
                        cursor: "pointer",
                        accentColor: "var(--accent)",
                      }}
                    />
                  </div>
                )}

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted)",
                      marginBottom: 2,
                    }}
                  >
                    {rfpTitle}
                  </p>
                  <p
                    style={{
                      fontSize: 13.5,
                      color: "var(--ink)",
                      marginBottom: 6,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {questionText}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                      {TOPIC_LABEL[item.topic] ?? item.topic}
                    </span>
                    <span
                      className={`badge ${riskBadgeVariant(item.risk_level)} mono`}
                      style={{ fontSize: 11 }}
                    >
                      {item.risk_level} risk
                    </span>
                    {item.confidence_score !== null && (
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 500,
                          color: confColor(item.confidence_score),
                        }}
                      >
                        {Math.round(item.confidence_score * 100)}% conf
                      </span>
                    )}
                    {optional && (
                      <span
                        className="badge mono"
                        style={{
                          fontSize: 10.5,
                          background: "var(--bg-tint)",
                          color: "var(--muted)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        advisory
                      </span>
                    )}
                    {item.assigned_to && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--muted-2)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        → {item.assigned_to}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side: SLA + status + action */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {sla?.label && (
                    <span
                      className={`badge ${sla.variant} mono`}
                      style={{ fontSize: 11 }}
                    >
                      {sla.label}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11.5,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 500,
                      background:
                        item.status === "approved"
                          ? "var(--success-tint)"
                          : item.status === "rejected"
                            ? "color-mix(in oklch, var(--danger) 10%, var(--surface))"
                            : item.status === "escalated"
                              ? "color-mix(in oklch, var(--terra) 12%, var(--surface))"
                              : "var(--bg-tint)",
                      color:
                        item.status === "approved"
                          ? "var(--success)"
                          : item.status === "rejected"
                            ? "var(--danger)"
                            : item.status === "escalated"
                              ? "var(--terra)"
                              : "var(--ink-2)",
                    }}
                  >
                    {item.status}
                  </span>
                  {isPending && (
                    <Link
                      href={`/review/${item.id}`}
                      className="btn ghost sm"
                      style={{ fontSize: 12 }}
                    >
                      Review →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
