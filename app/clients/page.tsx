"use client";

import { useState, useEffect } from "react";
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

const VERTICAL_LABELS: Record<string, string> = {
  it_cyber: "IT / Cyber",
  facilities: "Facilities",
  construction: "Construction",
  healthcare: "Healthcare",
  education: "Education",
  professional_services: "Professional Services",
  other: "Other",
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  active: { color: "#059669", bg: "#d1fae5" },
  inactive: { color: "#6b7280", bg: "#f3f4f6" },
  archived: { color: "#9ca3af", bg: "#f9fafb" },
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    vertical: "" as string,
    website: "",
    notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/clients?status=${statusFilter}`);
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        vertical: form.vertical || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
      }),
    });
    const data = (await res.json()) as Client & { error?: string };
    if (!res.ok) {
      setFormError(data.error ?? "Failed to create client");
    } else {
      setClients((c) => [data, ...c]);
      setShowCreate(false);
      setForm({ name: "", vertical: "", website: "", notes: "" });
    }
    setCreating(false);
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            Agency workspace
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
            Clients
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "active" | "all")
            }
            style={{
              fontSize: 12,
              padding: "5px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              background: "var(--surface-2)",
              color: "var(--ink)",
            }}
          >
            <option value="active">Active only</option>
            <option value="all">All statuses</option>
          </select>
          <button
            className="btn primary"
            onClick={() => setShowCreate(true)}
            style={{ fontSize: 13, padding: "6px 14px" }}
          >
            + New client
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 12, color: "var(--accent)" }}
          >
            New client
          </div>
          <form onSubmit={handleCreate}>
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
                  Client name *
                </label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Acme IT Ltd"
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
                  <option value="">Select vertical…</option>
                  {Object.entries(VERTICAL_LABELS).map(([k, v]) => (
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
                  Website
                </label>
                <input
                  className="input"
                  value={form.website}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, website: e.target.value }))
                  }
                  placeholder="https://example.com"
                  type="url"
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
                  Notes
                </label>
                <input
                  className="input"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Internal notes about this client…"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            {formError && (
              <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>
                {formError}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                type="submit"
                disabled={creating || !form.name.trim()}
                style={{ fontSize: 13 }}
              >
                {creating ? "Creating…" : "Create client"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setFormError(null);
                }}
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client list */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      ) : clients.length === 0 ? (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 24px" }}
        >
          <p
            style={{
              fontSize: 14,
              color: "var(--muted)",
              marginBottom: 12,
            }}
          >
            No clients yet.
          </p>
          <button
            className="btn primary"
            onClick={() => setShowCreate(true)}
            style={{ fontSize: 13 }}
          >
            Add your first client
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clients.map((c) => {
            const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.active;
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="card"
                  style={{
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    cursor: "pointer",
                    transition: "box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLDivElement).style.boxShadow =
                      "0 2px 8px rgba(0,0,0,0.08)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLDivElement).style.boxShadow =
                      "none")
                  }
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--ink)",
                        }}
                      >
                        {c.name}
                      </span>
                      {c.status !== "active" && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            padding: "1px 7px",
                            borderRadius: 99,
                            background: st.bg,
                            color: st.color,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {c.status}
                        </span>
                      )}
                    </div>
                    {c.vertical && (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {VERTICAL_LABELS[c.vertical] ?? c.vertical}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      flexShrink: 0,
                    }}
                  >
                    {c.website && (
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "var(--muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 160,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.website.replace(/^https?:\/\//, "")}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                      }}
                    >
                      Added{" "}
                      {new Date(c.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="var(--muted)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
