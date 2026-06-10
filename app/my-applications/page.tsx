"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface GrantRef {
  id: string;
  title: string;
  funder_name: string | null;
  deadline_at: string | null;
  status: string;
}
interface Application {
  id: string;
  rfp_title: string;
  stage: string;
  submitted_at: string | null;
  question_count: number;
  answered_count: number;
  grant_id: string | null;
  updated_at: string;
  grant: GrantRef | null;
  review: { total: number; pending: number; resolved: number } | null;
}

const STAGES: Array<{ key: string; label: string }> = [
  { key: "drafting", label: "Drafting" },
  { key: "submitted", label: "Submitted" },
  { key: "awarded", label: "Awarded" },
  { key: "unsuccessful", label: "Unsuccessful" },
];

function deadlineBadge(
  iso: string | null,
): { text: string; color: string; bg: string } | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0)
    return { text: `Overdue ${-days}d`, color: "#dc2626", bg: "#fee2e2" };
  if (days === 0) return { text: "Due today", color: "#dc2626", bg: "#fee2e2" };
  if (days <= 14)
    return { text: `${days}d left`, color: "#b45309", bg: "#fef3c7" };
  return { text: `${days}d left`, color: "#059669", bg: "#ecfdf5" };
}

// Date math is kept in module-level helpers so the component render stays pure.
function computeDueSoon(apps: Application[]): Application[] {
  const now = Date.now();
  return apps.filter((a) => {
    if (!["drafting", "submitted"].includes(a.stage || "drafting"))
      return false;
    const iso = a.grant?.deadline_at;
    if (!iso) return false;
    const days = Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
    return days >= 0 && days <= 14;
  });
}

function hasUrgentDeadline(apps: Application[]): boolean {
  const now = Date.now();
  return apps.some((a) => {
    const iso = a.grant?.deadline_at;
    if (!iso) return false;
    return Math.ceil((new Date(iso).getTime() - now) / 86_400_000) <= 3;
  });
}

export default function MyApplicationsPage() {
  const [apps, setApps] = useState<Application[] | null>(null);

  useEffect(() => {
    fetch("/api/grants/applications")
      .then((r) => r.json())
      .then((d: { applications?: Application[] }) =>
        setApps(d.applications ?? []),
      )
      .catch(() => setApps([]));
  }, []);

  const dueSoon = computeDueSoon(apps ?? []);

  async function move(id: string, stage: string) {
    setApps(
      (prev) => prev?.map((a) => (a.id === id ? { ...a, stage } : a)) ?? prev,
    );
    await fetch(`/api/rfp/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    }).catch(() => {});
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Funding</div>
        <h1>
          My <em>applications</em>
        </h1>
        <p className="subtitle">
          Your grant applications in progress — track each one from drafting to
          outcome, with deadlines and answer progress.
        </p>
      </div>

      {dueSoon.length > 0 && (
        <div
          className="card card-pad"
          style={{
            marginBottom: 16,
            borderLeft: "3px solid #d97706",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>
            ⏱
          </span>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
            <strong>{dueSoon.length}</strong> application
            {dueSoon.length === 1 ? "" : "s"} due in the next 14 days
            {hasUrgentDeadline(dueSoon) && " — some within 3 days"}.
          </span>
        </div>
      )}

      {apps === null ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      ) : apps.length === 0 ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No grant applications yet. Open a grant and choose{" "}
            <strong>Draft an application</strong> to start one — it&apos;ll
            appear here.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {STAGES.map((stage) => {
            const items = apps.filter(
              (a) => (a.stage || "drafting") === stage.key,
            );
            return (
              <div
                key={stage.key}
                style={{ flex: "1 0 250px", minWidth: 250, maxWidth: 320 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                    paddingBottom: 6,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {stage.label}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {items.length}
                  </span>
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {items.map((a) => {
                    const badge =
                      stage.key === "drafting" || stage.key === "submitted"
                        ? deadlineBadge(a.grant?.deadline_at ?? null)
                        : null;
                    const pct = a.question_count
                      ? Math.round((a.answered_count / a.question_count) * 100)
                      : 0;
                    return (
                      <div
                        key={a.id}
                        className="card card-pad"
                        style={{ padding: 12 }}
                      >
                        <Link
                          href={`/rfp/drafts/${a.id}`}
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            color: "var(--ink)",
                            textDecoration: "none",
                            display: "block",
                            lineHeight: 1.3,
                          }}
                        >
                          {a.grant?.title ?? a.rfp_title}
                        </Link>
                        {a.grant?.funder_name && (
                          <p
                            style={{
                              fontSize: 11.5,
                              color: "var(--muted)",
                              margin: "3px 0 0",
                            }}
                          >
                            {a.grant.funder_name}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            margin: "8px 0",
                          }}
                        >
                          {badge && (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: badge.bg,
                                color: badge.color,
                              }}
                            >
                              {badge.text}
                            </span>
                          )}
                          {a.question_count > 0 && (
                            <span
                              style={{ fontSize: 11, color: "var(--muted)" }}
                            >
                              {a.answered_count}/{a.question_count} answered
                            </span>
                          )}
                          {a.review && a.review.pending > 0 && (
                            <Link
                              href="/review"
                              style={{
                                fontSize: 10.5,
                                fontWeight: 600,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "#ede9fe",
                                color: "#6d28d9",
                                textDecoration: "none",
                              }}
                            >
                              {a.review.pending} in review
                            </Link>
                          )}
                        </div>
                        {a.question_count > 0 && (
                          <div
                            style={{
                              height: 4,
                              borderRadius: 999,
                              background: "var(--border)",
                              overflow: "hidden",
                              marginBottom: 8,
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: "var(--accent)",
                              }}
                            />
                          </div>
                        )}
                        {a.answered_count > 0 && (
                          <a
                            href={`/api/grants/applications/${a.id}/export`}
                            style={{
                              display: "inline-block",
                              fontSize: 11.5,
                              color: "var(--accent)",
                              textDecoration: "none",
                              marginBottom: 8,
                            }}
                          >
                            ↓ Export DOCX
                          </a>
                        )}
                        <select
                          value={a.stage || "drafting"}
                          onChange={(e) => move(a.id, e.target.value)}
                          aria-label="Move to stage"
                          style={{
                            width: "100%",
                            fontSize: 11.5,
                            padding: "3px 6px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                            color: "var(--ink-2)",
                          }}
                        >
                          {STAGES.map((s) => (
                            <option key={s.key} value={s.key}>
                              Move to: {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
