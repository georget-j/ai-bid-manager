"use client";

import { useState, useEffect, useCallback } from "react";

interface GrantSourceRow {
  id: string;
  name: string;
  display_name: string;
  type: string;
  base_url: string | null;
  enabled: boolean;
  last_successful_sync_at: string | null;
  last_cursor: string | null;
  last_error: string | null;
  last_run_at: string | null;
  last_fetched_count: number | null;
  last_pages: number | null;
  last_normalize_errors: number | null;
  grant_count: number;
  raw_count: number;
  hasConnector: boolean;
}

interface GrantSyncResult {
  source: string;
  fetched: number;
  pages?: number;
  rawStored: number;
  duplicatesSkipped: number;
  grantsUpserted: number;
  grantsErrored: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
  closedPruned: number;
  error?: string;
}

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

/** Plain-English hint for a raw grant sync error, or null when unrecognised. */
function grantErrorHint(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("abort")
  ) {
    return "The source took too long to respond — it will retry on the nightly sync.";
  }
  if (lower.includes("404")) {
    return "The feed endpoint wasn't found — the connector may need updating.";
  }
  if (
    lower.includes("cert") ||
    lower.includes("fetch failed") ||
    lower.includes("econn") ||
    lower.includes("network")
  ) {
    return "The provider's site was unreachable (network/TLS). It retries on the nightly sync.";
  }
  if (lower.includes("500") || lower.includes("502") || lower.includes("503")) {
    return "The provider's service returned a server error. It retries on the nightly sync.";
  }
  if (lower.includes("429") || lower.includes("403")) {
    return "The source rate-limited us. It backs off and resumes on the nightly sync.";
  }
  if (lower.includes("400") || lower.includes("end of")) {
    return "Usually the feed signalling the end of available results — harmless if the run still fetched grants.";
  }
  return null;
}

interface SyncStatus {
  tone: "warn" | "error";
  title: string;
  hint: string | null;
  raw: string;
  when: string | null;
  stale: boolean;
}

/**
 * Turn the raw stored last_error into a state-aware, user-facing status
 * (same approach as the tender panel's describeSyncError):
 * - a "warning" (amber) when the run still pulled data or the source has synced
 *   before — the feed works, it just reported something;
 * - an "error" (red) only when nothing has ever come through;
 * - flagged "stale" when a later successful sync means the message is outdated;
 * - with a plain-English hint and the timestamp so the user knows WHEN + whether
 *   to worry, instead of a permanent scary banner.
 */
function describeGrantSyncError(s: GrantSourceRow): SyncStatus | null {
  if (!s.last_error) return null;
  const raw = s.last_error;
  const fetched = s.last_fetched_count ?? 0;
  const everSucceeded = Boolean(s.last_successful_sync_at);
  const when = s.last_run_at ?? s.last_successful_sync_at;

  // The error came from a run that still pulled data (or a source that has
  // succeeded before) → treat it as a soft note, not a hard failure.
  const soft = fetched > 0 || everSucceeded;

  // A success recorded at/after the error means the message no longer reflects
  // the current state (it clears on the next clean run).
  const stale =
    everSucceeded &&
    s.last_run_at != null &&
    new Date(s.last_successful_sync_at!).getTime() >=
      new Date(s.last_run_at).getTime();

  return {
    tone: soft ? "warn" : "error",
    title: soft
      ? `Last run completed with a note${fetched > 0 ? ` · fetched ${fetched.toLocaleString()}` : ""}`
      : "Last sync did not complete",
    hint: grantErrorHint(raw),
    raw,
    when,
    stale,
  };
}

export default function GrantSourcesPanel() {
  const [sources, setSources] = useState<GrantSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<
    Record<string, GrantSyncResult & { timestamp: string }>
  >({});

  const load = useCallback(() => {
    fetch("/api/grant-sources")
      .then((r) => r.json())
      .then((d: { sources?: GrantSourceRow[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setSources(d.sources ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load grant sources");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(source: GrantSourceRow) {
    setToggling(source.name);
    try {
      await fetch(`/api/grant-sources/${source.name}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      load();
    } finally {
      setToggling(null);
    }
  }

  async function triggerSync(name: string) {
    setSyncing(name);
    try {
      const res = await fetch(`/api/grant-sources/${name}/sync`, {
        method: "POST",
      });
      const data = (await res.json()) as GrantSyncResult;
      setSyncResults((prev) => ({
        ...prev,
        [name]: { ...data, timestamp: new Date().toISOString() },
      }));
      load();
    } catch {
      setSyncResults((prev) => ({
        ...prev,
        [name]: {
          source: name,
          fetched: 0,
          rawStored: 0,
          duplicatesSkipped: 0,
          grantsUpserted: 0,
          grantsErrored: 0,
          errors: [],
          hasMore: false,
          nextCursor: null,
          closedPruned: 0,
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
      const res = await fetch("/api/grant-sources/sync-all", {
        method: "POST",
      });
      const data = (await res.json()) as {
        results?: GrantSyncResult[];
        error?: string;
      };
      if (data.results) {
        const updates: Record<string, GrantSyncResult & { timestamp: string }> =
          {};
        for (const r of data.results) {
          updates[r.source] = { ...r, timestamp: new Date().toISOString() };
        }
        setSyncResults((prev) => ({ ...prev, ...updates }));
      } else if (data.error) {
        setError(data.error);
      }
      load();
    } catch {
      setError("Sync all failed — network error");
    } finally {
      setSyncingAll(false);
    }
  }

  return (
    <div id="grant-sources" style={{ marginTop: 32, scrollMarginTop: 24 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Grants</div>
        <h1 style={{ fontSize: 24 }}>
          Grant <em>sources</em>
        </h1>
        <p className="subtitle">
          Feeds that populate the grants catalogue. 360Giving ingests historical
          awarded grants (browse + funder intelligence); GOV.UK Find a Grant and
          Innovate UK ingest open, applyable calls. Raw payloads are stored
          before normalisation, same as the tender feeds.
        </p>
        <button
          className="btn primary"
          onClick={triggerSyncAll}
          disabled={syncingAll || !!syncing}
          style={{ marginTop: 4 }}
        >
          {syncingAll ? "Syncing all…" : "Sync all grant sources"}
        </button>
      </div>

      {loading && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 32px" }}
        >
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Loading grant sources…
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
            <div className="eyebrow">Grant feeds</div>
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

          {sources.map((source) => {
            const isSyncing = syncing === source.name;
            const result = syncResults[source.name];
            const isManual = source.name === "manual-upload";

            return (
              <div key={source.id}>
                {/* Main source row */}
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ paddingTop: 4 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: source.enabled
                          ? source.hasConnector || isManual
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
                          background: source.hasConnector
                            ? "#d1fae5"
                            : "var(--bg-tint)",
                          color: source.hasConnector
                            ? "#059669"
                            : "var(--muted)",
                        }}
                      >
                        {source.hasConnector ? "Connector ready" : source.type}
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
                      {source.grant_count > 0 && (
                        <span>
                          {source.grant_count.toLocaleString()} grants
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
                      {!source.last_successful_sync_at &&
                        source.hasConnector && <span>Never synced</span>}
                      {source.last_run_at &&
                        source.last_fetched_count != null && (
                          <span>
                            Last run fetched{" "}
                            {source.last_fetched_count.toLocaleString()} in{" "}
                            {source.last_pages ?? 0} page
                            {source.last_pages === 1 ? "" : "s"}
                          </span>
                        )}
                      {source.last_cursor && (
                        <span style={{ color: "#d97706" }}>
                          ↻ backlog pending — resumes on next sync
                        </span>
                      )}
                    </div>

                    {source.last_normalize_errors != null &&
                      source.last_normalize_errors > 0 && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: "4px 10px",
                            borderRadius: "var(--r-sm)",
                            background: "#fef3c7",
                            color: "#92400e",
                            fontSize: 11.5,
                            display: "inline-block",
                          }}
                        >
                          ⚠ {source.last_normalize_errors.toLocaleString()}{" "}
                          grant
                          {source.last_normalize_errors === 1 ? "" : "s"}{" "}
                          skipped (could not parse) on the last run
                        </div>
                      )}

                    {(() => {
                      const status = describeGrantSyncError(source);
                      if (!status) return null;
                      const isWarn = status.tone === "warn";
                      const bg = isWarn ? "#fef3c7" : "#fee2e2";
                      const fg = isWarn ? "#92400e" : "#dc2626";
                      return (
                        <div
                          style={{
                            marginTop: 6,
                            padding: "6px 10px",
                            borderRadius: "var(--r-sm)",
                            background: bg,
                            color: fg,
                            fontSize: 11.5,
                            maxWidth: 520,
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {isWarn ? "⚠" : "⛔"} {status.title}
                            {status.when && (
                              <span style={{ fontWeight: 400, opacity: 0.85 }}>
                                {" · "}
                                {timeAgo(status.when)} (
                                {formatDate(status.when)})
                              </span>
                            )}
                            {status.stale && (
                              <span
                                style={{
                                  fontWeight: 400,
                                  marginLeft: 6,
                                  padding: "0 6px",
                                  borderRadius: 999,
                                  background: "rgba(0,0,0,0.06)",
                                }}
                              >
                                cleared on next sync
                              </span>
                            )}
                          </div>
                          {status.hint && (
                            <div style={{ marginTop: 2 }}>{status.hint}</div>
                          )}
                          <div
                            style={{
                              marginTop: 3,
                              opacity: 0.7,
                              fontFamily: "var(--font-mono)",
                              fontSize: 10.5,
                              wordBreak: "break-word",
                            }}
                          >
                            {status.raw}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      alignItems: "center",
                    }}
                  >
                    <button
                      className="btn ghost sm"
                      onClick={() => toggleEnabled(source)}
                      disabled={toggling === source.name || syncingAll}
                      style={{ fontSize: 12 }}
                    >
                      {source.enabled ? "Enabled" : "Disabled"}
                    </button>
                    {source.hasConnector ? (
                      <button
                        className="btn primary"
                        onClick={() => triggerSync(source.name)}
                        disabled={isSyncing || !source.enabled || syncingAll}
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
                        {isManual
                          ? "Manual — synced via upload"
                          : source.enabled
                            ? "Planned — no connector yet"
                            : "Disabled"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sync result */}
                {result && (
                  <div
                    style={{
                      padding: "10px 20px 10px 44px",
                      borderBottom: "1px solid var(--border)",
                      background: result.error ? "#fff5f5" : "var(--bg-tint)",
                      fontSize: 12.5,
                    }}
                  >
                    {result.error ? (
                      <>
                        <span style={{ color: "#dc2626" }}>
                          Sync failed: {result.error}
                        </span>
                        {grantErrorHint(result.error) && (
                          <div style={{ color: "var(--ink-2)", marginTop: 3 }}>
                            {grantErrorHint(result.error)}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
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
                            {result.pages ? ` (${result.pages} pages)` : ""}
                          </span>
                          <span>
                            <b>{result.rawStored}</b> raw stored
                          </span>
                          <span>
                            <b>{result.duplicatesSkipped}</b> duplicates skipped
                          </span>
                          <span>
                            <b>{result.grantsUpserted}</b> grants upserted
                          </span>
                          {(result.closedPruned ?? 0) > 0 && (
                            <span>
                              <b>{result.closedPruned}</b> closed at source —
                              marked closed
                            </span>
                          )}
                          {(result.grantsErrored ?? 0) > 0 && (
                            <span style={{ color: "#dc2626" }}>
                              <b>{result.grantsErrored}</b> failed to save
                            </span>
                          )}
                          {result.errors.length > 0 && (
                            <span style={{ color: "#dc2626" }}>
                              ⚠ {result.errors.length} error(s)
                            </span>
                          )}
                          {result.nextCursor && (
                            <span style={{ color: "#d97706" }}>
                              ↻ backlog pending — resumes on next sync
                            </span>
                          )}
                        </div>
                        {result.errors.length > 0 &&
                          (() => {
                            const distinct = Array.from(new Set(result.errors));
                            const hint = grantErrorHint(distinct.join(" "));
                            return (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "6px 10px",
                                  borderRadius: "var(--r-sm)",
                                  background: "#fef2f2",
                                  border: "1px solid #fecaca",
                                }}
                              >
                                {hint && (
                                  <div
                                    style={{
                                      color: "#b91c1c",
                                      fontSize: 11.5,
                                      marginBottom: 4,
                                    }}
                                  >
                                    {hint}
                                  </div>
                                )}
                                {distinct.slice(0, 5).map((e, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      color: "#b91c1c",
                                      fontFamily: "var(--font-mono)",
                                      fontSize: 11,
                                      wordBreak: "break-word",
                                      marginTop: idx === 0 ? 0 : 3,
                                    }}
                                  >
                                    {e}
                                  </div>
                                ))}
                                {distinct.length > 5 && (
                                  <div
                                    style={{
                                      color: "#b91c1c",
                                      fontSize: 11,
                                      marginTop: 3,
                                      opacity: 0.8,
                                    }}
                                  >
                                    …and {distinct.length - 5} more distinct
                                    error(s)
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
