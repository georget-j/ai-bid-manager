"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SourceRow {
  id: string;
  name: string;
  display_name: string;
  type: string;
  base_url: string | null;
  enabled: boolean;
  last_successful_sync_at: string | null;
  last_cursor: string | null;
  last_error: string | null;
  opportunity_count: number;
  raw_count: number;
}

interface SyncResult {
  source: string;
  fetched: number;
  rawStored: number;
  duplicatesSkipped: number;
  opportunitiesUpserted: number;
  errors: string[];
  hasMore: boolean;
  error?: string;
}

const CONNECTOR_AVAILABLE = new Set([
  "find-tender",
  "contracts-finder",
  "public-contracts-scotland",
  "sell2wales",
]);

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncResults, setSyncResults] = useState<
    Record<string, SyncResult & { timestamp: string }>
  >({});

  const load = useCallback(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d: { sources?: SourceRow[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setSources(d.sources ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load sources");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function triggerSync(name: string) {
    setSyncing(name);
    try {
      const res = await fetch(`/api/sources/${name}/sync`, {
        method: "POST",
      });
      const data = (await res.json()) as SyncResult;
      setSyncResults((prev) => ({
        ...prev,
        [name]: { ...data, timestamp: new Date().toISOString() },
      }));
      // Reload source stats
      load();
    } catch {
      setSyncResults((prev) => ({
        ...prev,
        [name]: {
          source: name,
          fetched: 0,
          rawStored: 0,
          duplicatesSkipped: 0,
          opportunitiesUpserted: 0,
          errors: [],
          hasMore: false,
          error: "Network error",
          timestamp: new Date().toISOString(),
        },
      }));
    } finally {
      setSyncing(null);
    }
  }

  async function triggerSyncAll() {
    setSyncingAll(true);
    try {
      const res = await fetch("/api/sources/sync-all", { method: "POST" });
      const data = (await res.json()) as {
        results?: Array<SyncResult & { source: string }>;
        error?: string;
      };
      if (data.results) {
        const updates: Record<string, SyncResult & { timestamp: string }> = {};
        for (const r of data.results) {
          updates[r.source] = { ...r, timestamp: new Date().toISOString() };
        }
        setSyncResults((prev) => ({ ...prev, ...updates }));
      }
      load();
    } finally {
      setSyncingAll(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Intelligence</div>
        <h1>
          Procurement <em>sources</em>
        </h1>
        <p className="subtitle">
          Connect official UK procurement feeds to automatically surface
          relevant opportunities. All sources store raw notices before
          normalisation to maintain a full audit trail.
        </p>
        <button
          className="btn primary"
          onClick={triggerSyncAll}
          disabled={syncingAll || !!syncing}
          style={{ marginTop: 4 }}
        >
          {syncingAll ? "Syncing all…" : "Sync all enabled sources"}
        </button>
      </div>

      {loading && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 32px" }}
        >
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Loading sources…
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
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

      {!loading && sources.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="eyebrow">Data sources</div>
            <span
              style={{
                fontSize: 12,
                color: "var(--muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {sources.filter((s) => s.enabled).length} / {sources.length}{" "}
              enabled
            </span>
          </div>

          {sources.map((source, i) => {
            const hasConnector = CONNECTOR_AVAILABLE.has(source.name);
            const isSyncing = syncing === source.name;
            const result = syncResults[source.name];

            return (
              <div key={source.id}>
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom:
                      i < sources.length - 1 || result
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  {/* Status dot */}
                  <div style={{ paddingTop: 4 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: source.enabled
                          ? hasConnector
                            ? "#059669"
                            : "#d97706"
                          : "#d1d5db",
                        display: "block",
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: 14,
                          color: "var(--ink)",
                        }}
                      >
                        {source.display_name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "1px 8px",
                          borderRadius: 999,
                          background: hasConnector
                            ? "#d1fae5"
                            : "var(--bg-tint)",
                          color: hasConnector ? "#059669" : "var(--muted)",
                        }}
                      >
                        {hasConnector ? "Connector ready" : source.type}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        fontSize: 12,
                        color: "var(--muted)",
                        flexWrap: "wrap",
                      }}
                    >
                      {source.opportunity_count > 0 && (
                        <span>
                          {source.opportunity_count.toLocaleString()}{" "}
                          opportunities
                        </span>
                      )}
                      {source.raw_count > 0 && (
                        <span>
                          {source.raw_count.toLocaleString()} raw notices
                        </span>
                      )}
                      {source.last_successful_sync_at && (
                        <span>
                          Last sync {timeAgo(source.last_successful_sync_at)} ·{" "}
                          {formatDate(source.last_successful_sync_at)}
                        </span>
                      )}
                      {!source.last_successful_sync_at && hasConnector && (
                        <span>Never synced</span>
                      )}
                    </div>

                    {source.last_error && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: "4px 10px",
                          borderRadius: "var(--r-sm)",
                          background: "#fee2e2",
                          color: "#dc2626",
                          fontSize: 11.5,
                          display: "inline-block",
                        }}
                      >
                        Error: {source.last_error}
                      </div>
                    )}
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {hasConnector ? (
                      <button
                        className="btn accent"
                        onClick={() => triggerSync(source.name)}
                        disabled={isSyncing || !source.enabled}
                        style={{ fontSize: 12, padding: "5px 14px" }}
                      >
                        {isSyncing ? "Syncing…" : "Sync now"}
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          padding: "5px 14px",
                        }}
                      >
                        {source.enabled ? "Planned" : "Disabled"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sync result */}
                {result && (
                  <div
                    style={{
                      padding: "10px 20px 10px 44px",
                      borderBottom:
                        i < sources.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                      background: result.error ? "#fff5f5" : "var(--bg-tint)",
                      fontSize: 12.5,
                    }}
                  >
                    {result.error ? (
                      <span style={{ color: "#dc2626" }}>
                        Sync failed: {result.error}
                      </span>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          gap: 20,
                          flexWrap: "wrap",
                          color: "var(--ink-2)",
                        }}
                      >
                        <span>
                          <b>{result.fetched}</b> fetched
                        </span>
                        <span>
                          <b>{result.rawStored}</b> raw stored
                        </span>
                        <span>
                          <b>{result.duplicatesSkipped}</b> duplicates skipped
                        </span>
                        <span>
                          <b>{result.opportunitiesUpserted}</b> opportunities
                          upserted
                        </span>
                        {result.errors.length > 0 && (
                          <span style={{ color: "#dc2626" }}>
                            {result.errors.length} error(s)
                          </span>
                        )}
                        {result.hasMore && (
                          <span style={{ color: "var(--accent)" }}>
                            More pages available
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        className="card card-pad"
        style={{ marginTop: 20, background: "var(--accent-tint)" }}
      >
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Source strategy
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
          Official APIs and OCDS feeds are used before scraping. All raw
          procurement payloads are stored before normalisation. Source links and
          notice IDs are preserved in every opportunity record.
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            marginTop: 8,
          }}
        >
          Find a Tender, Contracts Finder, Public Contracts Scotland, and
          Sell2Wales connectors are all active. eTendersNI is planned for manual
          import. Manual document upload is available via the{" "}
          <Link
            href="/documents"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Knowledge Base
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
