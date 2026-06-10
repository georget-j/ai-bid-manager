"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Funder {
  funder_name: string;
  funder_region: string | null;
  grant_count: number;
  total_amount: number;
  last_seen: string | null;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n.toLocaleString()}`;
}

export default function FundersPage() {
  const [funders, setFunders] = useState<Funder[] | null>(null);

  useEffect(() => {
    fetch("/api/funders")
      .then((r) => r.json())
      .then((d: { funders?: Funder[] }) => setFunders(d.funders ?? []))
      .catch(() => setFunders([]));
  }, []);

  return (
    <div style={{ maxWidth: 820 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Funding</div>
        <h1>
          <em>Funders</em>
        </h1>
        <p className="subtitle">
          Grant-makers aggregated from the catalogue — what they fund and how
          much, to inform your applications.
        </p>
      </div>

      {funders === null ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      ) : funders.length === 0 ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No funders yet — sync a grant source from{" "}
            <Link href="/grant-sources" style={{ color: "var(--accent)" }}>
              Grant Sources
            </Link>
            .
          </p>
        </div>
      ) : (
        funders.map((f) => (
          <Link
            key={f.funder_name}
            href={`/grants?funder=${encodeURIComponent(f.funder_name)}`}
            className="card card-pad"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
              textDecoration: "none",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                {f.funder_name}
              </p>
              {f.funder_region && (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  {f.funder_region}
                </p>
              )}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600 }}>
                {f.grant_count.toLocaleString()} grants
              </p>
              {f.total_amount > 0 && (
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  {fmt(f.total_amount)} total
                </p>
              )}
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
