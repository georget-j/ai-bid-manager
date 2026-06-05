"use client";

import { useEffect, useState } from "react";

type RoutingConfig = {
  id: string;
  topic: string;
  owner_email: string;
  backup_email: string | null;
  slack_webhook_url: string | null;
  preferred_channel: string;
  escalation_hours: number;
};

const TOPIC_LABEL: Record<string, string> = {
  security_compliance: "Security & Compliance",
  legal: "Legal",
  pricing: "Pricing",
  technical: "Technical",
  engineering: "Engineering",
  commercial: "Commercial",
  implementation: "Implementation",
  support: "Support",
  general: "General",
};

const CHANNEL_BADGE: Record<string, string> = {
  email: "accent",
  slack: "terra",
  both: "success",
};

type EditState = Partial<RoutingConfig>;

export function RoutingConfigTable({
  defaultEmail,
}: {
  defaultEmail?: string | null;
}) {
  const [configs, setConfigs] = useState<RoutingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/routing")
      .then((res) => res.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setConfigs(data as RoutingConfig[]);
        else setError((data as { error?: string }).error ?? "Failed to load");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load routing config");
        setLoading(false);
      });
  }, []);

  function startEdit(cfg: RoutingConfig) {
    setEditingId(cfg.id);
    setEditState({
      owner_email: cfg.owner_email,
      backup_email: cfg.backup_email ?? "",
      slack_webhook_url: cfg.slack_webhook_url ?? "",
      preferred_channel: cfg.preferred_channel,
      escalation_hours: cfg.escalation_hours,
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const payload = {
        ...editState,
        backup_email: editState.backup_email || null,
        slack_webhook_url: editState.slack_webhook_url || null,
      };
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setConfigs((prev) => prev.map((c) => (c.id === id ? data : c)));
      setEditingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>;
  if (error)
    return <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>;

  if (configs.length === 0 && defaultEmail) {
    return (
      <div>
        <div className="card" style={{ overflow: "hidden", marginBottom: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Owner email</th>
                <th>Backup email</th>
                <th>Channel</th>
                <th>Escalation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, color: "var(--ink)" }}>
                  All topics
                </td>
                <td
                  style={{
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  {defaultEmail}
                </td>
                <td style={{ color: "var(--muted-2)", fontSize: 11.5 }}>
                  <em style={{ opacity: 0.4 }}>—</em>
                </td>
                <td>
                  <span className="badge accent mono">email</span>
                </td>
                <td
                  style={{
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  48h
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          All review requests are routed to your account by default. Add routing
          rules above to assign specific topics to team members.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Topic</th>
            <th>Owner email</th>
            <th>Backup email</th>
            <th>Channel</th>
            <th>Escalation</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {configs.map((cfg) =>
            editingId === cfg.id ? (
              <tr key={cfg.id} style={{ background: "var(--accent-tint)" }}>
                <td style={{ fontWeight: 500 }}>
                  {TOPIC_LABEL[cfg.topic] ?? cfg.topic}
                </td>
                <td>
                  <input
                    value={editState.owner_email ?? ""}
                    onChange={(e) =>
                      setEditState((s) => ({
                        ...s,
                        owner_email: e.target.value,
                      }))
                    }
                    placeholder="owner@company.com"
                    className="input"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                  />
                </td>
                <td>
                  <input
                    value={editState.backup_email ?? ""}
                    onChange={(e) =>
                      setEditState((s) => ({
                        ...s,
                        backup_email: e.target.value,
                      }))
                    }
                    placeholder="backup@company.com"
                    className="input"
                    style={{ padding: "4px 8px", fontSize: 12.5 }}
                  />
                </td>
                <td>
                  <select
                    value={editState.preferred_channel ?? "email"}
                    onChange={(e) =>
                      setEditState((s) => ({
                        ...s,
                        preferred_channel: e.target.value,
                      }))
                    }
                    className="input"
                    style={{
                      padding: "4px 8px",
                      fontSize: 12.5,
                      width: "auto",
                    }}
                  >
                    <option value="email">Email</option>
                    <option value="slack">Slack</option>
                    <option value="both">Both</option>
                  </select>
                </td>
                <td>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <input
                      type="number"
                      value={editState.escalation_hours ?? 48}
                      onChange={(e) =>
                        setEditState((s) => ({
                          ...s,
                          escalation_hours: Number(e.target.value),
                        }))
                      }
                      className="input"
                      style={{ padding: "4px 8px", fontSize: 12.5, width: 64 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      h
                    </span>
                  </div>
                </td>
                <td>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      onClick={() => saveEdit(cfg.id)}
                      disabled={saving}
                      className="btn accent sm"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn ghost sm"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={cfg.id}>
                <td style={{ fontWeight: 500, color: "var(--ink)" }}>
                  {TOPIC_LABEL[cfg.topic] ?? cfg.topic}
                </td>
                <td
                  style={{
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  {cfg.owner_email || <em style={{ opacity: 0.5 }}>unset</em>}
                </td>
                <td
                  style={{
                    color: "var(--muted-2)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                  }}
                >
                  {cfg.backup_email || <em style={{ opacity: 0.4 }}>—</em>}
                </td>
                <td>
                  <span
                    className={`badge ${CHANNEL_BADGE[cfg.preferred_channel] ?? ""} mono`}
                  >
                    {cfg.preferred_channel}
                  </span>
                </td>
                <td
                  style={{
                    color: "var(--muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  {cfg.escalation_hours}h
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    onClick={() => startEdit(cfg)}
                    className="btn ghost sm"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
