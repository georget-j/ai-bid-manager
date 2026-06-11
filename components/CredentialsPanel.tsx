"use client";

import { useEffect, useState } from "react";

/**
 * "Your credentials" — the organisation's own certifications, insurance,
 * memberships and policies, kept with expiry dates so nothing lapses unnoticed.
 *
 * Backed by /api/evidence (org-scoped evidence_items rows with client_id null).
 * The database sets each item's status from its expiry date — this component
 * only displays it.
 */

export interface CredentialItem {
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

// ── pure helpers (exported for tests) ──────────────────────────────────────────

/** Display order — kept in sync with the evidence_items CHECK (migration 070). */
export const CREDENTIAL_TYPES = [
  "certification",
  "accreditation",
  "insurance",
  "membership",
  "policy",
  "case_study",
  "financial",
  "reference",
  "other",
] as const;

/** Singular labels for the add/edit form — raw enum values never reach users. */
export const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  certification: "Certification",
  accreditation: "Accreditation or framework",
  insurance: "Insurance",
  membership: "Membership",
  policy: "Policy",
  case_study: "Case study",
  financial: "Financial record",
  reference: "Client reference",
  other: "Other",
};

/** Plural group headings for the list. */
const CREDENTIAL_GROUP_LABELS: Record<string, string> = {
  certification: "Certifications",
  accreditation: "Accreditations & frameworks",
  insurance: "Insurance",
  membership: "Memberships",
  policy: "Policies",
  case_study: "Case studies",
  financial: "Financial records",
  reference: "Client references",
  other: "Other",
};

/** Plain-English label for a credential type — falls back so enums never leak. */
export function credentialTypeLabel(type: string): string {
  return CREDENTIAL_TYPE_LABELS[type] ?? "Other";
}

/** Plural heading for a credential type group. */
export function credentialGroupLabel(type: string): string {
  return CREDENTIAL_GROUP_LABELS[type] ?? "Other";
}

export interface StatusChip {
  label: string;
  color: string;
  bg: string;
}

/** Chip styles per DB status — the trigger keeps status in step with expiry. */
export const STATUS_CHIPS: Record<string, StatusChip> = {
  valid: { label: "Valid", color: "#059669", bg: "#d1fae5" },
  expiring_soon: { label: "Expiring soon", color: "#d97706", bg: "#fef3c7" },
  expired: { label: "Expired", color: "#dc2626", bg: "#fee2e2" },
  missing: { label: "Missing", color: "#6b7280", bg: "#f3f4f6" },
};

/** Chip for a status value, defaulting to Valid so unknown values never crash. */
export function statusChip(status: string): StatusChip {
  return STATUS_CHIPS[status] ?? STATUS_CHIPS.valid;
}

/** Whole days from `from` (default today) until a YYYY-MM-DD date; negative if past. */
export function daysUntil(dateStr: string, from: Date = new Date()): number {
  const target = Date.parse(`${dateStr}T00:00:00Z`);
  const start = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  return Math.round((target - start) / 86_400_000);
}

/** Items expiring within the next 60 days — today included, already-expired excluded. */
export function expiringWithin60Days<T extends { expires_at: string | null }>(
  items: T[],
  from: Date = new Date(),
): T[] {
  return items.filter((item) => {
    if (!item.expires_at) return false;
    const days = daysUntil(item.expires_at, from);
    return days >= 0 && days <= 60;
  });
}

// ── component ──────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: "",
  evidence_type: "certification",
  issuer: "",
  reference_number: "",
  issued_at: "",
  expires_at: "",
  notes: "",
};

type FormState = typeof EMPTY_FORM;

function formPayload(form: FormState) {
  return {
    title: form.title.trim(),
    evidence_type: form.evidence_type,
    issuer: form.issuer.trim() || null,
    reference_number: form.reference_number.trim() || null,
    issued_at: form.issued_at || null,
    expires_at: form.expires_at || null,
    notes: form.notes.trim() || null,
  };
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CredentialsPanel() {
  const [items, setItems] = useState<CredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  useEffect(() => {
    fetch("/api/evidence")
      .then(async (r) => {
        const data = (await r.json()) as CredentialItem[] | { error?: string };
        if (!r.ok || !Array.isArray(data)) {
          throw new Error("load failed");
        }
        setItems(data);
      })
      .catch(() =>
        setLoadError("Couldn't load your credentials. Refresh to try again."),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(form)),
      });
      const data = (await res.json()) as CredentialItem & { error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save — please try again.");
      } else {
        setItems((prev) => [...prev, data]);
        setShowAdd(false);
        setForm({ ...EMPTY_FORM });
      }
    } catch {
      setSaveError("Couldn't save — please try again.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        "Remove this credential? Any document you uploaded stays in your library.",
      )
    )
      return;
    const res = await fetch(`/api/evidence/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const expiring = expiringWithin60Days(items);

  const grouped = CREDENTIAL_TYPES.map((type) => ({
    type: type as string,
    items: items.filter((i) => i.evidence_type === type),
  })).filter((g) => g.items.length > 0);
  // Anything with a type we don't recognise still gets shown, under "Other".
  const known = new Set<string>(CREDENTIAL_TYPES);
  const unknownItems = items.filter((i) => !known.has(i.evidence_type));
  if (unknownItems.length > 0) {
    const other = grouped.find((g) => g.type === "other");
    if (other) other.items = [...other.items, ...unknownItems];
    else grouped.push({ type: "other", items: unknownItems });
  }

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "var(--muted)" }}>
        Loading your credentials…
      </p>
    );
  }

  if (loadError) {
    return <p style={{ fontSize: 13, color: "#dc2626" }}>{loadError}</p>;
  }

  return (
    <div>
      {/* Expiry warning strip */}
      {expiring.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 14px",
            border: "1px solid #fcd34d",
            borderRadius: "var(--r-sm)",
            background: "#fffbeb",
            marginBottom: 16,
            fontSize: 13,
            color: "#92400e",
          }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>
            ⏳
          </span>
          <span>
            <strong>
              {expiring.length === 1
                ? "1 credential expires"
                : `${expiring.length} credentials expire`}{" "}
              within 60 days
            </strong>{" "}
            — {expiring.map((i) => i.title).join(", ")}. Renew before they lapse
            so your bids stay compliant.
          </span>
        </div>
      )}

      {/* Intro + add button */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-2)",
            margin: 0,
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          The certifications, insurance, memberships and policies your business
          holds. Buyers and funders ask for these on almost every bid — keep
          expiry dates here and we&apos;ll warn you before anything lapses.
        </p>
        {!showAdd && (
          <button
            className="btn primary"
            onClick={() => setShowAdd(true)}
            style={{ fontSize: 13, padding: "6px 14px", flexShrink: 0 }}
          >
            + Add credential
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 12, color: "var(--accent)" }}
          >
            Add a credential
          </div>
          <form onSubmit={handleAdd}>
            <CredentialFields form={form} setForm={setForm} autoFocus />
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
                {saving ? "Saving…" : "Add credential"}
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

      {/* Empty state */}
      {items.length === 0 && !showAdd && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "36px 24px" }}
        >
          <p
            style={{
              fontSize: 13.5,
              color: "var(--muted)",
              margin: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            Nothing here yet. Start with what you already hold — Cyber
            Essentials, ISO certificates, professional indemnity insurance,
            trade memberships.
          </p>
          <button
            className="btn primary"
            onClick={() => setShowAdd(true)}
            style={{ fontSize: 13 }}
          >
            Add your first credential
          </button>
        </div>
      )}

      {/* Grouped list */}
      {grouped.map((group) => (
        <div key={group.type} style={{ marginBottom: 20 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 8, color: "var(--muted)" }}
          >
            {credentialGroupLabel(group.type)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.items.map((item) => {
              const chip = statusChip(item.status);
              const isEditing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  className="card"
                  style={{ padding: "12px 16px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
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
                        {item.expires_at && (
                          <span
                            style={{
                              fontSize: 10.5,
                              padding: "1px 7px",
                              borderRadius: 99,
                              background: chip.bg,
                              color: chip.color,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {chip.label}
                          </span>
                        )}
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
                          <span>Expires {formatDate(item.expires_at)}</span>
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
                        Remove
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <CredentialEditForm
                      item={item}
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
        </div>
      ))}
    </div>
  );
}

// ── form fields shared by add + edit ───────────────────────────────────────────

function CredentialFields({
  form,
  setForm,
  autoFocus = false,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  autoFocus?: boolean;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: 11.5,
    color: "var(--muted)",
    display: "block",
    marginBottom: 4,
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={labelStyle}>Name *</label>
        <input
          className="input"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Cyber Essentials Plus"
          required
          autoFocus={autoFocus}
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label style={labelStyle}>Type *</label>
        <select
          className="input"
          value={form.evidence_type}
          onChange={(e) =>
            setForm((f) => ({ ...f, evidence_type: e.target.value }))
          }
          style={{ width: "100%" }}
        >
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {credentialTypeLabel(t)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Who issued it</label>
        <input
          className="input"
          value={form.issuer}
          onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
          placeholder="e.g. IASME, BSI, your insurer"
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label style={labelStyle}>Certificate or policy number</label>
        <input
          className="input"
          value={form.reference_number}
          onChange={(e) =>
            setForm((f) => ({ ...f, reference_number: e.target.value }))
          }
          placeholder="e.g. IASME-CE-12345"
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label style={labelStyle}>Valid from</label>
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
        <label style={labelStyle}>Expires</label>
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
        <label style={labelStyle}>Notes</label>
        <textarea
          className="input"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          placeholder="Anything worth remembering — scope, level, renewal contact…"
          style={{ width: "100%", resize: "vertical" }}
        />
      </div>
    </div>
  );
}

function CredentialEditForm({
  item,
  onSaved,
  onCancel,
}: {
  item: CredentialItem;
  onSaved: (updated: CredentialItem) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
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
    try {
      const res = await fetch(`/api/evidence/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(form)),
      });
      const data = (await res.json()) as CredentialItem & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save — please try again.");
      } else {
        onSaved(data);
      }
    } catch {
      setError("Couldn't save — please try again.");
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
      <CredentialFields form={form} setForm={setForm} />
      {error && (
        <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn primary"
          type="submit"
          disabled={saving || !form.title.trim()}
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
