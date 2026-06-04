"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { BidPipelineStatus } from "@/lib/procurement/types";

interface Opportunity {
  id: string;
  title: string;
  buyer_name: string | null;
  region: string | null;
  deadline_at: string | null;
  value_amount: string | number | null;
  value_currency: string | null;
  procurement_stage: string;
  status: string;
}

interface PipelineItem {
  id: string;
  opportunity_id: string;
  status: BidPipelineStatus;
  owner: string | null;
  bid_decision: string | null;
  decision_notes: string | null;
  next_action: string | null;
  due_date: string | null;
  created_at: string;
  opportunity: Opportunity | null;
}

const STATUS_CONFIG: {
  key: BidPipelineStatus;
  label: string;
  color: string;
  bg: string;
}[] = [
  {
    key: "new-match",
    label: "New match",
    color: "var(--accent)",
    bg: "var(--accent-tint)",
  },
  { key: "reviewing", label: "Reviewing", color: "#7c3aed", bg: "#ede9fe" },
  { key: "bid", label: "Bid", color: "#059669", bg: "#d1fae5" },
  { key: "no-bid", label: "No bid", color: "#6b7280", bg: "#f3f4f6" },
  { key: "in-progress", label: "In progress", color: "#d97706", bg: "#fef3c7" },
  {
    key: "awaiting-review",
    label: "Awaiting review",
    color: "#b45309",
    bg: "#fef3c7",
  },
  { key: "submitted", label: "Submitted", color: "#1d4ed8", bg: "#dbeafe" },
  { key: "won", label: "Won", color: "#059669", bg: "#d1fae5" },
  { key: "lost", label: "Lost", color: "#dc2626", bg: "#fee2e2" },
  { key: "archived", label: "Archived", color: "#9ca3af", bg: "#f9fafb" },
];

function statusConfig(key: string) {
  return (
    STATUS_CONFIG.find((s) => s.key === key) ?? {
      key: key as BidPipelineStatus,
      label: key,
      color: "var(--muted)",
      bg: "var(--bg-tint)",
    }
  );
}

function formatValue(amount: string | number | null, _currency = "GBP") {
  if (!amount) return null;
  const n = Number(amount);
  if (isNaN(n)) return null;
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n.toLocaleString()}`;
}

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  const label = new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return { label, urgent: days >= 0 && days <= 7, overdue: days < 0 };
}

export default function PipelinePage() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((d: { items?: PipelineItem[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setItems(d.items ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load pipeline — please refresh.");
        setLoading(false);
      });
  }, []);

  async function updateStatus(id: string, status: BidPipelineStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/pipeline/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status } : item)),
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeItem(id: string) {
    if (!confirm("Remove this opportunity from your pipeline?")) return;
    await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  const tabs = [
    { key: "all", label: "All" },
    {
      key: "active",
      label: "Active",
      keys: ["new-match", "reviewing", "bid", "in-progress", "awaiting-review"],
    },
    {
      key: "decided",
      label: "Decided",
      keys: ["submitted", "won", "lost", "no-bid"],
    },
    { key: "archived", label: "Archived", keys: ["archived"] },
  ];

  const filtered =
    activeTab === "all"
      ? items
      : items.filter((item) => {
          const tab = tabs.find((t) => t.key === activeTab);
          return tab?.keys?.includes(item.status);
        });

  const countsByStatus = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 960 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Intelligence</div>
        <h1>
          Bid <em>pipeline</em>
        </h1>
        <p className="subtitle">
          Manage your active opportunities from first match to submission. Track
          decisions, assign owners, and set next actions.
        </p>
      </div>

      {/* Status summary */}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          {STATUS_CONFIG.filter((s) => countsByStatus[s.key]).map((s) => (
            <div
              key={s.key}
              className="card"
              style={{
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                {s.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: "var(--muted)",
                  marginLeft: 4,
                }}
              >
                {countsByStatus[s.key]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 2,
            marginBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                border: "none",
                background: "none",
                cursor: "pointer",
                borderBottom: `2px solid ${activeTab === tab.key ? "var(--accent)" : "transparent"}`,
                color: activeTab === tab.key ? "var(--accent)" : "var(--ink-2)",
                fontWeight: activeTab === tab.key ? 500 : 400,
                marginBottom: -1,
              }}
            >
              {tab.label}
              {tab.key !== "all" && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {tab.key === "all"
                    ? items.length
                    : items.filter((i) => tab.keys?.includes(i.status)).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 32px" }}
        >
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Loading pipeline…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--r-sm)",
            background: "#fee2e2",
            color: "#dc2626",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "56px 40px" }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            Your pipeline is empty.
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: 440,
              margin: "0 auto 20px",
            }}
          >
            Add opportunities to your pipeline from the Opportunities page.
            Track each bid from initial review through to submission.
          </p>
          <Link href="/opportunities" className="btn primary">
            Browse opportunities
          </Link>
        </div>
      )}

      {/* Pipeline items */}
      {!loading && filtered.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          {filtered.map((item, i) => {
            const sc = statusConfig(item.status);
            const deadline = formatDeadline(
              item.opportunity?.deadline_at ?? null,
            );
            const value = formatValue(
              item.opportunity?.value_amount ?? null,
              item.opportunity?.value_currency ?? "GBP",
            );
            const isUpdating = updatingId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  padding: "16px 20px",
                  borderBottom:
                    i < filtered.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                  opacity: isUpdating ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    <Link
                      href={`/opportunities/${item.opportunity_id}`}
                      style={{
                        fontWeight: 500,
                        fontSize: 14,
                        color: "var(--ink)",
                        textDecoration: "none",
                      }}
                    >
                      {item.opportunity?.title ?? "Unknown opportunity"}
                    </Link>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: sc.bg,
                        color: sc.color,
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {sc.label}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      fontSize: 12.5,
                      color: "var(--muted)",
                      flexWrap: "wrap",
                    }}
                  >
                    {item.opportunity?.buyer_name && (
                      <span>{item.opportunity.buyer_name}</span>
                    )}
                    {value && (
                      <>
                        <span>·</span>
                        <span style={{ fontFamily: "var(--font-mono)" }}>
                          {value}
                        </span>
                      </>
                    )}
                    {deadline && (
                      <>
                        <span>·</span>
                        <span
                          style={{
                            color: deadline.urgent
                              ? "#dc2626"
                              : deadline.overdue
                                ? "var(--muted)"
                                : "var(--muted)",
                            fontWeight: deadline.urgent ? 600 : 400,
                          }}
                        >
                          {deadline.overdue
                            ? "Closed"
                            : `Due ${deadline.label}`}
                        </span>
                      </>
                    )}
                    {item.next_action && (
                      <>
                        <span>·</span>
                        <span>Next: {item.next_action}</span>
                      </>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexShrink: 0,
                    alignItems: "center",
                  }}
                >
                  <select
                    className="input"
                    value={item.status}
                    onChange={(e) =>
                      updateStatus(item.id, e.target.value as BidPipelineStatus)
                    }
                    disabled={isUpdating}
                    style={{ fontSize: 12, padding: "4px 8px", minWidth: 130 }}
                  >
                    {STATUS_CONFIG.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="icon-btn"
                    title="Remove from pipeline"
                    style={{ color: "var(--muted)" }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M2 2l12 12M14 2L2 14" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && items.length > 0 && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "32px" }}
        >
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No items in this view.
          </p>
        </div>
      )}
    </div>
  );
}
