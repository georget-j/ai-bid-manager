"use client";

import { useState } from "react";

interface Citation {
  title: string;
  url: string;
}

export function FunderResearch({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/funders/${encodeURIComponent(name)}/research`,
        { method: "POST" },
      );
      const body = (await res.json()) as {
        text?: string;
        citations?: Citation[];
        error?: string;
      };
      if (!res.ok) setError(body.error ?? "Research failed.");
      else {
        setText(body.text || "No reliable information found online.");
        setCitations(body.citations ?? []);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: text ? 10 : 0,
        }}
      >
        <div className="eyebrow">Online research</div>
        {!text && (
          <button
            className="btn ghost sm"
            onClick={run}
            disabled={busy}
            style={{ fontSize: 12.5 }}
          >
            {busy ? "Researching…" : "Research this funder"}
          </button>
        )}
      </div>
      {error && <p style={{ fontSize: 12.5, color: "#dc2626" }}>{error}</p>}
      {text && (
        <>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {text}
          </p>
          {citations.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {citations.map((c) => (
                <a
                  key={c.url}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11.5,
                    color: "var(--accent)",
                    textDecoration: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "2px 10px",
                  }}
                >
                  {c.title || new URL(c.url).hostname} ↗
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
