"use client";

import { useState, useEffect, use } from "react";
import { OpportunityTabs } from "../OpportunityTabs";

interface BuyerInfo {
  name: string;
  identifier: string | null;
  region: string | null;
  source_url: string | null;
  cpv_codes: string[];
}

interface TenderSummary {
  id: string;
  title: string;
  status: string;
  value_amount: number | null;
  value_currency: string | null;
  deadline_at: string | null;
  published_at: string | null;
  source_url: string | null;
}

interface BuyerStats {
  total: number;
  open: number;
  awarded: number;
  closed: number;
  avg_value: number | null;
  top_cpv: string[];
}

interface BuyerHistoryResponse {
  buyer: BuyerInfo | null;
  stats: BuyerStats | null;
  opportunities: TenderSummary[];
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  active: { label: "Open", color: "#059669" },
  awarded: { label: "Awarded", color: "#1d4ed8" },
  closed: { label: "Closed", color: "#6b7280" },
  cancelled: { label: "Cancelled", color: "#dc2626" },
  planned: { label: "Planned", color: "#b45309" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

function formatValue(amount: number | null, currency = "GBP") {
  if (!amount) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BuyerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [history, setHistory] = useState<BuyerHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [briefing, setBriefing] = useState<string>("");
  const [generatingBriefing, setGeneratingBriefing] = useState(false);
  const [briefingStarted, setBriefingStarted] = useState(false);

  useEffect(() => {
    fetch(`/api/opportunities/${id}/buyer-history`)
      .then((r) => r.json())
      .then((d: BuyerHistoryResponse) => setHistory(d))
      .catch(() => setHistory({ buyer: null, stats: null, opportunities: [] }))
      .finally(() => setLoadingHistory(false));
  }, [id]);

  async function generateBriefing() {
    setGeneratingBriefing(true);
    setBriefingStarted(true);
    setBriefing("");
    try {
      const res = await fetch(`/api/opportunities/${id}/buyer-research`, {
        method: "POST",
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setBriefing((prev) => prev + dec.decode(value, { stream: true }));
      }
    } finally {
      setGeneratingBriefing(false);
    }
  }

  return (
    <div style={{ maxWidth: 840 }}>
      <OpportunityTabs id={id} />

      {loadingHistory ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
        </div>
      ) : !history?.buyer ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No buyer information available for this opportunity.
          </p>
        </div>
      ) : (
        <>
          {/* Buyer profile */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              Buyer profile
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 4,
              }}
            >
              {history.buyer.name}
            </h2>
            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                fontSize: 13,
                color: "var(--muted)",
                marginBottom: history.buyer.source_url ? 12 : 0,
              }}
            >
              {history.buyer.region && <span>{history.buyer.region}</span>}
              {history.buyer.identifier && (
                <span>ID: {history.buyer.identifier}</span>
              )}
            </div>
            {history.buyer.source_url && (
              <a
                href={history.buyer.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: "var(--accent)" }}
              >
                View source notice →
              </a>
            )}
          </div>

          {/* Stats */}
          {history.stats && history.stats.total > 0 && (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                Tender history ({history.stats.total} tenders in our database)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 12,
                  marginBottom: history.opportunities.length > 0 ? 20 : 0,
                }}
              >
                {[
                  {
                    label: "Open",
                    value: history.stats.open,
                    color: "#059669",
                  },
                  {
                    label: "Awarded",
                    value: history.stats.awarded,
                    color: "#1d4ed8",
                  },
                  {
                    label: "Closed",
                    value: history.stats.closed,
                    color: "#6b7280",
                  },
                  {
                    label: "Avg. value",
                    value: history.stats.avg_value
                      ? (formatValue(history.stats.avg_value) ?? "—")
                      : "—",
                    color: "var(--ink)",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg)",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginBottom: 4,
                      }}
                    >
                      {label}
                    </p>
                    <p
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color,
                        margin: 0,
                      }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Recent tenders table */}
              {history.opportunities.length > 0 && (
                <>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--ink)",
                      marginBottom: 8,
                    }}
                  >
                    Recent tenders
                  </p>
                  <div style={{ fontSize: 12 }}>
                    {history.opportunities.map((opp) => {
                      const s =
                        STATUS_STYLES[opp.status] ?? STATUS_STYLES.unknown;
                      return (
                        <div
                          key={opp.id}
                          style={{
                            display: "flex",
                            gap: 12,
                            padding: "7px 0",
                            borderBottom: "1px solid var(--border)",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: s.color,
                              background: `${s.color}18`,
                              borderRadius: 999,
                              padding: "2px 7px",
                              flexShrink: 0,
                            }}
                          >
                            {s.label}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              color: "var(--ink)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {opp.source_url ? (
                              <a
                                href={opp.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: "var(--ink)",
                                  textDecoration: "none",
                                }}
                              >
                                {opp.title}
                              </a>
                            ) : (
                              opp.title
                            )}
                          </span>
                          {opp.value_amount && (
                            <span
                              style={{ color: "var(--muted)", flexShrink: 0 }}
                            >
                              {formatValue(
                                opp.value_amount,
                                opp.value_currency ?? "GBP",
                              )}
                            </span>
                          )}
                          {opp.published_at && (
                            <span
                              style={{ color: "var(--muted)", flexShrink: 0 }}
                            >
                              {formatDate(opp.published_at)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {history.stats && history.stats.total === 0 && (
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                No previous tenders from this buyer in our database yet. Sync
                more sources from the{" "}
                <a href="/sources" style={{ color: "var(--accent)" }}>
                  Sources page
                </a>{" "}
                to build buyer history.
              </p>
            </div>
          )}

          {/* AI Buyer briefing */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
                gap: 12,
              }}
            >
              <div>
                <div className="eyebrow">Buyer briefing</div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginTop: 2,
                  }}
                >
                  AI-generated summary of this buyer and what to emphasise in
                  your response
                </p>
              </div>
              {!briefingStarted && (
                <button
                  className="btn primary"
                  onClick={generateBriefing}
                  style={{ fontSize: 12, padding: "5px 14px", flexShrink: 0 }}
                >
                  Generate briefing
                </button>
              )}
              {briefingStarted && !generatingBriefing && (
                <button
                  className="btn ghost"
                  onClick={generateBriefing}
                  style={{ fontSize: 12, padding: "5px 14px", flexShrink: 0 }}
                >
                  Regenerate
                </button>
              )}
            </div>

            {generatingBriefing && !briefing && (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Researching buyer…
              </p>
            )}

            {briefing && (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 13.5,
                  lineHeight: 1.75,
                  color: "var(--ink)",
                  background: "var(--surface-2)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                  padding: "14px 18px",
                }}
              >
                {briefing}
                {generatingBriefing && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 14,
                      background: "var(--accent)",
                      marginLeft: 2,
                      verticalAlign: "text-bottom",
                      animation: "blink 1s step-start infinite",
                    }}
                  />
                )}
              </div>
            )}

            {!briefingStarted && (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                Uses buyer name, region, tender description, and their previous
                tenders to generate an actionable briefing. Cached after first
                generation.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
