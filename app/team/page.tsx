"use client";

import { useState, useEffect, useCallback } from "react";

type Role = "owner" | "admin" | "member";

interface Member {
  id: string;
  user_id: string;
  email: string;
  role: Role;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: string;
  expires_at: string;
  created_at: string;
}

interface TeamData {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function roleColor(role: Role): string {
  if (role === "owner") return "#6366f1";
  if (role === "admin") return "#0891b2";
  return "#6b7280";
}

export default function TeamPage() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      const body = (await res.json()) as TeamData & { error?: string };
      if (!res.ok) setError(body.error ?? "Failed to load team.");
      else setData(body);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Inline fetch on mount (matches the app's other client pages); `load` is reused
  // by the post-mutation refreshes below.
  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((body: TeamData & { error?: string }) => {
        if (body.error) setError(body.error);
        else setData(body);
      })
      .catch(() => setError("Network error — please try again."))
      .finally(() => setLoading(false));
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setInviteUrl(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = (await res.json()) as { inviteUrl?: string; error?: string };
      if (!res.ok) setError(body.error ?? "Failed to send invite.");
      else {
        setInviteUrl(body.inviteUrl ?? null);
        setInviteEmail("");
        setInviteRole("member");
        await load();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(id: string, role: Role) {
    setError(null);
    const res = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to change role.");
    }
    await load();
  }

  async function removeMember(id: string) {
    setError(null);
    const res = await fetch(`/api/team/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to remove member.");
    }
    await load();
  }

  async function revokeInvite(id: string) {
    setError(null);
    const res = await fetch(`/api/team/invitations/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to revoke invite.");
    }
    await load();
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 760, paddingTop: 48, textAlign: "center" }}>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading team…</p>
      </div>
    );
  }

  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];

  return (
    <div style={{ maxWidth: 760 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Organisation</div>
        <h1>
          Your <em>team</em>
        </h1>
        <p className="subtitle">
          Invite colleagues into your organisation and manage their roles.
          Owners and admins can manage the team; members can use the tools but
          not change the team.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
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

      {/* Invite */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Invite a colleague
        </div>
        <form
          onSubmit={invite}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <input
            className="input"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@agency.co.uk"
            style={{ flex: 1, minWidth: 220 }}
            required
          />
          <select
            className="input"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            style={{ width: 140 }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button
            type="submit"
            className="btn primary"
            disabled={inviting}
            style={{ flexShrink: 0 }}
          >
            {inviting ? "Inviting…" : "Send invite"}
          </button>
        </form>
        {inviteUrl && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              fontSize: 12.5,
            }}
          >
            <p style={{ color: "var(--muted)", marginBottom: 4 }}>
              Share this link — the invitee signs in with the invited email to
              join:
            </p>
            <code
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--ink)",
                wordBreak: "break-all",
              }}
            >
              {inviteUrl}
            </code>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Members ({members.length})
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              className="avatar petrol"
              style={{ width: 30, height: 30, flexShrink: 0 }}
            >
              {m.email[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.email}
                {m.user_id === data?.currentUserId && (
                  <span style={{ color: "var(--muted)" }}> (you)</span>
                )}
              </div>
            </div>
            <select
              className="input"
              value={m.role}
              onChange={(e) => changeRole(m.id, e.target.value as Role)}
              style={{
                width: 120,
                fontSize: 12.5,
                padding: "4px 8px",
                color: roleColor(m.role),
                fontWeight: 600,
              }}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button
              className="btn ghost"
              onClick={() => removeMember(m.id)}
              style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Pending invitations ({invitations.length})
          </div>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: "var(--ink)" }}>
                  {inv.email}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  Invited as {ROLE_LABEL[inv.role]} · expires{" "}
                  {new Date(inv.expires_at).toLocaleDateString("en-GB")}
                </div>
              </div>
              <button
                className="btn ghost"
                onClick={() => revokeInvite(inv.id)}
                style={{ fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
