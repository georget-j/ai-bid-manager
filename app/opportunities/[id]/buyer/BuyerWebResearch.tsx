"use client";

import { useState } from "react";

interface Citation {
  title: string;
  url: string;
}

interface PersonResearch {
  name: string;
  role: string | null;
  summary: string;
  citations: Citation[];
}

interface BuyerWebResearchData {
  buyer: { name: string; summary: string; citations: Citation[] } | null;
  people: PersonResearch[];
  generatedAt: string;
}

function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--muted)",
          marginBottom: 5,
        }}
      >
        Sources
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {citations.map((c, i) => {
          let host = c.url;
          try {
            host = new URL(c.url).hostname.replace(/^www\./, "");
          } catch {
            /* keep raw url */
          }
          return (
            <a
              key={i}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              title={c.title}
              style={{
                fontSize: 11,
                color: "var(--accent)",
                textDecoration: "none",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "2px 9px",
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {host} ↗
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function BuyerWebResearch({ opportunityId }: { opportunityId: string }) {
  const [data, setData] = useState<BuyerWebResearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function research(refresh = false) {
    setLoading(true);
    setStarted(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/buyer-research-online${
          refresh ? "?refresh=true" : ""
        }`,
        { method: "POST" },
      );
      const body = (await res.json()) as BuyerWebResearchData & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Failed to research buyer.");
      } else {
        setData(body);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const hasResults = data && (data.buyer || data.people.length > 0);

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div className="eyebrow">Online research</div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Searches public web sources for the buyer and any people named in
            the tender, with citations
          </p>
        </div>
        {!started && (
          <button
            className="btn primary"
            onClick={() => research()}
            style={{ fontSize: 12, padding: "5px 14px", flexShrink: 0 }}
          >
            Research buyer online
          </button>
        )}
        {started && !loading && (
          <button
            className="btn ghost"
            onClick={() => research(true)}
            style={{ fontSize: 12, padding: "5px 14px", flexShrink: 0 }}
          >
            Refresh
          </button>
        )}
      </div>

      {loading && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Searching public sources…
        </p>
      )}

      {error && <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>}

      {!loading && started && data && !hasResults && (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          No reliable public information found for this buyer.
        </p>
      )}

      {hasResults && (
        <>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--muted)",
              background: "#fef3c7",
              border: "1px solid #fde68a",
              borderRadius: "var(--r-sm)",
              padding: "7px 11px",
              marginBottom: 14,
            }}
          >
            AI-researched from public sources — verify before relying on it in a
            bid.
          </div>

          {data!.buyer && (
            <div style={{ marginBottom: data!.people.length ? 18 : 0 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                {data!.buyer.name}
              </p>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 13.5,
                  lineHeight: 1.7,
                  color: "var(--ink)",
                }}
              >
                {data!.buyer.summary}
              </div>
              <Sources citations={data!.buyer.citations} />
            </div>
          )}

          {data!.people.map((p, i) => (
            <div
              key={i}
              style={{
                paddingTop: 14,
                marginTop: 14,
                borderTop: "1px solid var(--border)",
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--ink)",
                  marginBottom: 2,
                }}
              >
                {p.name}
              </p>
              {p.role && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginBottom: 6,
                  }}
                >
                  {p.role}
                </p>
              )}
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 13.5,
                  lineHeight: 1.7,
                  color: "var(--ink)",
                }}
              >
                {p.summary}
              </div>
              <Sources citations={p.citations} />
            </div>
          ))}
        </>
      )}

      {!started && (
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          Uses live web search. Cached after the first run; use Refresh to
          re-research.
        </p>
      )}
    </div>
  );
}
