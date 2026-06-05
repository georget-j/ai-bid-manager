"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { OpportunityTabs } from "../OpportunityTabs";

interface Client {
  id: string;
  name: string;
  vertical: string | null;
}

interface GapResult {
  question_id: string;
  question_text: string;
  section_ref: string | null;
  coverage: "covered" | "partial" | "missing" | "expired";
  risk_level: "low" | "medium" | "high";
  matched_evidence: Array<{
    id: string;
    title: string;
    evidence_type: string;
    status: string;
  }>;
  gap_note: string;
}

interface GapReport {
  client?: { id: string; name: string };
  total_requirements: number;
  covered: number;
  partial: number;
  missing: number;
  expired: number;
  coverage_score: number;
  results: GapResult[];
  message?: string;
}

const COVERAGE_CONFIG = {
  covered: { label: "Covered", color: "#059669", bg: "#d1fae5", icon: "✓" },
  partial: { label: "Expiring", color: "#d97706", bg: "#fef3c7", icon: "⚠" },
  missing: { label: "Missing", color: "#6b7280", bg: "#f3f4f6", icon: "–" },
  expired: { label: "Expired", color: "#dc2626", bg: "#fee2e2", icon: "✕" },
} as const;

const RISK_CONFIG = {
  high: { color: "#dc2626", bg: "#fee2e2", label: "High risk" },
  medium: { color: "#d97706", bg: "#fef3c7", label: "Medium risk" },
  low: { color: "#059669", bg: "#d1fae5", label: "Low risk" },
} as const;

export default function EvidenceGapsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: opportunityId } = use(params);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [report, setReport] = useState<GapReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [coverageFilter, setCoverageFilter] = useState<string>("all");

  // Load clients
  useEffect(() => {
    fetch("/api/clients?status=active")
      .then((r) => r.json())
      .then((data: Client[]) => {
        setClients(data);
        // Auto-select if pipeline has a client
        fetch(`/api/opportunities/${opportunityId}/pipeline-status`)
          .then((r) => r.json())
          .then((d: { client_id?: string | null }) => {
            if (d.client_id) setSelectedClientId(d.client_id);
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, [opportunityId]);

  // Fetch gap report when client changes
  useEffect(() => {
    if (!selectedClientId) {
      setReport(null);
      return;
    }
    setLoading(true);
    fetch(
      `/api/opportunities/${opportunityId}/evidence-gaps?clientId=${selectedClientId}`,
    )
      .then((r) => r.json())
      .then((data: GapReport) => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [opportunityId, selectedClientId]);

  const filtered =
    coverageFilter === "all"
      ? (report?.results ?? [])
      : (report?.results ?? []).filter((r) => r.coverage === coverageFilter);

  const score = report?.coverage_score ?? 0;
  const scoreColor =
    score >= 75 ? "#059669" : score >= 50 ? "#d97706" : "#dc2626";

  return (
    <div>
      <OpportunityTabs id={opportunityId} />

      <div style={{ maxWidth: 860 }}>
        {/* Client selector */}
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Evidence gap analysis
          </div>
          {clients.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              No clients yet.{" "}
              <Link href="/clients" style={{ color: "var(--accent)" }}>
                Create a client →
              </Link>{" "}
              then add their evidence to run a gap analysis.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Analyse for:
              </span>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: "5px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                }}
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {selectedClientId && (
                <Link
                  href={`/clients/${selectedClientId}/evidence`}
                  style={{ fontSize: 12.5, color: "var(--muted)" }}
                >
                  Manage evidence →
                </Link>
              )}
            </div>
          )}
        </div>

        {loading && (
          <p style={{ fontSize: 13, color: "var(--muted)", padding: "0 4px" }}>
            Analysing…
          </p>
        )}

        {report && !loading && (
          <>
            {/* Score summary */}
            <div
              className="card"
              style={{ marginBottom: 16, overflow: "hidden" }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  gap: 24,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {/* Ring */}
                <div
                  style={{
                    position: "relative",
                    width: 64,
                    height: 64,
                    flexShrink: 0,
                  }}
                >
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="6"
                      strokeDasharray={`${(score / 100) * 163.4} 163.4`}
                      strokeLinecap="round"
                      transform="rotate(-90 32 32)"
                    />
                  </svg>
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: scoreColor,
                    }}
                  >
                    {score}
                  </span>
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--ink)",
                      fontFamily: "var(--font-serif)",
                      marginBottom: 4,
                    }}
                  >
                    {score >= 75
                      ? "Strong evidence position"
                      : score >= 50
                        ? "Partial evidence — gaps to resolve"
                        : "Significant evidence gaps"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {report.total_requirements} requirements analysed for{" "}
                    {report.client?.name}
                  </div>
                </div>

                {/* Counts */}
                <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                  {(["covered", "partial", "expired", "missing"] as const).map(
                    (k) => {
                      const cfg = COVERAGE_CONFIG[k];
                      const count =
                        k === "covered"
                          ? report.covered
                          : k === "partial"
                            ? report.partial
                            : k === "expired"
                              ? report.expired
                              : report.missing;
                      if (count === 0) return null;
                      return (
                        <div key={k} style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 700,
                              fontFamily: "var(--font-mono)",
                              color: cfg.color,
                            }}
                          >
                            {count}
                          </div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {cfg.label}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ padding: "10px 20px" }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 99,
                    background: "var(--border)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${score}%`,
                      background: scoreColor,
                      borderRadius: 99,
                    }}
                  />
                </div>
              </div>
            </div>

            {report.message && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--muted)",
                  marginBottom: 16,
                  padding: "10px 14px",
                  background: "var(--bg-tint)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                {report.message}
              </p>
            )}

            {/* Filter pills */}
            {report.results.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                {(
                  ["all", "missing", "expired", "partial", "covered"] as const
                ).map((f) => {
                  const count =
                    f === "all"
                      ? report.results.length
                      : report.results.filter((r) => r.coverage === f).length;
                  if (f !== "all" && count === 0) return null;
                  const cfg =
                    f === "all"
                      ? null
                      : COVERAGE_CONFIG[f as keyof typeof COVERAGE_CONFIG];
                  const active = coverageFilter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setCoverageFilter(f)}
                      style={{
                        fontSize: 12,
                        padding: "4px 12px",
                        borderRadius: 99,
                        border: "1px solid",
                        borderColor: active
                          ? (cfg?.color ?? "var(--accent)")
                          : "var(--border)",
                        background: active
                          ? (cfg?.bg ?? "var(--accent-tint)")
                          : "var(--surface-2)",
                        color: active
                          ? (cfg?.color ?? "var(--accent)")
                          : "var(--ink)",
                        cursor: "pointer",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {f === "all" ? "All" : COVERAGE_CONFIG[f].label} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Gap list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((r) => {
                const cov = COVERAGE_CONFIG[r.coverage];
                const risk = RISK_CONFIG[r.risk_level];
                return (
                  <div
                    key={r.question_id}
                    className="card"
                    style={{
                      padding: "14px 18px",
                      borderLeft: `3px solid ${cov.color}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      {/* Coverage icon */}
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: cov.bg,
                          color: cov.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {cov.icon}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {r.section_ref && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--muted)",
                              fontFamily: "var(--font-mono)",
                              marginBottom: 3,
                              letterSpacing: "0.04em",
                            }}
                          >
                            {r.section_ref}
                          </div>
                        )}
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--ink)",
                            margin: "0 0 6px",
                            lineHeight: 1.5,
                          }}
                        >
                          {r.question_text}
                        </p>
                        <p
                          style={{
                            fontSize: 12,
                            color:
                              r.coverage === "covered"
                                ? "#059669"
                                : r.coverage === "missing"
                                  ? "var(--muted)"
                                  : "#d97706",
                            margin: 0,
                            lineHeight: 1.5,
                          }}
                        >
                          {r.gap_note}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexShrink: 0,
                          alignItems: "center",
                        }}
                      >
                        {r.coverage !== "covered" && r.risk_level !== "low" && (
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: "2px 8px",
                              borderRadius: 99,
                              background: risk.bg,
                              color: risk.color,
                              fontWeight: 600,
                            }}
                          >
                            {risk.label}
                          </span>
                        )}
                        {r.coverage !== "covered" && (
                          <Link
                            href={`/clients/${selectedClientId}/evidence`}
                            style={{ fontSize: 11.5, color: "var(--muted)" }}
                          >
                            Add →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && report.results.length > 0 && (
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  No items match this filter.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
