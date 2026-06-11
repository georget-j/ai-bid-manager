"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface RequirementSummary {
  id: string;
  status: string;
}

interface MatrixRow {
  id: string;
  title: string;
  status: string;
  opportunity_id: string | null;
  created_at: string;
  compliance_requirements: RequirementSummary[];
}

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  draft: { color: "#1d4ed8", bg: "#dbeafe" },
  generating: { color: "#d97706", bg: "#fef3c7" },
  approved: { color: "#059669", bg: "#d1fae5" },
};

function reqStats(reqs: RequirementSummary[]) {
  const total = reqs.length;
  const drafted = reqs.filter(
    (r) => r.status === "drafted" || r.status === "approved",
  ).length;
  const needsEvidence = reqs.filter(
    (r) => r.status === "needs-evidence",
  ).length;
  return { total, drafted, needsEvidence };
}

export default function CompliancePage() {
  const [matrices, setMatrices] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/compliance-matrix")
      .then((r) => r.json())
      .then((d: { matrices?: MatrixRow[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setMatrices(d.matrices ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load compliance matrices");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ maxWidth: 900 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Respond</div>
        <h1>
          Compliance <em>matrices</em>
        </h1>
        <p className="subtitle">
          A checklist of everything the buyer requires, and where you stand.
        </p>
      </div>

      {loading && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 32px" }}
        >
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</p>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--r-sm)",
            background: "#fee2e2",
            color: "#dc2626",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {!loading && matrices.length === 0 && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "56px 40px" }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            No compliance matrices yet.
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: 440,
              margin: "0 auto 20px",
            }}
          >
            Generate a compliance matrix from any opportunity detail page to
            track tender requirements and draft responses.
          </p>
          <Link href="/opportunities" className="btn primary">
            Browse opportunities
          </Link>
        </div>
      )}

      {!loading && matrices.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          {matrices.map((matrix, i) => {
            const style = STATUS_STYLE[matrix.status] ?? {
              color: "var(--muted)",
              bg: "var(--bg-tint)",
            };
            const stats = reqStats(matrix.compliance_requirements);
            return (
              <Link
                key={matrix.id}
                href={`/compliance/${matrix.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom:
                      i < matrices.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      "var(--bg-tint)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "";
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: 14,
                          color: "var(--ink)",
                        }}
                      >
                        {matrix.title}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "1px 8px",
                          borderRadius: 999,
                          background: style.bg,
                          color: style.color,
                          fontWeight: 500,
                        }}
                      >
                        {matrix.status}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        fontSize: 12,
                        color: "var(--muted)",
                      }}
                    >
                      <span>{stats.total} requirements</span>
                      {stats.drafted > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: "#059669" }}>
                            {stats.drafted} drafted
                          </span>
                        </>
                      )}
                      {stats.needsEvidence > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: "#dc2626" }}>
                            {stats.needsEvidence} need evidence
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        {new Date(matrix.created_at).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: "var(--muted)" }}>›</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
