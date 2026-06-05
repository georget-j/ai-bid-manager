"use client";

import { useState } from "react";
import Link from "next/link";

const VERTICAL_LABELS: Record<string, string> = {
  it_cyber: "IT / Cyber",
  facilities: "Facilities",
  construction: "Construction",
  healthcare: "Healthcare",
  education: "Education",
  professional_services: "Professional Services",
  other: "Other",
};

export function ClientsAdmin() {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    vertical: "",
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    // 1. Create client record
    const createRes = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        vertical: form.vertical || null,
      }),
    });
    const created = (await createRes.json()) as { id?: string; error?: string };
    if (!createRes.ok || !created.id) {
      setError(created.error ?? "Failed to create client");
      setCreating(false);
      return;
    }

    // 2. Send invite if email provided
    if (form.email.trim()) {
      const inviteRes = await fetch(`/api/clients/${created.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      const invited = (await inviteRes.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!inviteRes.ok) {
        setError(
          `Client created but invite failed: ${invited.error ?? "unknown error"}. You can resend from the client page.`,
        );
        setCreating(false);
        return;
      }
      setSuccess(
        `Client "${form.name}" created and invite sent to ${form.email}.`,
      );
    } else {
      setSuccess(
        `Client "${form.name}" created. Add an email to send an invite.`,
      );
    }

    setForm({ name: "", email: "", vertical: "" });
    setShowCreate(false);
    setCreating(false);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Provision client accounts for the SMEs you manage bids for. Each
          client gets their own secure workspace with a login invitation.
        </p>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link href="/clients" className="btn ghost" style={{ fontSize: 12 }}>
            View all clients →
          </Link>
          <button
            className="btn primary"
            onClick={() => setShowCreate(true)}
            style={{ fontSize: 12, padding: "5px 14px" }}
          >
            + New client
          </button>
        </div>
      </div>

      {success && (
        <div
          style={{
            padding: "10px 14px",
            background: "#d1fae5",
            borderRadius: "var(--r-sm)",
            fontSize: 13,
            color: "#065f46",
            marginBottom: 14,
          }}
        >
          ✓ {success}
        </div>
      )}

      {showCreate && (
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Create client account
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
                  Company name *
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
                  <option value="">Select…</option>
                  {Object.entries(VERTICAL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
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
                  Client email — invite sent immediately
                </label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="contact@clientcompany.com (optional)"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            {error && (
              <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                type="submit"
                disabled={creating || !form.name.trim()}
                style={{ fontSize: 13 }}
              >
                {creating
                  ? "Creating…"
                  : form.email
                    ? "Create & send invite"
                    : "Create client"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError(null);
                }}
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
