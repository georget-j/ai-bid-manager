"use client";

import { useState, useEffect } from "react";

interface LifecycleEvent {
  date: string;
  tags: string[];
  stage: string;
  title: string;
}

interface Compiled {
  title: string | null;
  status: string | null;
  stage: string;
  buyer: string | null;
  valueAmount: number | null;
  valueCurrency: string | null;
  deadline: string | null;
}

interface Lifecycle {
  supported: boolean;
  ocid?: string;
  ftsUrl?: string | null;
  compiled?: Compiled | null;
  events?: LifecycleEvent[];
}

const STAGE_COLOR: Record<string, string> = {
  planning: "#3b82f6",
  tender: "#059669",
  award: "#d97706",
  contract: "#6366f1",
  implementation: "#0891b2",
  unknown: "#9ca3af",
};

function stageColor(stage: string): string {
  return STAGE_COLOR[stage] ?? STAGE_COLOR.unknown;
}

function statusColor(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "open") return "#059669";
  if (s === "cancelled" || s === "withdrawn") return "#dc2626";
  if (s === "complete" || s === "closed" || s === "unsuccessful")
    return "#6b7280";
  return "#3b82f6";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OpportunityLifecycle({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [data, setData] = useState<Lifecycle | null>(null);

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/lifecycle`)
      .then((r) => r.json())
      .then((d: Lifecycle) => setData(d))
      .catch(() => {});
  }, [opportunityId]);

  // Only Find a Tender notices have a record-package lifecycle.
  if (!data || !data.supported) return null;
  const compiled = data.compiled ?? null;
  const events = data.events ?? [];
  if (!compiled && events.length === 0) return null;

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="eyebrow" style={{ margin: 0 }}>
          Tender lifecycle
        </div>
        {data.ftsUrl && (
          <a
            href={data.ftsUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 11.5,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            View on Find a Tender ↗
          </a>
        )}
      </div>

      {compiled && (
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
            padding: "10px 14px",
            background: "var(--surface-2)",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--border)",
            marginBottom: 14,
          }}
        >
          {compiled.status && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: 999,
                color: "#fff",
                background: statusColor(compiled.status),
                textTransform: "capitalize",
              }}
            >
              {compiled.status}
            </span>
          )}
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Current state
          </span>
          {compiled.valueAmount != null && (
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {(compiled.valueCurrency ?? "GBP") === "GBP" ? "£" : ""}
              {compiled.valueAmount.toLocaleString()}{" "}
              {(compiled.valueCurrency ?? "GBP") !== "GBP"
                ? compiled.valueCurrency
                : ""}
            </span>
          )}
          {compiled.deadline && (
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              Deadline {fmtDate(compiled.deadline)}
            </span>
          )}
        </div>
      )}

      {/* Timeline (newest first) */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {events.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            {/* rail */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 12,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: stageColor(e.stage),
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              {i < events.length - 1 && (
                <span
                  style={{
                    flex: 1,
                    width: 2,
                    background: "var(--border)",
                    marginTop: 2,
                  }}
                />
              )}
            </div>
            {/* content */}
            <div style={{ paddingBottom: i < events.length - 1 ? 14 : 0 }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: stageColor(e.stage),
                  }}
                >
                  {e.stage}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {fmtDate(e.date)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink)",
                  lineHeight: 1.45,
                  marginTop: 2,
                }}
              >
                {e.title}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
