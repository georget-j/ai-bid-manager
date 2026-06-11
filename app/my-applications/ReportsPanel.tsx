"use client";

import { useState, useEffect } from "react";
import { daysUntil, formatDaysLeft } from "@/lib/dates";

interface Report {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
}

const STATUSES = ["not-started", "in-progress", "submitted"];

function dueLabel(iso: string | null): { text: string; color: string } | null {
  if (!iso) return null;
  const days = daysUntil(iso);
  const color = days < 0 ? "#dc2626" : days <= 14 ? "#b45309" : "#059669";
  return { text: formatDaysLeft(days), color };
}

export function ReportsPanel({
  draftId,
  grantId,
}: {
  draftId: string;
  grantId: string | null;
}) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/grants/reports?draftId=${draftId}`)
      .then((r) => r.json())
      .then((d: { reports?: Report[] }) => setReports(d.reports ?? []))
      .catch(() => setReports([]));
  }, [draftId]);

  async function add() {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/grants/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draftId,
          grant_id: grantId,
          title: title.trim(),
          due_at: due ? `${due}T00:00:00Z` : null,
        }),
      });
      const d = (await res.json()) as { report?: Report };
      if (d.report) setReports((p) => [...(p ?? []), d.report!]);
      setTitle("");
      setDue("");
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setReports((p) => p?.map((r) => (r.id === id ? { ...r, status } : r)) ?? p);
    await fetch(`/api/grants/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  async function remove(id: string) {
    setReports((p) => p?.filter((r) => r.id !== id) ?? p);
    await fetch(`/api/grants/reports/${id}`, { method: "DELETE" }).catch(
      () => {},
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        Reporting
      </div>

      {(reports ?? []).map((r) => {
        const due = dueLabel(r.due_at);
        return (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 5,
              fontSize: 11.5,
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration:
                  r.status === "submitted" ? "line-through" : "none",
                color: r.status === "submitted" ? "var(--muted)" : "var(--ink)",
              }}
            >
              {r.title}
            </span>
            {due && (
              <span style={{ color: due.color, flexShrink: 0 }}>
                {due.text}
              </span>
            )}
            <select
              value={r.status}
              onChange={(e) => setStatus(r.id, e.target.value)}
              aria-label="Report status"
              style={{
                fontSize: 10.5,
                padding: "1px 3px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                flexShrink: 0,
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={() => remove(r.id)}
              aria-label="Delete report"
              style={{
                border: "none",
                background: "none",
                color: "var(--muted)",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add report (e.g. Interim report)"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            padding: "3px 6px",
            borderRadius: 5,
            border: "1px solid var(--border)",
          }}
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Report due date"
          style={{
            fontSize: 11,
            padding: "3px 4px",
            borderRadius: 5,
            border: "1px solid var(--border)",
            width: 120,
          }}
        />
        <button
          onClick={add}
          disabled={adding || !title.trim()}
          className="btn ghost sm"
          style={{ fontSize: 11, padding: "3px 8px" }}
        >
          +
        </button>
      </div>
    </div>
  );
}
