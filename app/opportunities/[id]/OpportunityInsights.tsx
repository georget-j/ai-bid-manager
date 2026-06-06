"use client";

import { useState, useEffect } from "react";

interface Insight {
  summary: string;
  key_points: string[];
  feasibility: string | null;
  gaps: string[];
  created_at: string;
}

export function OpportunityInsights({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/opportunities/${opportunityId}/insights`)
      .then((r) => r.json())
      .then((d: { insight: Insight | null }) => setInsight(d.insight))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [opportunityId]);

  async function generate() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/insights`, {
        method: "POST",
      });
      const d = (await res.json()) as { insight?: Insight; error?: string };
      if (!res.ok || !d.insight) {
        setError(d.error ?? "Could not generate insights.");
        return;
      }
      setInsight(d.insight);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: insight ? 14 : 4,
          flexWrap: "wrap",
        }}
      >
        <div className="eyebrow" style={{ margin: 0 }}>
          AI tender brief
        </div>
        {!loading && (
          <button
            className="btn ghost"
            onClick={generate}
            disabled={running}
            style={{ fontSize: 11.5, padding: "4px 12px" }}
          >
            {running
              ? "Generating…"
              : insight
                ? "Regenerate"
                : "Generate brief"}
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: "#dc2626", margin: "4px 0" }}>
          {error}
        </p>
      )}

      {!loading && !insight && !error && (
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          Generate a plain-English executive summary, feasibility read, and the
          key things a bidder must address — drawn from the description and any
          tender documents.
        </p>
      )}

      {insight && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--ink)",
              margin: 0,
            }}
          >
            {insight.summary}
          </p>

          {insight.key_points.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Key points
              </div>
              <ul
                style={{
                  margin: 0,
                  padding: "0 0 0 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {insight.key_points.map((p, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2)",
                      lineHeight: 1.5,
                    }}
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.feasibility && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--muted)",
                  marginBottom: 4,
                }}
              >
                Feasibility
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {insight.feasibility}
              </p>
            </div>
          )}

          {insight.gaps.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#b45309",
                  marginBottom: 6,
                }}
              >
                What a bidder must address
              </div>
              <ul
                style={{
                  margin: 0,
                  padding: "0 0 0 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {insight.gaps.map((g, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "#92400e",
                      lineHeight: 1.5,
                    }}
                  >
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
