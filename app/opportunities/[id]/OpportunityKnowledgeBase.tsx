"use client";

import { useState, useEffect } from "react";

interface KbDoc {
  id: string;
  title: string;
}
interface RelatedChunk {
  document_id: string;
  document_title: string;
  excerpt: string;
}
interface TenderDoc {
  url: string;
  title: string | null;
}

function fileLabel(d: TenderDoc): string {
  if (d.title) return d.title;
  try {
    return decodeURIComponent(d.url.split("/").pop()?.split("?")[0] ?? d.url);
  } catch {
    return d.url;
  }
}

export function OpportunityKnowledgeBase({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [inKb, setInKb] = useState<KbDoc[]>([]);
  const [related, setRelated] = useState<RelatedChunk[]>([]);
  const [tenderDocs, setTenderDocs] = useState<TenderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  // url -> "adding" | "added" | "error"
  const [addState, setAddState] = useState<Record<string, string>>({});

  function load() {
    fetch(`/api/opportunities/${opportunityId}/kb-cross-ref`)
      .then((r) => r.json())
      .then(
        (d: {
          inKb?: KbDoc[];
          related?: RelatedChunk[];
          tenderDocs?: TenderDoc[];
        }) => {
          setInKb(d.inKb ?? []);
          setRelated(d.related ?? []);
          setTenderDocs(d.tenderDocs ?? []);
        },
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [opportunityId]);

  async function addToKb(doc: TenderDoc) {
    setAddState((s) => ({ ...s, [doc.url]: "adding" }));
    try {
      const res = await fetch(
        `/api/opportunities/${opportunityId}/add-document-to-kb`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: doc.url, title: doc.title ?? undefined }),
        },
      );
      if (!res.ok) {
        setAddState((s) => ({ ...s, [doc.url]: "error" }));
        return;
      }
      setAddState((s) => ({ ...s, [doc.url]: "added" }));
      load(); // refresh inKb + related
    } catch {
      setAddState((s) => ({ ...s, [doc.url]: "error" }));
    }
  }

  if (loading) return null;
  const nothing =
    inKb.length === 0 && related.length === 0 && tenderDocs.length === 0;
  if (nothing) return null;

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Knowledge base
      </div>

      {/* Tender documents → add to KB */}
      {tenderDocs.length > 0 && (
        <div style={{ marginBottom: related.length > 0 ? 18 : 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Tender documents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tenderDocs.map((d) => {
              const st = addState[d.url];
              return (
                <div
                  key={d.url}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13,
                      color: "var(--ink-2)",
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {fileLabel(d)}
                  </a>
                  {st === "added" ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "#059669",
                        flexShrink: 0,
                        fontWeight: 600,
                      }}
                    >
                      ✓ In knowledge base
                    </span>
                  ) : (
                    <button
                      className="btn ghost"
                      onClick={() => addToKb(d)}
                      disabled={st === "adding"}
                      style={{
                        fontSize: 11.5,
                        padding: "3px 10px",
                        flexShrink: 0,
                      }}
                    >
                      {st === "adding"
                        ? "Adding…"
                        : st === "error"
                          ? "Retry"
                          : "+ Add to KB"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents already ingested for this opportunity */}
      {inKb.length > 0 && (
        <div style={{ marginBottom: related.length > 0 ? 18 : 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            In your knowledge base
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {inKb.map((d) => (
              <span key={d.id} style={{ fontSize: 13, color: "var(--ink-2)" }}>
                ✓ {d.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related KB content (opportunity → knowledge base) */}
      {related.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            Relevant content from your knowledge base
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {related.map((r) => (
              <div
                key={r.document_id}
                style={{
                  padding: "8px 12px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginBottom: 2,
                  }}
                >
                  {r.document_title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {r.excerpt}…
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
