"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface Requirement {
  id: string;
  requirement_text: string;
  section_reference: string | null;
  mandatory: boolean;
  evidence_needed: string | null;
  response_owner: string | null;
  draft_answer: string | null;
  confidence: number | null;
  status: string;
}

interface Matrix {
  id: string;
  title: string;
  status: string;
  opportunity_id: string | null;
  created_at: string;
  compliance_requirements: Requirement[];
}

const STATUS_STYLES: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  "not-started": { label: "Not started", color: "#6b7280", bg: "#f3f4f6" },
  drafted: { label: "Drafted", color: "#1d4ed8", bg: "#dbeafe" },
  "needs-evidence": {
    label: "Needs evidence",
    color: "#dc2626",
    bg: "#fee2e2",
  },
  "needs-review": { label: "Needs review", color: "#7c3aed", bg: "#ede9fe" },
  approved: { label: "Approved", color: "#059669", bg: "#d1fae5" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fee2e2" },
};

export default function ComplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    fetch(`/api/compliance-matrix/${id}`)
      .then((r) => r.json())
      .then((d: { matrix?: Matrix; error?: string }) => {
        if (d.error) setError(d.error);
        else setMatrix(d.matrix ?? null);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load matrix");
        setLoading(false);
      });
  }, [id]);

  async function updateStatus(reqId: string, status: string) {
    const res = await fetch(`/api/compliance-requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setMatrix((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          compliance_requirements: prev.compliance_requirements.map((r) =>
            r.id === reqId ? { ...r, status } : r,
          ),
        };
      });
    }
  }

  async function saveAnswer(reqId: string) {
    setSaving(true);
    const res = await fetch(`/api/compliance-requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_answer: editValue, status: "drafted" }),
    });
    if (res.ok) {
      setMatrix((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          compliance_requirements: prev.compliance_requirements.map((r) =>
            r.id === reqId
              ? { ...r, draft_answer: editValue, status: "drafted" }
              : r,
          ),
        };
      });
      setEditing(null);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, paddingTop: 48, textAlign: "center" }}>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading matrix…</p>
      </div>
    );
  }

  if (error || !matrix) {
    return (
      <div style={{ maxWidth: 900 }}>
        <Link
          href="/compliance"
          style={{
            fontSize: 13,
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          ← Back to matrices
        </Link>
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            borderRadius: "var(--r-sm)",
            background: "#fee2e2",
            color: "#dc2626",
            fontSize: 13,
          }}
        >
          {error ?? "Matrix not found"}
        </div>
      </div>
    );
  }

  const reqs = matrix.compliance_requirements;
  const statCounts = reqs.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = reqs
    .filter((r) => statusFilter === "all" || r.status === statusFilter)
    .filter((r) => !mandatoryOnly || r.mandatory);

  function copyAsMarkdown() {
    const rows = filtered.map((r) => {
      const status = STATUS_STYLES[r.status]?.label ?? r.status;
      const section = r.section_reference ? `§${r.section_reference}` : "";
      const mandatory = r.mandatory ? "M" : "";
      const answer = r.draft_answer
        ? r.draft_answer.slice(0, 120) +
          (r.draft_answer.length > 120 ? "…" : "")
        : "(no draft)";
      return `| ${section} | ${mandatory} | ${r.requirement_text} | ${status} | ${answer} |`;
    });
    const header =
      "| Section | M | Requirement | Status | Draft answer |\n|---------|---|-------------|--------|--------------|";
    const text = `# ${matrix?.title ?? "Matrix"}\n\n${header}\n${rows.join("\n")}`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Link
        href="/compliance"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "none",
          marginBottom: 20,
        }}
      >
        ← Back to matrices
      </Link>

      {/* Header */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Compliance matrix
        </div>
        <h1
          style={{
            fontSize: 22,
            fontFamily: "var(--font-serif)",
            lineHeight: 1.25,
            marginBottom: 12,
          }}
        >
          {matrix.title}
        </h1>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {Object.entries(statCounts).map(([status, count]) => {
            const s = STATUS_STYLES[status] ?? STATUS_STYLES["not-started"];
            return (
              <span
                key={status}
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: s.bg,
                  color: s.color,
                }}
              >
                {count} {s.label.toLowerCase()}
              </span>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {matrix.opportunity_id && (
            <Link
              href={`/opportunities/${matrix.opportunity_id}`}
              className="btn ghost"
              style={{ fontSize: 12 }}
            >
              View opportunity
            </Link>
          )}
          <button
            className="btn ghost"
            onClick={copyAsMarkdown}
            style={{ fontSize: 12 }}
          >
            {copyDone ? "✓ Copied!" : "Copy as Markdown"}
          </button>
        </div>
      </div>

      {/* Requirements table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="eyebrow">
            Requirements ({filtered.length}
            {filtered.length !== reqs.length ? ` of ${reqs.length}` : ""})
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={mandatoryOnly}
                onChange={(e) => setMandatoryOnly(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              Mandatory only
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                fontSize: 12,
                padding: "3px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-2)",
                color: "var(--ink)",
              }}
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_STYLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 && (
          <p
            style={{
              padding: "24px 20px",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            No requirements match this filter.
          </p>
        )}

        {filtered.map((req, i) => {
          const s = STATUS_STYLES[req.status] ?? STATUS_STYLES["not-started"];
          const isExpanded = expandedId === req.id;
          const isEditing = editing === req.id;

          return (
            <div
              key={req.id}
              style={{
                borderBottom:
                  i < filtered.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              {/* Row header */}
              <div
                style={{
                  padding: "14px 20px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  cursor: "pointer",
                }}
                onClick={() => setExpandedId(isExpanded ? null : req.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: "wrap",
                    }}
                  >
                    {req.mandatory && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#dc2626",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        M
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 13.5,
                        color: "var(--ink)",
                        lineHeight: 1.4,
                      }}
                    >
                      {req.requirement_text}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: 12,
                      color: "var(--muted)",
                    }}
                  >
                    {req.section_reference && (
                      <span>§ {req.section_reference}</span>
                    )}
                    {req.confidence != null && (
                      <>
                        <span>·</span>
                        <span>Confidence {req.confidence}%</span>
                      </>
                    )}
                    {req.response_owner && (
                      <>
                        <span>·</span>
                        <span>{req.response_owner}</span>
                      </>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <select
                    className="input"
                    value={req.status}
                    onChange={(e) => updateStatus(req.id, e.target.value)}
                    style={{ fontSize: 11, padding: "3px 6px" }}
                  >
                    {Object.entries(STATUS_STYLES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: s.bg,
                      color: s.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: "var(--muted)",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  >
                    ›
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div
                  style={{
                    padding: "0 20px 16px",
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-tint)",
                  }}
                >
                  {req.evidence_needed && (
                    <div style={{ marginTop: 12, marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                          color: "#d97706",
                          marginBottom: 4,
                        }}
                      >
                        Evidence needed
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--ink-2)",
                          lineHeight: 1.5,
                        }}
                      >
                        {req.evidence_needed}
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--muted)",
                        marginBottom: 6,
                      }}
                    >
                      Draft answer
                    </div>

                    {isEditing ? (
                      <div>
                        <textarea
                          className="input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={6}
                          style={{ width: "100%", resize: "vertical" }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button
                            className="btn primary"
                            onClick={() => saveAnswer(req.id)}
                            disabled={saving}
                            style={{ fontSize: 12 }}
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            className="btn ghost"
                            onClick={() => setEditing(null)}
                            style={{ fontSize: 12 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {req.draft_answer ? (
                          <p
                            style={{
                              fontSize: 13,
                              color: "var(--ink-2)",
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                              marginBottom: 8,
                            }}
                          >
                            {req.draft_answer}
                          </p>
                        ) : (
                          <p
                            style={{
                              fontSize: 13,
                              color: "var(--muted)",
                              fontStyle: "italic",
                              marginBottom: 8,
                            }}
                          >
                            No draft answer yet.
                          </p>
                        )}
                        <button
                          className="btn ghost"
                          onClick={() => {
                            setEditing(req.id);
                            setEditValue(req.draft_answer ?? "");
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {req.draft_answer ? "Edit answer" : "Add answer"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
