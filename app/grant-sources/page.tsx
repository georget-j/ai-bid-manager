"use client";

import { useState, useEffect, useCallback } from "react";

interface GrantSource {
  name: string;
  display_name: string;
  type: string;
  enabled: boolean;
  last_successful_sync_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
  last_fetched_count: number | null;
  grant_count: number;
  raw_count: number;
}

export default function GrantSourcesPage() {
  const [sources, setSources] = useState<GrantSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/grant-sources");
    const b = (await r.json()) as { sources?: GrantSource[] };
    setSources(b.sources ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/grant-sources")
      .then((r) => r.json())
      .then((b: { sources?: GrantSource[] }) => setSources(b.sources ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(s: GrantSource) {
    await fetch(`/api/grant-sources/${s.name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
  }

  async function syncNow(s: GrantSource) {
    setBusy(s.name);
    setMsg(null);
    try {
      const r = await fetch(`/api/grant-sources/${s.name}/sync`, {
        method: "POST",
      });
      const b = await r.json();
      setMsg(
        r.ok
          ? `${s.display_name}: fetched ${b.fetched ?? 0}, upserted ${b.grantsUpserted ?? 0}`
          : `${s.display_name}: ${b.error ?? "sync failed"}`,
      );
      await load();
    } catch {
      setMsg(`${s.display_name}: network error`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Operator</div>
        <h1>
          Grant <em>sources</em>
        </h1>
        <p className="subtitle">
          Feeds that populate the grants catalogue. 360Giving ingests historical
          awarded grants (browse + funder intelligence); open-call sources (UKRI
          / GOV.UK Find a Grant) are added as connectors land.
        </p>
      </div>

      {msg && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
      ) : (
        sources.map((s) => (
          <div
            key={s.name}
            className="card card-pad"
            style={{ marginBottom: 12 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {s.display_name}
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginLeft: 8,
                    }}
                  >
                    {s.type}
                  </span>
                </div>
                <div
                  style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}
                >
                  {s.grant_count.toLocaleString()} grants ·{" "}
                  {s.raw_count.toLocaleString()} raw
                  {s.last_run_at
                    ? ` · last run ${new Date(s.last_run_at).toLocaleString("en-GB")}`
                    : " · never run"}
                </div>
                {s.last_error && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 3 }}>
                    {s.last_error}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn ghost sm"
                  onClick={() => toggle(s)}
                  style={{ fontSize: 12 }}
                >
                  {s.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  className="btn primary"
                  onClick={() => syncNow(s)}
                  disabled={busy === s.name || !s.enabled}
                  style={{ fontSize: 12, padding: "6px 14px" }}
                >
                  {busy === s.name ? "Syncing…" : "Sync now"}
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
