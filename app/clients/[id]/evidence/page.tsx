"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface EvidenceItem {
  id: string;
  title: string;
  evidence_type: string;
  status: string;
  issuer: string | null;
  reference_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  notes: string | null;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: string;
  name: string;
}

const TYPE_LABELS: Record<string, string> = {
  certification: "Certification",
  policy: "Policy",
  case_study: "Case Study",
  financial: "Financial",
  accreditation: "Accreditation",
  reference: "Reference",
  other: "Other",
};

const TYPE_ICONS: Record<string, string> = {
  certification: "✓",
  policy: "📄",
  case_study: "📋",
  financial: "£",
  accreditation: "★",
  reference: "👤",
  other: "•",
};

const STATUS_STYLE: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  valid: { color: "#059669", bg: "#d1fae5", label: "Valid" },
  expiring_soon: { color: "#d97706", bg: "#fef3c7", label: "Expiring soon" },
  expired: { color: "#dc2626", bg: "#fee2e2", label: "Expired" },
  missing: { color: "#6b7280", bg: "#f3f4f6", label: "Missing" },
};

const EMPTY_FORM = {
  title: "",
  evidence_type: "certification",
  issuer: "",
  reference_number: "",
  issued_at: "",
  expires_at: "",
  notes: "",
};

export default function EvidenceVaultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = use(params);

  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${clientId}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/clients/${clientId}/evidence`)
        .then((r) => r.json())
        .catch(() => []),
    ]).then(([c, ev]: [Client | null, EvidenceItem[]]) => {
      setClient(c);
      setItems(ev ?? []);
      setLoading(false);
    });
  }, [clientId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        evidence_type: form.evidence_type,
        issuer: form.issuer.trim() || null,
        reference_number: form.reference_number.trim() || null,
        issued_at: form.issued_at || null,
        expires_at: form.expires_at || null,
        notes: form.notes.trim() || null,
      }),
    });
    const data = (await res.json()) as EvidenceItem & { error?: string };
    if (!res.ok) {
      setSaveError(data.error ?? "Failed to save");
    } else {
      setItems((prev) => [...prev, data]);
      setShowAdd(false);
      setForm({ ...EMPTY_FORM });
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this evidence item?")) return;
    const res = await fetch(`/api/clients/${clientId}/evidence/${id}`, {
      method: "DELETE",
    });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const filtered =
    typeFilter === "all"
      ? items
      : items.filter((i) => i.evidence_type === typeFilter);

  const countByStatus = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={{ padding: "24px 28px" }}>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900 }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          gap: 6,
          fontSize: 12.5,
          color: "var(--muted)",
          marginBottom: 16,
        }}
      >
        <Link
          href="/clients"
          style={{ color: "var(--muted)", textDecoration: "none" }}
        >
          Clients
        </Link>
        <span>›</span>
        <Link
          href={`/clients/${clientId}`}
          style={{ color: "var(--muted)", textDecoration: "none" }}
        >
          {client?.name ?? "Client"}
        </Link>
        <span>›</span>
        <span style={{ color: "var(--ink)" }}>Evidence vault</span>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {client?.name}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Evidence vault
          </h1>
        </div>
        <button
          className="btn primary"
          onClick={() => setShowAdd(true)}
          style={{ fontSize: 13, padding: "6px 14px" }}
        >
          + Add evidence
        </button>
      </div>

      {/* Status summary */}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          {(["valid", "expiring_soon", "expired", "missing"] as const).map(
            (s) => {
              const count = countByStatus[s];
              if (!count) return null;
              const st = STATUS_STYLE[s];
              return (
                <div
                  key={s}
                  style={{
                    fontSize: 12,
                    padding: "4px 12px",
                    borderRadius: 99,
                    background: st.bg,
                    color: st.color,
                    fontWeight: 600,
                  }}
                >
                  {count} {st.label}
                </div>
              );
            },
          )}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 12, color: "var(--accent)" }}
          >
            Add evidence item
          </div>
          <form onSubmit={handleAdd}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Title *
                </label>
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="e.g. ISO 27001 Certificate"
                  required
                  autoFocus
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
                  Type *
                </label>
                <select
                  className="input"
                  value={form.evidence_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, evidence_type: e.target.value }))
                  }
                  style={{ width: "100%" }}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
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
                  Issuer
                </label>
                <input
                  className="input"
                  value={form.issuer}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, issuer: e.target.value }))
                  }
                  placeholder="e.g. IASME, BSI"
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
                  Reference / cert number
                </label>
                <input
                  className="input"
                  value={form.reference_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reference_number: e.target.value }))
                  }
                  placeholder="e.g. IASME-2024-12345"
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
                  Issue date
                </label>
                <input
                  className="input"
                  type="date"
                  value={form.issued_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, issued_at: e.target.value }))
                  }
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
                  Expiry date
                </label>
                <input
                  className="input"
                  type="date"
                  value={form.expires_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expires_at: e.target.value }))
                  }
                  style={{ width: "100%" }}
                />
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
                  rows={2}
                  placeholder="Additional context…"
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
                disabled={saving || !form.title.trim()}
                style={{ fontSize: 13 }}
              >
                {saving ? "Saving…" : "Add item"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setSaveError(null);
                }}
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Type filter */}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {["all", ...Object.keys(TYPE_LABELS)].map((t) => {
            const count =
              t === "all"
                ? items.length
                : items.filter((i) => i.evidence_type === t).length;
            if (t !== "all" && count === 0) return null;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 99,
                  border: "1px solid",
                  borderColor:
                    typeFilter === t ? "var(--accent)" : "var(--border)",
                  background:
                    typeFilter === t ? "var(--accent)" : "var(--surface-2)",
                  color: typeFilter === t ? "#fff" : "var(--ink)",
                  cursor: "pointer",
                  fontWeight: typeFilter === t ? 600 : 400,
                }}
              >
                {t === "all" ? "All" : TYPE_LABELS[t]} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Evidence list */}
      {loading ? null : filtered.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 24px" }}
        >
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
            {items.length === 0
              ? "No evidence items yet. Add certifications, policies, and case studies to build the evidence vault."
              : "No items match this filter."}
          </p>
          {items.length === 0 && (
            <button
              className="btn primary"
              onClick={() => setShowAdd(true)}
              style={{ fontSize: 13 }}
            >
              Add first item
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((item) => {
            const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.valid;
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="card"
                style={{ padding: "14px 18px" }}
              >
                <div
                  style={{ display: "flex", alignItems: "flex-start", gap: 12 }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "var(--r-sm)",
                      background: "var(--accent-tint)",
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {TYPE_ICONS[item.evidence_type] ?? "•"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--ink)",
                        }}
                      >
                        {item.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          padding: "1px 7px",
                          borderRadius: 99,
                          background: st.bg,
                          color: st.color,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {st.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "1px 7px",
                          borderRadius: 99,
                          background: "var(--bg-tint)",
                          color: "var(--muted)",
                        }}
                      >
                        {TYPE_LABELS[item.evidence_type] ?? item.evidence_type}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        fontSize: 12,
                        color: "var(--muted)",
                      }}
                    >
                      {item.issuer && <span>{item.issuer}</span>}
                      {item.reference_number && (
                        <span>{item.reference_number}</span>
                      )}
                      {item.expires_at && (
                        <span>
                          Expires{" "}
                          {new Date(item.expires_at).toLocaleDateString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </span>
                      )}
                    </div>
                    {item.notes && !isEditing && (
                      <p
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          margin: "4px 0 0",
                          lineHeight: 1.5,
                        }}
                      >
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn ghost"
                      onClick={() => setEditingId(isEditing ? null : item.id)}
                      style={{ fontSize: 11.5, padding: "3px 8px" }}
                    >
                      {isEditing ? "Close" : "Edit"}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => handleDelete(item.id)}
                      style={{
                        fontSize: 11.5,
                        padding: "3px 8px",
                        color: "#dc2626",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Inline edit */}
                {isEditing && (
                  <EvidenceEditForm
                    item={item}
                    clientId={clientId}
                    onSaved={(updated) => {
                      setItems((prev) =>
                        prev.map((i) => (i.id === updated.id ? updated : i)),
                      );
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EvidenceEditForm({
  item,
  clientId,
  onSaved,
  onCancel,
}: {
  item: EvidenceItem;
  clientId: string;
  onSaved: (updated: EvidenceItem) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: item.title,
    evidence_type: item.evidence_type,
    issuer: item.issuer ?? "",
    reference_number: item.reference_number ?? "",
    issued_at: item.issued_at ?? "",
    expires_at: item.expires_at ?? "",
    notes: item.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/evidence/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        evidence_type: form.evidence_type,
        issuer: form.issuer.trim() || null,
        reference_number: form.reference_number.trim() || null,
        issued_at: form.issued_at || null,
        expires_at: form.expires_at || null,
        notes: form.notes.trim() || null,
      }),
    });
    const data = (await res.json()) as EvidenceItem & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Save failed");
    } else {
      onSaved(data);
    }
    setSaving(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <select
            className="input"
            value={form.evidence_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, evidence_type: e.target.value }))
            }
            style={{ width: "100%" }}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <input
            className="input"
            value={form.issuer}
            onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
            placeholder="Issuer"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <input
            className="input"
            value={form.reference_number}
            onChange={(e) =>
              setForm((f) => ({ ...f, reference_number: e.target.value }))
            }
            placeholder="Reference number"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <input
            className="input"
            type="date"
            value={form.issued_at}
            onChange={(e) =>
              setForm((f) => ({ ...f, issued_at: e.target.value }))
            }
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <input
            className="input"
            type="date"
            value={form.expires_at}
            onChange={(e) =>
              setForm((f) => ({ ...f, expires_at: e.target.value }))
            }
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <textarea
            className="input"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>
      </div>
      {error && (
        <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn primary"
          type="submit"
          disabled={saving}
          style={{ fontSize: 12 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          className="btn ghost"
          type="button"
          onClick={onCancel}
          style={{ fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
