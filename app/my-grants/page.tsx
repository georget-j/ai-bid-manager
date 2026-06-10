"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { matchColor } from "@/lib/grants/copy";

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

function deadlineBadge(
  iso: string | null,
): { label: string; color: string } | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return { label: "Due today", color: "#dc2626" };
  if (days <= 14) return { label: `${days} days left`, color: "#b45309" };
  return { label: `${days} days left`, color: "#059669" };
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
          Open grant calls matched to your organisation — whether you&apos;re
          eligible, and how well each one fits.
        </p>
        <Link
          href="/grants"
          style={{
            fontSize: 13,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Browse all grants →
        </Link>
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
            No open grant calls match your profile right now. Try broadening
            your themes, sectors or regions in your{" "}
            <Link
              href="/profile#grant-eligibility"
              style={{ color: "var(--accent)" }}
            >
              profile
            </Link>
            , or{" "}
            <Link href="/grants" style={{ color: "var(--accent)" }}>
              browse all grants
            </Link>
            .
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
                {r.reasons.slice(0, 2).map((reason, i) => (
                  <p
                    key={i}
                    style={{
                      fontSize: 12.5,
                      color: "#059669",
                      margin: "1px 0",
                    }}
                  >
                    ✓ {reason}
                  </p>
                ))}
                {r.risks[0] && (
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "#b45309",
                      margin: "1px 0",
                    }}
                  >
                    ! {r.risks[0]}
                  </p>
                )}
                {deadlineBadge(r.deadline_at) && (
                  <p
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      marginTop: 4,
                      color: deadlineBadge(r.deadline_at)!.color,
                    }}
                  >
                    {deadlineBadge(r.deadline_at)!.label}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: matchColor(r.fit_score, r.eligible),
                  }}
                >
                  {r.fit_score}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  / 100 match
                </div>
                {!r.eligible && (
                  <div
                    style={{ fontSize: 10.5, color: "#dc2626", marginTop: 3 }}
                  >
                    Not eligible
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
