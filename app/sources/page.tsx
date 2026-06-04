"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  pages?: number;
  rawStored: number;
  duplicatesSkipped: number;
  opportunitiesUpserted: number;
  errors: string[];
  hasMore: boolean;
  error?: string;
}

interface BackfillState {
  sourceName: string;
  fromDate: string;
  toDate: string;
  currentFrom: string;
  currentPage: number;
  chunksTotal: number;
  chunksDone: number;
  totalStored: number;
  totalFetched: number;
  errors: string[];
  running: boolean;
  done: boolean;
  /** When true, chunks process newest-first (today → past). */
  backwards: boolean;
}

interface CountSyncState {
  sourceName: string;
  target: number;
  fetched: number;
  stored: number;
  pages: number;
  errors: string[];
  running: boolean;
  done: boolean;
}

const PRESETS = [100, 500, 1000, 5000] as const;

const CONNECTOR_AVAILABLE = new Set([
  "find-tender",
  "contracts-finder",
  "public-contracts-scotland",
  "sell2wales",
]);

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function defaultFrom() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return isoDate(d);
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

export default function SourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncResults, setSyncResults] = useState<
    Record<string, SyncResult & { timestamp: string }>
  >({});

  // Count-based sync state
  const [countSync, setCountSync] = useState<CountSyncState | null>(null);
  const [selectedCounts, setSelectedCounts] = useState<Record<string, number>>(
    {},
  );
  const countCancelledRef = useRef(false);

  // Backfill state — one backfill at a time across all sources
  const [backfill, setBackfill] = useState<BackfillState | null>(null);
  // Per-source backfill form inputs (before starting)
  const [backfillForms, setBackfillForms] = useState<
    Record<string, { from: string; to: string; open: boolean }>
  >({});
  const cancelledRef = useRef(false);

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
      const res = await fetch(`/api/sources/${name}/sync`, { method: "POST" });
      const data = (await res.json()) as SyncResult;
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

  function openBackfillForm(name: string) {
    setBackfillForms((prev) => ({
      ...prev,
      [name]: prev[name]?.open
        ? { ...prev[name], open: false }
        : { from: defaultFrom(), to: isoDate(new Date()), open: true },
    }));
  }

  /**
   * Core loop used by both manual backfill (forward) and auto-sync (backward).
   * Forward:  starts at fromDate, advances week by week toward toDate.
   * Backward: starts at toDate, steps back week by week toward fromDate.
   */
  async function runBackfillLoop(
    sourceName: string,
    fromDate: string,
    toDate: string,
    backwards: boolean,
  ) {
    const chunkDays = 7;
    const msPerChunk = chunkDays * 24 * 60 * 60 * 1000;
    const chunksTotal = Math.max(
      1,
      Math.ceil(
        (new Date(toDate).getTime() - new Date(fromDate).getTime()) /
          msPerChunk,
      ),
    );

    cancelledRef.current = false;
    setBackfill({
      sourceName,
      fromDate,
      toDate,
      currentFrom: backwards
        ? isoDate(new Date(new Date(toDate).getTime() - msPerChunk))
        : fromDate,
      currentPage: 1,
      chunksTotal,
      chunksDone: 0,
      totalStored: 0,
      totalFetched: 0,
      errors: [],
      running: true,
      done: false,
      backwards,
    });

    // Backwards: walk toDate pointer from today toward fromDate.
    // Forward:   walk fromDate pointer toward toDate.
    let chunkTo = backwards ? toDate : null; // only used in backwards mode
    let currentFrom = backwards
      ? isoDate(new Date(new Date(toDate).getTime() - msPerChunk))
      : fromDate;
    let currentCursor: string | null = null;

    while (!cancelledRef.current) {
      // In backwards mode the "window" for this chunk is currentFrom → chunkTo.
      // In forward mode the route computes its own chunk end from fromDate + chunkDays.
      const chunkToDate = backwards ? chunkTo! : toDate;

      let data: {
        done: boolean;
        nextCursor: string | null;
        nextFrom: string | null;
        result: {
          fetched: number;
          opportunitiesUpserted: number;
          errors: string[];
        };
        error?: string;
      };

      try {
        const res = await fetch(`/api/sources/${sourceName}/backfill`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromDate: currentFrom,
            toDate: chunkToDate,
            // In backwards mode send chunkDays large enough to cover exactly this window
            chunkDays: backwards ? chunkDays : chunkDays,
            cursor: currentCursor,
          }),
        });
        data = await res.json();
      } catch (err) {
        setBackfill((prev) =>
          prev
            ? {
                ...prev,
                running: false,
                errors: [
                  ...prev.errors,
                  err instanceof Error ? err.message : "Network error",
                ],
              }
            : prev,
        );
        break;
      }

      if (data.error) {
        setBackfill((prev) =>
          prev
            ? { ...prev, running: false, errors: [...prev.errors, data.error!] }
            : prev,
        );
        break;
      }

      const chunkExhausted = !data.nextCursor;

      setBackfill((prev) =>
        prev
          ? {
              ...prev,
              currentFrom,
              currentPage: chunkExhausted ? 1 : prev.currentPage + 1,
              chunksDone: chunkExhausted
                ? prev.chunksDone + 1
                : prev.chunksDone,
              totalFetched: prev.totalFetched + (data.result.fetched ?? 0),
              totalStored:
                prev.totalStored + (data.result.opportunitiesUpserted ?? 0),
              errors: [...prev.errors, ...data.result.errors],
              running: !data.done,
              done: data.done,
            }
          : prev,
      );

      if (cancelledRef.current) break;

      if (data.nextCursor) {
        // More pages in this chunk — same window, next page
        currentCursor = data.nextCursor;
      } else if (backwards) {
        // Chunk done — step backward one week
        const nextChunkTo = currentFrom;
        const nextChunkFrom = isoDate(
          new Date(new Date(currentFrom).getTime() - msPerChunk),
        );
        if (new Date(nextChunkTo) <= new Date(fromDate)) {
          // Reached the earliest date — done
          setBackfill((prev) =>
            prev ? { ...prev, running: false, done: true } : prev,
          );
          break;
        }
        chunkTo = nextChunkTo;
        currentFrom = nextChunkFrom < fromDate ? fromDate : nextChunkFrom;
        currentCursor = null;
      } else {
        // Forward mode: use the route's nextFrom to advance
        if (data.done || !data.nextFrom) break;
        currentFrom = data.nextFrom;
        currentCursor = null;
      }
    }

    load();
  }

  async function startBackfill(sourceName: string) {
    const form = backfillForms[sourceName];
    if (!form) return;
    setBackfillForms((prev) => ({
      ...prev,
      [sourceName]: { ...form, open: false },
    }));
    await runBackfillLoop(sourceName, form.from, form.to, false);
  }

  /** One-click: start from today and walk backwards, no config required. */
  async function startAutoSync(sourceName: string) {
    const to = isoDate(new Date());
    // Go back up to 2 years by default
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const from = isoDate(twoYearsAgo);
    await runBackfillLoop(sourceName, from, to, true);
  }

  function cancelBackfill() {
    cancelledRef.current = true;
    setBackfill((prev) =>
      prev ? { ...prev, running: false, done: false } : prev,
    );
  }

  async function startCountSync(sourceName: string) {
    const target = selectedCounts[sourceName] ?? 1000;

    countCancelledRef.current = false;
    setCountSync({
      sourceName,
      target,
      fetched: 0,
      stored: 0,
      pages: 0,
      errors: [],
      running: true,
      done: false,
    });

    // Use the fast /sync-count route (bulk DB writes, parallel normalization).
    // The CF cursor (links.next URL) carries the full date context, so we just
    // chain cursors without any date-window management here.
    let cursor: string | null = null;
    let totalFetched = 0;

    while (!countCancelledRef.current && totalFetched < target) {
      let data: {
        fetched: number;
        opportunitiesUpserted: number;
        errors: string[];
        hasMore: boolean;
        nextCursor: string | null;
        error?: string;
      };

      try {
        const res = await fetch(`/api/sources/${sourceName}/sync-count`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        data = await res.json();
      } catch (err) {
        setCountSync((prev) =>
          prev
            ? {
                ...prev,
                running: false,
                errors: [
                  ...prev.errors,
                  err instanceof Error ? err.message : "Network error",
                ],
              }
            : prev,
        );
        break;
      }

      if (data.error) {
        setCountSync((prev) =>
          prev
            ? { ...prev, running: false, errors: [...prev.errors, data.error!] }
            : prev,
        );
        break;
      }

      totalFetched += data.fetched;
      const done = totalFetched >= target || !data.hasMore || !data.nextCursor;

      setCountSync((prev) =>
        prev
          ? {
              ...prev,
              fetched: prev.fetched + data.fetched,
              stored: prev.stored + data.opportunitiesUpserted,
              pages: prev.pages + 1,
              errors: [...prev.errors, ...data.errors],
              running: !done,
              done,
            }
          : prev,
      );

      if (done || countCancelledRef.current) break;
      cursor = data.nextCursor;
    }

    load();
  }

  function cancelCountSync() {
    countCancelledRef.current = true;
    setCountSync((prev) => (prev ? { ...prev, running: false } : prev));
  }

  const busyWithBackfill = backfill?.running ?? false;
  const busyWithCount = countSync?.running ?? false;
  const anyBusy = busyWithBackfill || busyWithCount;

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
          disabled={syncingAll || !!syncing || busyWithBackfill}
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
            const isThisBackfilling =
              backfill?.sourceName === source.name && backfill.running;
            const backfillDone =
              backfill?.sourceName === source.name && backfill.done;
            const form = backfillForms[source.name];
            const isCountSyncing =
              countSync?.sourceName === source.name && countSync.running;
            const countSyncDone =
              countSync?.sourceName === source.name && countSync.done;
            const selectedCount = selectedCounts[source.name] ?? 1000;

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

                  <div
                    style={{
                      flexShrink: 0,
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {hasConnector ? (
                      <>
                        {/* Sync last N — primary CTA */}
                        <div style={{ display: "flex", gap: 0 }}>
                          <select
                            value={selectedCount}
                            onChange={(e) =>
                              setSelectedCounts((prev) => ({
                                ...prev,
                                [source.name]: Number(e.target.value),
                              }))
                            }
                            disabled={anyBusy || isSyncing || !source.enabled}
                            style={{
                              fontSize: 12,
                              padding: "5px 8px",
                              border: "1px solid var(--border)",
                              borderRight: "none",
                              borderRadius: "var(--r-sm) 0 0 var(--r-sm)",
                              background: "var(--bg)",
                              cursor: "pointer",
                            }}
                          >
                            {PRESETS.map((n) => (
                              <option key={n} value={n}>
                                Last {n.toLocaleString()}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn primary"
                            onClick={() => startCountSync(source.name)}
                            disabled={anyBusy || isSyncing || !source.enabled}
                            style={{
                              fontSize: 12,
                              padding: "5px 14px",
                              borderRadius: "0 var(--r-sm) var(--r-sm) 0",
                            }}
                          >
                            {isCountSyncing ? "Fetching…" : "Sync"}
                          </button>
                        </div>
                        <button
                          className="btn accent"
                          onClick={() => triggerSync(source.name)}
                          disabled={isSyncing || !source.enabled || anyBusy}
                          style={{ fontSize: 12, padding: "5px 14px" }}
                        >
                          {isSyncing ? "Syncing…" : "Sync now"}
                        </button>
                        <button
                          className="btn"
                          onClick={() => openBackfillForm(source.name)}
                          disabled={anyBusy || isSyncing}
                          style={{ fontSize: 12, padding: "5px 14px" }}
                        >
                          Backfill…
                        </button>
                      </>
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
                      borderBottom: "1px solid var(--border)",
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
                          {result.pages ? ` (${result.pages} pages)` : ""}
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
                            More pages — run sync again to continue
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Backfill form */}
                {form?.open && !isThisBackfilling && (
                  <div
                    style={{
                      padding: "14px 20px 14px 44px",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--accent-tint)",
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: "var(--muted)",
                          marginBottom: 4,
                        }}
                      >
                        From
                      </label>
                      <input
                        type="date"
                        value={form.from}
                        max={form.to}
                        onChange={(e) =>
                          setBackfillForms((prev) => ({
                            ...prev,
                            [source.name]: {
                              ...prev[source.name],
                              from: e.target.value,
                            },
                          }))
                        }
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-sm)",
                          padding: "4px 8px",
                          fontSize: 13,
                          background: "var(--bg)",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: "var(--muted)",
                          marginBottom: 4,
                        }}
                      >
                        To
                      </label>
                      <input
                        type="date"
                        value={form.to}
                        min={form.from}
                        max={isoDate(new Date())}
                        onChange={(e) =>
                          setBackfillForms((prev) => ({
                            ...prev,
                            [source.name]: {
                              ...prev[source.name],
                              to: e.target.value,
                            },
                          }))
                        }
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "var(--r-sm)",
                          padding: "4px 8px",
                          fontSize: 13,
                          background: "var(--bg)",
                        }}
                      />
                    </div>
                    <button
                      className="btn primary"
                      onClick={() => startBackfill(source.name)}
                      style={{ fontSize: 12, padding: "6px 16px" }}
                    >
                      Start backfill
                    </button>
                    <p
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        margin: 0,
                      }}
                    >
                      Processes week-by-week. Keep this tab open until complete.
                    </p>
                  </div>
                )}

                {/* Backfill progress */}
                {(isThisBackfilling || backfillDone) &&
                  backfill?.sourceName === source.name && (
                    <div
                      style={{
                        padding: "14px 20px 14px 44px",
                        borderBottom:
                          i < sources.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                        background: backfill.done
                          ? "#f0fdf4"
                          : "var(--accent-tint)",
                      }}
                    >
                      {/* Progress bar */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "var(--border)",
                          marginBottom: 10,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 999,
                            background: backfill.done
                              ? "#059669"
                              : "var(--accent)",
                            width: `${Math.min(100, (backfill.chunksDone / backfill.chunksTotal) * 100)}%`,
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 20,
                          flexWrap: "wrap",
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          alignItems: "center",
                        }}
                      >
                        <span>
                          {backfill.done ? (
                            <b style={{ color: "#059669" }}>
                              {backfill.backwards
                                ? "All history synced"
                                : "Complete"}
                            </b>
                          ) : (
                            <>
                              {backfill.backwards ? "↩ Week" : "Week"}{" "}
                              <b>{backfill.chunksDone + 1}</b> of{" "}
                              <b>{backfill.chunksTotal}</b>
                              {" · "}page <b>{backfill.currentPage}</b>
                            </>
                          )}
                        </span>
                        <span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                            }}
                          >
                            {backfill.currentFrom}
                          </span>
                        </span>
                        <span>
                          <b>{backfill.totalFetched.toLocaleString()}</b>{" "}
                          fetched
                        </span>
                        <span>
                          <b>{backfill.totalStored.toLocaleString()}</b>{" "}
                          opportunities stored
                        </span>
                        {backfill.errors.length > 0 && (
                          <span style={{ color: "#d97706" }}>
                            {backfill.errors.length} warning(s)
                          </span>
                        )}
                        {!backfill.done && (
                          <button
                            className="btn"
                            onClick={cancelBackfill}
                            style={{
                              fontSize: 11,
                              padding: "3px 10px",
                              color: "#dc2626",
                            }}
                          >
                            Cancel
                          </button>
                        )}
                        {backfill.done && (
                          <button
                            className="btn"
                            onClick={() => setBackfill(null)}
                            style={{ fontSize: 11, padding: "3px 10px" }}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                {/* Count sync progress */}
                {(isCountSyncing || countSyncDone) &&
                  countSync?.sourceName === source.name && (
                    <div
                      style={{
                        padding: "14px 20px 14px 44px",
                        borderTop: "1px solid var(--border)",
                        background: countSync.done ? "#f0fdf4" : "#f0f9ff",
                      }}
                    >
                      {/* Progress bar */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "var(--border)",
                          marginBottom: 10,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 999,
                            background: countSync.done ? "#059669" : "#2563eb",
                            width: `${Math.min(100, (countSync.fetched / countSync.target) * 100)}%`,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 20,
                          flexWrap: "wrap",
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          alignItems: "center",
                        }}
                      >
                        <span>
                          {countSync.done ? (
                            <b style={{ color: "#059669" }}>Done</b>
                          ) : (
                            <>
                              <b>{countSync.fetched.toLocaleString()}</b>
                              {" / "}
                              <b>{countSync.target.toLocaleString()}</b>
                              {" fetched"}
                            </>
                          )}
                        </span>
                        <span>
                          <b>{countSync.stored.toLocaleString()}</b>{" "}
                          opportunities stored
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          {countSync.pages} page
                          {countSync.pages !== 1 ? "s" : ""}
                        </span>
                        {countSync.errors.length > 0 && (
                          <span
                            style={{
                              color: "#d97706",
                              fontSize: 11,
                              maxWidth: 320,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={countSync.errors.join(" | ")}
                          >
                            {countSync.errors[0]}
                          </span>
                        )}
                        {!countSync.done && (
                          <button
                            className="btn"
                            onClick={cancelCountSync}
                            style={{
                              fontSize: 11,
                              padding: "3px 10px",
                              color: "#dc2626",
                            }}
                          >
                            Cancel
                          </button>
                        )}
                        {countSync.done && (
                          <button
                            className="btn"
                            onClick={() => setCountSync(null)}
                            style={{ fontSize: 11, padding: "3px 10px" }}
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
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
