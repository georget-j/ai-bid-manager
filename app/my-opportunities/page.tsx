"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import type { BidPipelineStatus } from "@/lib/procurement/types";

interface Recommendation {
  id: string;
  title: string;
  buyer_name: string | null;
  region: string | null;
  deadline_at: string | null;
  value_amount: string | number | null;
  value_currency: string | null;
  procurement_stage: string;
  fit_score: number;
  recommended_action: string;
  reasons: string[];
  risks: string[];
  saved: boolean;
}

interface PipelineItem {
  id: string;
  opportunity_id: string;
  status: BidPipelineStatus;
  opportunity: {
    id: string;
    title: string;
    buyer_name: string | null;
    region: string | null;
    deadline_at: string | null;
    value_amount: string | number | null;
    value_currency: string | null;
    procurement_stage: string;
    status: string;
  } | null;
}

interface RFPRunSummary {
  run_id: string;
  rfp_title: string;
  created_at: string;
  question_count: number;
  answered_count: number;
  confidence_distribution: { high: number; medium: number; low: number };
}

function formatValue(amount: string | number | null) {
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

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "#059669" : score >= 50 ? "#d97706" : "var(--muted)";
  const bg =
    score >= 75 ? "#d1fae5" : score >= 50 ? "#fef3c7" : "var(--bg-tint)";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: bg,
        color,
        fontFamily: "var(--font-mono)",
        flexShrink: 0,
      }}
    >
      {score}% fit
    </span>
  );
}

export default function MyOpportunitiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") === "rfp" ? "rfp" : "opportunities";

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [rfpRuns, setRfpRuns] = useState<RFPRunSummary[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [loadingPipeline, setLoadingPipeline] = useState(true);
  const [loadingRfp, setLoadingRfp] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);

  const loadRecs = useCallback(() => {
    setLoadingRecs(true);
    fetch("/api/opportunities/recommendations")
      .then((r) => r.json())
      .then(
        (d: {
          recommendations?: Recommendation[];
          reason?: string;
          error?: string;
        }) => {
          if (d.reason === "no-profile") {
            setNoProfile(true);
          } else {
            setRecs(d.recommendations ?? []);
          }
        },
      )
      .catch(() => {})
      .finally(() => setLoadingRecs(false));
  }, []);

  const loadPipeline = useCallback(() => {
    setLoadingPipeline(true);
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((d: { items?: PipelineItem[] }) => setPipeline(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingPipeline(false));
  }, []);

  useEffect(() => {
    loadRecs();
    loadPipeline();
  }, [loadRecs, loadPipeline]);

  useEffect(() => {
    if (activeTab !== "rfp") return;
    setLoadingRfp(true);
    fetch("/api/rfp/runs")
      .then((r) => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) setRfpRuns(d as RFPRunSummary[]);
      })
      .catch(() => {})
      .finally(() => setLoadingRfp(false));
  }, [activeTab]);

  async function saveOpportunity(opportunityId: string) {
    setSavingId(opportunityId);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/add-to-pipeline`,
        { method: "POST" },
      );
      if (res.ok) {
        loadPipeline();
        setRecs((prev) => prev.filter((r) => r.id !== opportunityId));
      }
    } finally {
      setSavingId(null);
    }
  }

  const activeStatuses: BidPipelineStatus[] = [
    "new-match",
    "reviewing",
    "bid",
    "in-progress",
    "awaiting-review",
  ];
  const activePipeline = pipeline.filter((p) =>
    activeStatuses.includes(p.status),
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Intelligence</div>
        <h1>
          My <em>opportunities</em>
        </h1>
        <p className="subtitle">
          AI-recommended tenders matched to your organisation profile, plus the
          opportunities you are actively pursuing.
        </p>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          marginBottom: 24,
        }}
      >
        {(
          [
            { key: "opportunities", label: "Opportunities" },
            { key: "rfp", label: "RFP Runs" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() =>
              router.push(
                key === "opportunities"
                  ? "/my-opportunities"
                  : "/my-opportunities?tab=rfp",
              )
            }
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13.5,
              fontWeight: activeTab === key ? 600 : 400,
              padding: "8px 18px",
              color: activeTab === key ? "var(--ink)" : "var(--muted)",
              borderBottom:
                activeTab === key
                  ? "2px solid var(--ink)"
                  : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── RFP Runs tab ── */}
      {activeTab === "rfp" && (
        <section>
          {loadingRfp ? (
            <div className="card card-pad" style={{ padding: "24px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
            </div>
          ) : rfpRuns.length === 0 ? (
            <div
              className="card card-pad"
              style={{ padding: "28px 24px", textAlign: "center" }}
            >
              <p
                style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}
              >
                No RFP runs yet. Open an opportunity, go to the{" "}
                <strong>RFP Response</strong> tab, and extract questions from a
                tender document to start.
              </p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "hidden" }}>
              {rfpRuns.map((run, i) => (
                <Link
                  key={run.run_id}
                  href={`/rfp/${run.run_id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 20px",
                    borderBottom:
                      i < rfpRuns.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: "var(--ink)",
                        marginBottom: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {run.rfp_title}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(run.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {run.question_count} questions · {run.answered_count}{" "}
                      answered
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {run.confidence_distribution.high > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#d1fae5",
                          color: "#059669",
                          fontWeight: 600,
                        }}
                      >
                        {run.confidence_distribution.high} high
                      </span>
                    )}
                    {run.confidence_distribution.low > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          color: "#dc2626",
                          fontWeight: 600,
                        }}
                      >
                        {run.confidence_distribution.low} low
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Opportunities tab ── */}
      {activeTab === "opportunities" && (
        <>
          {/* Saved / active pipeline */}
          <section style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                Saved opportunities
              </h2>
              <Link
                href="/pipeline"
                style={{
                  fontSize: 12,
                  color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                Full pipeline →
              </Link>
            </div>

            {loadingPipeline ? (
              <div className="card card-pad" style={{ padding: "24px 20px" }}>
                <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
              </div>
            ) : activePipeline.length === 0 ? (
              <div
                className="card card-pad"
                style={{ padding: "28px 24px", textAlign: "center" }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  No saved opportunities yet. Save a recommended opportunity
                  below, or add one from the{" "}
                  <Link
                    href="/opportunities"
                    style={{ color: "var(--accent)" }}
                  >
                    Opportunities catalog
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="card" style={{ overflow: "hidden" }}>
                {activePipeline.map((item, i) => {
                  const opp = item.opportunity;
                  const deadline = formatDeadline(opp?.deadline_at ?? null);
                  const value = formatValue(opp?.value_amount ?? null);
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "14px 20px",
                        borderBottom:
                          i < activePipeline.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={`/opportunities/${item.opportunity_id}`}
                          style={{
                            fontWeight: 500,
                            fontSize: 13.5,
                            color: "var(--ink)",
                            textDecoration: "none",
                            display: "block",
                            marginBottom: 3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opp?.title ?? "Unknown opportunity"}
                        </Link>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            fontSize: 12,
                            color: "var(--muted)",
                            flexWrap: "wrap",
                          }}
                        >
                          {opp?.buyer_name && <span>{opp.buyer_name}</span>}
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
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--accent-tint)",
                          color: "var(--accent)",
                          flexShrink: 0,
                        }}
                      >
                        {item.status.replace(/-/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recommendations */}
          <section>
            <div style={{ marginBottom: 12 }}>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--ink)",
                  margin: 0,
                }}
              >
                Recommended for you
              </h2>
              <p
                style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}
              >
                Matched to your organisation profile using CPV codes, keywords,
                regions, and contract value range.
              </p>
            </div>

            {noProfile && (
              <div
                className="card card-pad"
                style={{
                  background: "var(--accent-tint)",
                  padding: "20px 24px",
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    lineHeight: 1.6,
                  }}
                >
                  Set up your{" "}
                  <Link href="/profile" style={{ color: "var(--accent)" }}>
                    Organisation Profile
                  </Link>{" "}
                  to receive AI-matched opportunity recommendations.
                </p>
              </div>
            )}

            {!noProfile && loadingRecs && (
              <div className="card card-pad" style={{ padding: "24px 20px" }}>
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  Scoring opportunities…
                </p>
              </div>
            )}

            {!noProfile && !loadingRecs && recs.length === 0 && (
              <div className="card card-pad" style={{ padding: "24px 20px" }}>
                <p style={{ fontSize: 13, color: "var(--muted)" }}>
                  No matching opportunities found right now. Broaden your
                  profile keywords or wait for the next sync.
                </p>
              </div>
            )}

            {!noProfile && recs.length > 0 && (
              <div className="card" style={{ overflow: "hidden" }}>
                {recs.map((rec, i) => {
                  const deadline = formatDeadline(rec.deadline_at);
                  const value = formatValue(rec.value_amount);
                  const isSaving = savingId === rec.id;
                  return (
                    <div
                      key={rec.id}
                      style={{
                        padding: "16px 20px",
                        borderBottom:
                          i < recs.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                        display: "flex",
                        gap: 16,
                        alignItems: "flex-start",
                        opacity: isSaving ? 0.6 : 1,
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
                            href={`/opportunities/${rec.id}`}
                            style={{
                              fontWeight: 500,
                              fontSize: 13.5,
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            {rec.title}
                          </Link>
                          <ScoreBadge score={rec.fit_score} />
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            fontSize: 12,
                            color: "var(--muted)",
                            flexWrap: "wrap",
                            marginBottom: rec.reasons.length > 0 ? 6 : 0,
                          }}
                        >
                          {rec.buyer_name && <span>{rec.buyer_name}</span>}
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
                        </div>

                        {rec.reasons.length > 0 && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--ink-2)",
                              lineHeight: 1.5,
                            }}
                          >
                            {rec.reasons.slice(0, 2).join(" · ")}
                          </div>
                        )}
                      </div>

                      <button
                        className="btn accent"
                        onClick={() => saveOpportunity(rec.id)}
                        disabled={isSaving}
                        style={{
                          fontSize: 12,
                          padding: "5px 14px",
                          flexShrink: 0,
                        }}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
