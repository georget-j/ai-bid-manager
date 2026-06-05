"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Client {
  id: string;
  name: string;
  vertical: string | null;
  status: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ReadinessResult {
  supported: boolean;
  vertical: string;
  score?: number;
  covered?: number;
  expiring_soon?: number;
  expired?: number;
  missing?: number;
  total_items?: number;
  results?: Array<{
    item: { id: string; title: string; description: string; weight: number };
    coverage: "covered" | "expiring_soon" | "expired" | "missing";
    matched_evidence_title: string | null;
  }>;
  message?: string;
}

const VERTICAL_LABELS: Record<string, string> = {
  it_cyber: "IT / Cyber",
  facilities: "Facilities",
  construction: "Construction",
  healthcare: "Healthcare",
  education: "Education",
  professional_services: "Professional Services",
  other: "Other",
};

const VERTICALS = Object.keys(VERTICAL_LABELS);

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    vertical: "",
    website: "",
    notes: "",
    status: "active",
  });
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then((data: Client) => {
        setClient(data);
        setForm({
          name: data.name,
          vertical: data.vertical ?? "",
          website: data.website ?? "",
          notes: data.notes ?? "",
          status: data.status,
        });
        // Load readiness score in parallel
        fetch(`/api/clients/${id}/readiness`)
          .then((r) => r.json())
          .then((rd: ReadinessResult) => setReadiness(rd))
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        vertical: form.vertical || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
      }),
    });
    const data = (await res.json()) as Client & { error?: string };
    if (!res.ok) {
      setSaveError(data.error ?? "Save failed");
    } else {
      setClient(data);
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleArchive() {
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/clients");
  }

  if (loading) {
    return (
      <div style={{ padding: "24px 28px" }}>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div style={{ padding: "24px 28px" }}>
        <p style={{ fontSize: 13, color: "#dc2626" }}>Client not found.</p>
        <Link href="/clients" style={{ fontSize: 13, color: "var(--accent)" }}>
          ← Back to clients
        </Link>
      </div>
    );
  }

  const verticalLabel = client.vertical
    ? (VERTICAL_LABELS[client.vertical] ?? client.vertical)
    : null;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 860 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/clients"
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          ← Clients
        </Link>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 24,
              fontWeight: 600,
              margin: "0 0 4px",
              color: "var(--ink)",
            }}
          >
            {client.name}
          </h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {verticalLabel && (
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: "var(--accent-tint)",
                  color: "var(--accent)",
                  fontWeight: 600,
                }}
              >
                {verticalLabel}
              </span>
            )}
            {client.status !== "active" && (
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: "#f3f4f6",
                  color: "#6b7280",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {client.status}
              </span>
            )}
            {client.website && (
              <a
                href={client.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "var(--muted)" }}
              >
                {client.website.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            className="btn ghost"
            onClick={() => setEditing((e) => !e)}
            style={{ fontSize: 12 }}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          {!archiveConfirm ? (
            <button
              className="btn ghost"
              onClick={() => setArchiveConfirm(true)}
              style={{ fontSize: 12, color: "#b45309" }}
            >
              Archive
            </button>
          ) : (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Archive this client?
              </span>
              <button
                className="btn ghost"
                onClick={handleArchive}
                style={{ fontSize: 12, color: "#dc2626" }}
              >
                Confirm
              </button>
              <button
                className="btn ghost"
                onClick={() => setArchiveConfirm(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Edit client
          </div>
          <form onSubmit={handleSave}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Name *
                </label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Vertical
                </label>
                <select
                  className="input"
                  value={form.vertical}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vertical: e.target.value }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="">None</option>
                  {VERTICALS.map((k) => (
                    <option key={k} value={k}>
                      {VERTICAL_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Website
                </label>
                <input
                  className="input"
                  value={form.website}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, website: e.target.value }))
                  }
                  type="url"
                  placeholder="https://"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Status
                </label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Notes
                </label>
                <textarea
                  className="input"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  placeholder="Internal notes about this client…"
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
            </div>
            {saveError && (
              <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>
                {saveError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                type="submit"
                disabled={saving || !form.name.trim()}
                style={{ fontSize: 13 }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setEditing(false)}
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notes (read view) */}
      {!editing && client.notes && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Notes
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--ink)",
              lineHeight: 1.6,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {client.notes}
          </p>
        </div>
      )}

      {/* Phase 4+ sections */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Evidence vault — live */}
        <Link
          href={`/clients/${client.id}/evidence`}
          style={{ textDecoration: "none" }}
        >
          <div
            className="card card-pad"
            style={{ cursor: "pointer", transition: "box-shadow 0.15s" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 2px 8px rgba(0,0,0,0.08)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")
            }
          >
            <div
              className="eyebrow"
              style={{ marginBottom: 6, color: "var(--accent)" }}
            >
              Evidence vault →
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink)", margin: 0 }}>
              Certifications, policies, case studies, and insurance. Track
              expiry and flag gaps before they block a bid.
            </p>
          </div>
        </Link>

        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Opportunities
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            Save opportunities to pipeline with this client selected to filter
            your pipeline view by client.
          </p>
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Knowledge base
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
            Upload documents and select this client to scope them. Scoped RAG
            retrieval per client comes in Phase 5.
          </p>
        </div>
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Readiness score
          </div>
          {!readiness ? (
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
              Loading…
            </p>
          ) : !readiness.supported ? (
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
              {readiness.message ??
                "Select a supported vertical to see a readiness score."}
            </p>
          ) : (
            <ReadinessWidget readiness={readiness} clientId={client.id} />
          )}
        </div>
      </div>

      {/* Meta */}
      <p
        style={{
          fontSize: 11.5,
          color: "var(--muted)",
          marginTop: 20,
        }}
      >
        Created{" "}
        {new Date(client.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        {client.updated_at !== client.created_at && (
          <>
            {" · Updated "}
            {new Date(client.updated_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </>
        )}
      </p>
    </div>
  );
}

// ── Readiness widget ──────────────────────────────────────────────────────────

const COVERAGE_STYLE = {
  covered: { color: "#059669", label: "✓" },
  expiring_soon: { color: "#d97706", label: "⚠" },
  expired: { color: "#dc2626", label: "✕" },
  missing: { color: "#9ca3af", label: "–" },
} as const;

function ReadinessWidget({
  readiness,
  clientId,
}: {
  readiness: ReadinessResult;
  clientId: string;
}) {
  const score = readiness.score ?? 0;
  const scoreColor =
    score >= 75 ? "#059669" : score >= 50 ? "#d97706" : "#dc2626";

  return (
    <div>
      {/* Score gauge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div
          style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke="var(--border)"
              strokeWidth="5"
            />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke={scoreColor}
              strokeWidth="5"
              strokeDasharray={`${(score / 100) * 138.2} 138.2`}
              strokeLinecap="round"
              transform="rotate(-90 28 28)"
            />
          </svg>
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: scoreColor,
            }}
          >
            {score}
          </span>
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              marginBottom: 2,
            }}
          >
            {score >= 75
              ? "Ready to bid"
              : score >= 50
                ? "Partially ready"
                : "Evidence gaps found"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {readiness.covered ?? 0} covered · {readiness.expiring_soon ?? 0}{" "}
            expiring · {readiness.missing ?? 0} missing
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          borderRadius: 99,
          background: "var(--border)",
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: scoreColor,
            borderRadius: 99,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {(readiness.results ?? []).map((r) => {
          const st = COVERAGE_STYLE[r.coverage];
          return (
            <div
              key={r.item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  color: st.color,
                  fontWeight: 700,
                  width: 14,
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {st.label}
              </span>
              <span
                style={{
                  color:
                    r.coverage === "missing" ? "var(--muted)" : "var(--ink)",
                  flex: 1,
                }}
              >
                {r.item.title}
                {r.matched_evidence_title && r.coverage !== "covered" && (
                  <span style={{ color: "#d97706", fontSize: 11 }}>
                    {" "}
                    — {r.matched_evidence_title}
                  </span>
                )}
              </span>
              {r.item.weight === 3 && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    flexShrink: 0,
                  }}
                >
                  required
                </span>
              )}
            </div>
          );
        })}
      </div>

      {(readiness.missing ?? 0) > 0 && (
        <Link
          href={`/clients/${clientId}/evidence`}
          style={{
            display: "inline-block",
            marginTop: 12,
            fontSize: 12,
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          Add missing evidence →
        </Link>
      )}
    </div>
  );
}
