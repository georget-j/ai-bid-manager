"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Rec {
  id: string;
  title: string;
  funder_name: string | null;
  amount_min: number | null;
  amount_max: number | null;
  deadline_at: string | null;
  status: string;
  fit_score: number;
  eligible: boolean;
  recommended_action: string;
  reasons: string[];
  risks: string[];
  missing: string[];
}

function scoreColor(n: number) {
  if (n >= 70) return "#059669";
  if (n >= 40) return "#d97706";
  return "#dc2626";
}

export default function MyGrantsPage() {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/grants/recommendations")
      .then((r) => r.json())
      .then((d: { recommendations?: Rec[]; reason?: string }) => {
        setRecs(d.recommendations ?? []);
        setReason(d.reason ?? null);
      })
      .catch(() => setRecs([]));
  }, []);

  return (
    <div style={{ maxWidth: 820 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Funding</div>
        <h1>
          My <em>grants</em>
        </h1>
        <p className="subtitle">
          Open grant calls scored against your organisation profile —
          eligibility + a confidence score for how close you are.
        </p>
      </div>

      {recs === null ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Scoring grants…</p>
      ) : reason === "no-profile" ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Complete your{" "}
            <Link href="/profile" style={{ color: "var(--accent)" }}>
              organisation profile
            </Link>{" "}
            (including grant-eligibility fields) to get scored recommendations.
          </p>
        </div>
      ) : recs.length === 0 ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No open grant calls match yet. The catalogue currently holds awarded
            grants (browse + funder research); open-call sources (UKRI funding
            finder, GOV.UK Find a Grant) are being added.
          </p>
        </div>
      ) : (
        recs.map((r) => (
          <Link
            key={r.id}
            href={`/grants/${r.id}`}
            className="card card-pad"
            style={{
              display: "block",
              marginBottom: 10,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {r.title}
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted)",
                    marginBottom: 6,
                  }}
                >
                  {r.funder_name ?? "Unknown funder"}
                </p>
                {r.reasons[0] && (
                  <p style={{ fontSize: 12.5, color: "#059669" }}>
                    ✓ {r.reasons[0]}
                  </p>
                )}
                {r.risks[0] && (
                  <p style={{ fontSize: 12.5, color: "#b45309" }}>
                    ! {r.risks[0]}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: scoreColor(r.fit_score),
                  }}
                >
                  {r.fit_score}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  confidence
                </div>
                {!r.eligible && (
                  <div
                    style={{ fontSize: 10.5, color: "#dc2626", marginTop: 3 }}
                  >
                    ineligible
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
