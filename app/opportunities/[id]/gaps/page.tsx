"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { OpportunityTabs } from "../OpportunityTabs";

interface Client {
  id: string;
  name: string;
  vertical: string | null;
}

interface AIGapResult {
  question_id: string;
  coverage: "covered" | "partial" | "missing" | "expired";
  matched_evidence_ids: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
}

const AI_CONFIDENCE_CONFIG = {
  high: { label: "High confidence", color: "#059669" },
  medium: { label: "Medium confidence", color: "#d97706" },
  low: { label: "Low confidence", color: "#6b7280" },
} as const;

interface GapResult {
  question_id: string;
  question_text: string;
  section_ref: string | null;
  is_mandatory: boolean;
  coverage: "covered" | "partial" | "missing" | "expired";
  risk_level: "low" | "medium" | "high";
  signals_detected: string[];
  signals_detected_types: string[];
  matched_evidence: Array<{
    id: string;
    title: string;
    evidence_type: string;
    status: string;
    expires_at: string | null;
  }>;
  gap_note: string;
}

const RISK_SORT: Record<string, number> = { high: 0, medium: 1, low: 2 };
const COVERAGE_SORT: Record<string, number> = {
  expired: 0,
  missing: 1,
  partial: 2,
  covered: 3,
};

function sortByRisk(results: GapResult[]): GapResult[] {
  return [...results].sort((a, b) => {
    const coverageDiff = COVERAGE_SORT[a.coverage] - COVERAGE_SORT[b.coverage];
    if (coverageDiff !== 0) return coverageDiff;
    const riskDiff = RISK_SORT[a.risk_level] - RISK_SORT[b.risk_level];
    if (riskDiff !== 0) return riskDiff;
    // Mandatory items first within same risk level
    if (a.is_mandatory && !b.is_mandatory) return -1;
    if (!a.is_mandatory && b.is_mandatory) return 1;
    return 0;
  });
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
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
  message?: string | null;
  state?: "no-questions" | "no-requirements" | "no-evidence" | "ok";
  evidence_count?: number;
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
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<AIGapResult[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCached, setAiCached] = useState(false);

  async function runAiAnalysis() {
    if (!selectedClientId) return;
    setAiLoading(true);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/ai-gap-match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selectedClientId }),
        },
      );
      const d = await res.json();
      setAiResults(d.results ?? null);
      setAiCached(d.cached ?? false);
    } finally {
      setAiLoading(false);
    }
  }

  async function clearAiAnalysis() {
    if (!selectedClientId) return;
    await fetch(
      `/api/opportunities/${opportunityId}/ai-gap-match?clientId=${selectedClientId}`,
      { method: "DELETE" },
    );
    setAiResults(null);
    setAiCached(false);
  }
  const [addForm, setAddForm] = useState({
    title: "",
    evidence_type: "other",
    expires_at: "",
    notes: "",
  });
  const [addSubmitting, setAddSubmitting] = useState(false);

  function refreshReport() {
    if (!selectedClientId) return;
    setLoading(true);
    fetch(
      `/api/opportunities/${opportunityId}/evidence-gaps?clientId=${selectedClientId}`,
    )
      .then((r) => r.json())
      .then((data: GapReport) => setReport(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function submitAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId || !addForm.title) return;
    setAddSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${selectedClientId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title,
          evidence_type: addForm.evidence_type,
          expires_at: addForm.expires_at || null,
          notes: addForm.notes || null,
        }),
      });
      if (res.ok) {
        setAddingFor(null);
        setAddForm({
          title: "",
          evidence_type: "other",
          expires_at: "",
          notes: "",
        });
        // New evidence invalidates any cached AI analysis. Drop the cache, then
        // recompute: keyword report always; AI too if the user had it on.
        const hadAi = aiResults !== null;
        await fetch(
          `/api/opportunities/${opportunityId}/ai-gap-match?clientId=${selectedClientId}`,
          { method: "DELETE" },
        ).catch(() => {});
        setAiResults(null);
        setAiCached(false);
        refreshReport();
        if (hadAi) runAiAnalysis();
      }
    } finally {
      setAddSubmitting(false);
    }
  }

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

  const filtered = sortByRisk(
    coverageFilter === "all"
      ? (report?.results ?? [])
      : (report?.results ?? []).filter((r) => r.coverage === coverageFilter),
  );

  // Evidence items expiring within 90 days that are referenced in the current results
  const expiringSoon = (report?.results ?? [])
    .flatMap((r) => r.matched_evidence)
    .filter(
      (ev) =>
        ev.expires_at &&
        ev.status === "expiring_soon" &&
        daysUntil(ev.expires_at) <= 90,
    )
    .filter((ev, idx, arr) => arr.findIndex((e) => e.id === ev.id) === idx);

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
              {selectedClientId && report && (
                <>
                  {aiResults ? (
                    <>
                      <span style={{ fontSize: 11.5, color: "#059669" }}>
                        ✓ AI analysis{aiCached ? " (cached)" : ""}
                      </span>
                      <button
                        className="btn ghost"
                        onClick={clearAiAnalysis}
                        style={{ fontSize: 11, padding: "3px 9px" }}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn"
                      onClick={runAiAnalysis}
                      disabled={aiLoading}
                      style={{ fontSize: 12, padding: "4px 12px" }}
                    >
                      {aiLoading ? "Analysing with AI…" : "Analyse with AI"}
                    </button>
                  )}
                </>
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  fontSize: 13,
                  color:
                    report.state === "no-evidence" ? "#92400e" : "var(--muted)",
                  marginBottom: 16,
                  padding: "10px 14px",
                  background:
                    report.state === "no-evidence"
                      ? "#fef3c7"
                      : "var(--bg-tint)",
                  border:
                    report.state === "no-evidence"
                      ? "1px solid #fcd34d"
                      : "none",
                  borderRadius: "var(--r-sm)",
                }}
              >
                <span>{report.message}</span>
                {report.state === "no-evidence" && selectedClientId && (
                  <Link
                    href={`/clients/${selectedClientId}/evidence`}
                    className="btn primary"
                    style={{ fontSize: 12, padding: "5px 12px", flexShrink: 0 }}
                  >
                    Add evidence
                  </Link>
                )}
                {(report.state === "no-questions" ||
                  report.state === "no-requirements") && (
                  <Link
                    href={`/opportunities/${opportunityId}/rfp`}
                    className="btn ghost"
                    style={{ fontSize: 12, padding: "5px 12px", flexShrink: 0 }}
                  >
                    Go to RFP workflow
                  </Link>
                )}
              </div>
            )}

            {/* Expiring soon callout */}
            {expiringSoon.length > 0 && (
              <div
                style={{
                  padding: "10px 16px",
                  background: "#fef3c7",
                  border: "1px solid #fcd34d",
                  borderRadius: "var(--r-sm)",
                  marginBottom: 14,
                  fontSize: 12,
                  color: "#92400e",
                }}
              >
                <span style={{ fontWeight: 600 }}>⚠ Expiring soon: </span>
                {expiringSoon.map((ev, i) => (
                  <span key={ev.id}>
                    {i > 0 && " · "}
                    {ev.title}
                    {ev.expires_at && (
                      <span style={{ fontWeight: 400, color: "#b45309" }}>
                        {" "}
                        (expires {formatExpiry(ev.expires_at)})
                      </span>
                    )}
                  </span>
                ))}
                {" — renew before submission"}
              </div>
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
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    alignSelf: "center",
                    marginLeft: 4,
                  }}
                >
                  sorted by risk
                </span>
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
                        {/* Section + mandatory badge row */}
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            marginBottom: 3,
                            flexWrap: "wrap",
                          }}
                        >
                          {r.section_ref && (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: "var(--muted)",
                                fontFamily: "var(--font-mono)",
                                letterSpacing: "0.04em",
                              }}
                            >
                              {r.section_ref}
                            </span>
                          )}
                          {r.is_mandatory && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#dc2626",
                                background: "#fee2e2",
                                borderRadius: 999,
                                padding: "1px 6px",
                              }}
                            >
                              Mandatory
                            </span>
                          )}
                        </div>

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

                        {/* Gap note */}
                        <p
                          style={{
                            fontSize: 12,
                            color:
                              r.coverage === "covered"
                                ? "#059669"
                                : r.coverage === "missing"
                                  ? "var(--muted)"
                                  : "#d97706",
                            margin: "0 0 4px",
                            lineHeight: 1.5,
                          }}
                        >
                          {r.gap_note}
                        </p>

                        {/* Matched evidence with expiry dates */}
                        {r.matched_evidence.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                              marginTop: 4,
                            }}
                          >
                            {r.matched_evidence.map((ev) => {
                              const expiry = formatExpiry(ev.expires_at);
                              const isExpiring = ev.status === "expiring_soon";
                              const isExpired = ev.status === "expired";
                              return (
                                <span
                                  key={ev.id}
                                  style={{
                                    fontSize: 11,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: isExpired
                                      ? "#fee2e2"
                                      : isExpiring
                                        ? "#fef3c7"
                                        : "#d1fae5",
                                    color: isExpired
                                      ? "#dc2626"
                                      : isExpiring
                                        ? "#92400e"
                                        : "#065f46",
                                  }}
                                >
                                  {ev.title}
                                  {expiry && (
                                    <span style={{ opacity: 0.75 }}>
                                      {" "}
                                      · expires {expiry}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Signals hint for missing items */}
                        {r.coverage === "missing" &&
                          r.signals_detected.length > 0 && (
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 4,
                                marginBottom: 0,
                              }}
                            >
                              We looked for: {r.signals_detected.join(", ")} —
                              add evidence of this type to cover this
                              requirement
                            </p>
                          )}
                        {r.coverage === "missing" &&
                          r.signals_detected.length === 0 && (
                            <p
                              style={{
                                fontSize: 11,
                                color: "var(--muted)",
                                marginTop: 4,
                                marginBottom: 0,
                              }}
                            >
                              No evidence pattern detected — add evidence
                              manually and re-run
                            </p>
                          )}

                        {/* AI result overlay */}
                        {aiResults &&
                          (() => {
                            const ai = aiResults.find(
                              (a) => a.question_id === r.question_id,
                            );
                            if (!ai) return null;
                            const conf = AI_CONFIDENCE_CONFIG[ai.confidence];
                            return (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "6px 10px",
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--r-sm)",
                                  fontSize: 11.5,
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--muted)",
                                    marginRight: 6,
                                  }}
                                >
                                  AI:
                                </span>
                                <span style={{ color: "var(--ink)" }}>
                                  {ai.reason}
                                </span>
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontSize: 10.5,
                                    color: conf.color,
                                  }}
                                >
                                  {conf.label}
                                </span>
                              </div>
                            );
                          })()}
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
                        {(r.coverage === "missing" ||
                          r.coverage === "expired") && (
                          <button
                            className="btn ghost"
                            onClick={() => {
                              setAddingFor(r.question_id);
                              setAddForm({
                                title: "",
                                evidence_type:
                                  r.signals_detected_types[0] ?? "other",
                                expires_at: "",
                                notes: "",
                              });
                            }}
                            style={{ fontSize: 11, padding: "2px 9px" }}
                          >
                            + Add evidence
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline add form */}
                    {addingFor === r.question_id && (
                      <form
                        onSubmit={submitAddEvidence}
                        style={{
                          marginTop: 12,
                          padding: "12px 14px",
                          background: "var(--surface-2)",
                          borderRadius: "var(--r-sm)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--muted)",
                            margin: 0,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Quick add evidence
                        </p>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <input
                            type="text"
                            placeholder="Evidence title *"
                            value={addForm.title}
                            onChange={(e) =>
                              setAddForm((f) => ({
                                ...f,
                                title: e.target.value,
                              }))
                            }
                            required
                            style={{
                              flex: "1 1 180px",
                              fontSize: 12,
                              padding: "5px 9px",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--r-sm)",
                              background: "var(--bg)",
                              color: "var(--ink)",
                            }}
                          />
                          <select
                            value={addForm.evidence_type}
                            onChange={(e) =>
                              setAddForm((f) => ({
                                ...f,
                                evidence_type: e.target.value,
                              }))
                            }
                            style={{
                              flex: "0 0 auto",
                              fontSize: 12,
                              padding: "5px 9px",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--r-sm)",
                              background: "var(--bg)",
                              color: "var(--ink)",
                            }}
                          >
                            <option value="certification">Certification</option>
                            <option value="policy">Policy</option>
                            <option value="case_study">Case Study</option>
                            <option value="financial">Financial</option>
                            <option value="accreditation">Accreditation</option>
                            <option value="reference">Reference</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            type="date"
                            value={addForm.expires_at}
                            onChange={(e) =>
                              setAddForm((f) => ({
                                ...f,
                                expires_at: e.target.value,
                              }))
                            }
                            title="Expiry date (optional)"
                            style={{
                              flex: "0 0 auto",
                              fontSize: 12,
                              padding: "5px 9px",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--r-sm)",
                              background: "var(--bg)",
                              color: "var(--ink)",
                            }}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Notes (optional — helps with matching)"
                          value={addForm.notes}
                          onChange={(e) =>
                            setAddForm((f) => ({ ...f, notes: e.target.value }))
                          }
                          style={{
                            fontSize: 12,
                            padding: "5px 9px",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--r-sm)",
                            background: "var(--bg)",
                            color: "var(--ink)",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="submit"
                            className="btn primary"
                            disabled={addSubmitting || !addForm.title}
                            style={{ fontSize: 12, padding: "4px 12px" }}
                          >
                            {addSubmitting ? "Adding…" : "Add & re-analyse"}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setAddingFor(null)}
                            style={{ fontSize: 12, padding: "4px 10px" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
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
