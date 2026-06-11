"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AlertRule {
  id: string;
  name: string;
  keywords: string[];
  cpv_codes: string[];
  regions: string[];
  buyers: string[];
  min_value: number | null;
  max_value: number | null;
  stages: string[];
  enabled: boolean;
  channel: string;
  match_count: number;
  unseen_count: number;
  created_at: string;
}

interface AlertMatch {
  id: string;
  seen: boolean;
  matched_at: string;
  alert_rule: { id: string; name: string } | null;
  opportunity: {
    id: string;
    title: string;
    buyer_name: string | null;
    deadline_at: string | null;
    value_amount: string | number | null;
    region: string | null;
    procurement_stage: string;
  } | null;
}

interface GrantMatch {
  id: string;
  seen: boolean;
  matched_at: string;
  alert_rule: { id: string; name: string } | null;
  grant: {
    id: string;
    title: string;
    funder_name: string | null;
    deadline_at: string | null;
    amount_min: number | null;
    amount_max: number | null;
    status: string;
  } | null;
}

const UK_REGIONS = [
  "England",
  "North East England",
  "North West England",
  "Yorkshire and the Humber",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London",
  "South East England",
  "South West England",
  "Scotland",
  "Wales",
  "Northern Ireland",
];

function formatValue(v: string | number | null) {
  if (!v) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n.toLocaleString()}`;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const EMPTY_FORM = {
  name: "",
  keywords: "",
  cpv_codes: "",
  regions: [] as string[],
  buyers: "",
  min_value: "",
  max_value: "",
  stages: [] as string[],
};

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [matches, setMatches] = useState<AlertMatch[]>([]);
  const [grantMatches, setGrantMatches] = useState<GrantMatch[]>([]);
  const [unseenTotal, setUnseenTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rules" | "matches">("matches");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      const [rulesRes, matchesRes] = await Promise.all([
        fetch("/api/alerts").then((r) => r.json()) as Promise<{
          rules?: AlertRule[];
        }>,
        fetch("/api/alerts/matches").then((r) => r.json()) as Promise<{
          matches?: AlertMatch[];
          grant_matches?: GrantMatch[];
          unseen_total?: number;
        }>,
      ]);
      if (cancelled) return;
      setRules(rulesRes.rules ?? []);
      setMatches(matchesRes.matches ?? []);
      setGrantMatches(matchesRes.grant_matches ?? []);
      setUnseenTotal(matchesRes.unseen_total ?? 0);
      setLoading(false);
    }
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function markAllSeen() {
    await fetch("/api/alerts/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setMatches((prev) => prev.map((m) => ({ ...m, seen: true })));
    setGrantMatches((prev) => prev.map((m) => ({ ...m, seen: true })));
    setUnseenTotal(0);
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this alert rule?")) return;
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function splitTags(v: string) {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          keywords: splitTags(form.keywords),
          cpv_codes: splitTags(form.cpv_codes),
          regions: form.regions,
          buyers: splitTags(form.buyers),
          min_value: form.min_value ? Number(form.min_value) : null,
          max_value: form.max_value ? Number(form.max_value) : null,
          stages: form.stages,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        refresh();
      } else {
        const d = (await res.json()) as { error?: string };
        setFormError(d.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
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
          Alerts &amp; <em>saved searches</em>
        </h1>
        <p className="subtitle">
          Saved searches that watch for new tenders and grants like the ones you
          want.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        {(["matches", "rules"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              border: "none",
              background: "none",
              cursor: "pointer",
              borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
              color: tab === t ? "var(--accent)" : "var(--ink-2)",
              fontWeight: tab === t ? 500 : 400,
              marginBottom: -1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t === "matches" ? "Matched opportunities" : "Alert rules"}
            {t === "matches" && unseenTotal > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "var(--accent)",
                  color: "#fff",
                  fontWeight: 600,
                }}
              >
                {unseenTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 32px" }}
        >
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</p>
        </div>
      )}

      {/* Matches tab */}
      {!loading && tab === "matches" && (
        <>
          {matches.length === 0 && grantMatches.length === 0 ? (
            <div
              className="card card-pad"
              style={{ textAlign: "center", padding: "48px 40px" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 18,
                  color: "var(--ink)",
                  marginBottom: 12,
                }}
              >
                No matches yet.
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--muted)",
                  maxWidth: 400,
                  margin: "0 auto 20px",
                }}
              >
                Create an alert rule, then sync a source to see matched tenders
                and grants here.
              </p>
              <button
                className="btn primary"
                onClick={() => {
                  setTab("rules");
                  setShowForm(true);
                }}
              >
                Create alert rule
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {matches.length + grantMatches.length} match
                  {matches.length + grantMatches.length !== 1 ? "es" : ""}
                  {unseenTotal > 0 ? ` · ${unseenTotal} new` : ""}
                </span>
                {unseenTotal > 0 && (
                  <button
                    className="btn ghost"
                    onClick={markAllSeen}
                    style={{ fontSize: 12 }}
                  >
                    Mark all as seen
                  </button>
                )}
              </div>
              {grantMatches.length > 0 && (
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  Tenders
                </div>
              )}
              {matches.length > 0 && (
                <div className="card" style={{ overflow: "hidden" }}>
                  {matches.map((match, i) => {
                    const opp = match.opportunity;
                    return (
                      <div
                        key={match.id}
                        style={{
                          padding: "14px 20px",
                          borderBottom:
                            i < matches.length - 1
                              ? "1px solid var(--border)"
                              : "none",
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start",
                          background: match.seen
                            ? "transparent"
                            : "var(--accent-tint)",
                          opacity: match.seen ? 0.85 : 1,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {opp ? (
                            <>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 3,
                                  flexWrap: "wrap",
                                }}
                              >
                                {!match.seen && (
                                  <span
                                    style={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      background: "var(--accent)",
                                      flexShrink: 0,
                                    }}
                                  />
                                )}
                                <Link
                                  href={`/opportunities/${opp.id}`}
                                  style={{
                                    fontWeight: 500,
                                    fontSize: 14,
                                    color: "var(--ink)",
                                    textDecoration: "none",
                                  }}
                                >
                                  {opp.title}
                                </Link>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  fontSize: 12,
                                  color: "var(--muted)",
                                  flexWrap: "wrap",
                                }}
                              >
                                {opp.buyer_name && (
                                  <span>{opp.buyer_name}</span>
                                )}
                                {opp.region && (
                                  <>
                                    <span>·</span>
                                    <span>{opp.region}</span>
                                  </>
                                )}
                                {opp.value_amount && (
                                  <>
                                    <span>·</span>
                                    <span
                                      style={{ fontFamily: "var(--font-mono)" }}
                                    >
                                      {formatValue(opp.value_amount)}
                                    </span>
                                  </>
                                )}
                                {opp.deadline_at && (
                                  <>
                                    <span>·</span>
                                    <span>
                                      Due {formatDate(opp.deadline_at)}
                                    </span>
                                  </>
                                )}
                                {match.alert_rule && (
                                  <>
                                    <span>·</span>
                                    <span style={{ color: "var(--accent)" }}>
                                      Rule: {match.alert_rule.name}
                                    </span>
                                  </>
                                )}
                              </div>
                            </>
                          ) : (
                            <span
                              style={{ fontSize: 13, color: "var(--muted)" }}
                            >
                              Opportunity no longer available
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            flexShrink: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDate(match.matched_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {grantMatches.length > 0 && (
                <>
                  <div
                    className="eyebrow"
                    style={{
                      marginBottom: 8,
                      marginTop: matches.length > 0 ? 16 : 0,
                    }}
                  >
                    Grants
                  </div>
                  <div className="card" style={{ overflow: "hidden" }}>
                    {grantMatches.map((match, i) => {
                      const g = match.grant;
                      const amount = g?.amount_max ?? g?.amount_min ?? null;
                      return (
                        <div
                          key={match.id}
                          style={{
                            padding: "14px 20px",
                            borderBottom:
                              i < grantMatches.length - 1
                                ? "1px solid var(--border)"
                                : "none",
                            display: "flex",
                            gap: 12,
                            alignItems: "flex-start",
                            background: match.seen
                              ? "transparent"
                              : "var(--accent-tint)",
                            opacity: match.seen ? 0.85 : 1,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {g ? (
                              <>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 3,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {!match.seen && (
                                    <span
                                      style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: "50%",
                                        background: "var(--accent)",
                                        flexShrink: 0,
                                      }}
                                    />
                                  )}
                                  <Link
                                    href={`/grants/${g.id}`}
                                    style={{
                                      fontWeight: 500,
                                      fontSize: 14,
                                      color: "var(--ink)",
                                      textDecoration: "none",
                                    }}
                                  >
                                    {g.title}
                                  </Link>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    fontSize: 12,
                                    color: "var(--muted)",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {g.funder_name && (
                                    <span>{g.funder_name}</span>
                                  )}
                                  {amount != null && (
                                    <>
                                      <span>·</span>
                                      <span
                                        style={{
                                          fontFamily: "var(--font-mono)",
                                        }}
                                      >
                                        {formatValue(amount)}
                                      </span>
                                    </>
                                  )}
                                  {g.deadline_at && (
                                    <>
                                      <span>·</span>
                                      <span>
                                        Due {formatDate(g.deadline_at)}
                                      </span>
                                    </>
                                  )}
                                  {match.alert_rule && (
                                    <>
                                      <span>·</span>
                                      <span style={{ color: "var(--accent)" }}>
                                        Rule: {match.alert_rule.name}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </>
                            ) : (
                              <span
                                style={{ fontSize: 13, color: "var(--muted)" }}
                              >
                                Grant no longer available
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--muted)",
                              flexShrink: 0,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(match.matched_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Rules tab */}
      {!loading && tab === "rules" && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 16,
            }}
          >
            <button
              className="btn primary"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Cancel" : "+ New alert rule"}
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <form
              onSubmit={saveRule}
              className="card card-pad"
              style={{ marginBottom: 20 }}
            >
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                New alert rule
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 4,
                  }}
                >
                  Rule name *
                </label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. NHS cyber security"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 4,
                  }}
                >
                  Keywords
                  <span
                    style={{
                      fontWeight: 400,
                      color: "var(--muted)",
                      marginLeft: 6,
                    }}
                  >
                    (comma-separated — any match triggers)
                  </span>
                </label>
                <input
                  className="input"
                  value={form.keywords}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                  placeholder="e.g. cyber security, SOC, managed service"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 4,
                  }}
                >
                  CPV codes
                </label>
                <input
                  className="input"
                  value={form.cpv_codes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cpv_codes: e.target.value }))
                  }
                  placeholder="e.g. 72000000, 79711000"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 6,
                  }}
                >
                  Regions
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {UK_REGIONS.map((region) => {
                    const selected = form.regions.includes(region);
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            regions: selected
                              ? f.regions.filter((r) => r !== region)
                              : [...f.regions, region],
                          }))
                        }
                        style={{
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 999,
                          border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                          background: selected
                            ? "var(--accent-tint)"
                            : "transparent",
                          color: selected ? "var(--accent)" : "var(--ink-2)",
                          cursor: "pointer",
                        }}
                      >
                        {region}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Min value (£)
                  </label>
                  <input
                    className="input"
                    type="number"
                    value={form.min_value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, min_value: e.target.value }))
                    }
                    placeholder="e.g. 50000"
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Max value (£)
                  </label>
                  <input
                    className="input"
                    type="number"
                    value={form.max_value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, max_value: e.target.value }))
                    }
                    placeholder="e.g. 5000000"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {formError && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--r-sm)",
                    background: "#fee2e2",
                    color: "#dc2626",
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  {formError}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Saving…" : "Create rule"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowForm(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {rules.length === 0 && !showForm ? (
            <div
              className="card card-pad"
              style={{ textAlign: "center", padding: "48px 40px" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 18,
                  color: "var(--ink)",
                  marginBottom: 12,
                }}
              >
                No alert rules yet.
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--muted)",
                  maxWidth: 400,
                  margin: "0 auto 20px",
                }}
              >
                Create a rule with keywords, CPV codes, regions, or value
                ranges. New matching opportunities will appear in the Matches
                tab after each sync.
              </p>
              <button className="btn primary" onClick={() => setShowForm(true)}>
                Create your first rule
              </button>
            </div>
          ) : (
            rules.length > 0 && (
              <div className="card" style={{ overflow: "hidden" }}>
                {rules.map((rule, i) => (
                  <div
                    key={rule.id}
                    style={{
                      padding: "14px 20px",
                      borderBottom:
                        i < rules.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
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
                          {rule.name}
                        </span>
                        {!rule.enabled && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "1px 8px",
                              borderRadius: 999,
                              background: "#f3f4f6",
                              color: "#6b7280",
                            }}
                          >
                            Paused
                          </span>
                        )}
                        {rule.unseen_count > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "1px 8px",
                              borderRadius: 999,
                              background: "var(--accent)",
                              color: "#fff",
                              fontWeight: 600,
                            }}
                          >
                            {rule.unseen_count} new
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          fontSize: 12,
                          color: "var(--muted)",
                          flexWrap: "wrap",
                        }}
                      >
                        {rule.keywords.length > 0 && (
                          <span>
                            Keywords: {rule.keywords.slice(0, 4).join(", ")}
                          </span>
                        )}
                        {rule.regions.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{rule.regions.slice(0, 2).join(", ")}</span>
                          </>
                        )}
                        {rule.cpv_codes.length > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              CPV: {rule.cpv_codes.slice(0, 3).join(", ")}
                            </span>
                          </>
                        )}
                        {(rule.min_value || rule.max_value) && (
                          <>
                            <span>·</span>
                            <span>
                              {rule.min_value
                                ? `£${(rule.min_value / 1000).toFixed(0)}k`
                                : "Any"}{" "}
                              –{" "}
                              {rule.max_value
                                ? `£${(rule.max_value / 1000).toFixed(0)}k`
                                : "any"}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>
                          {rule.match_count} total match
                          {rule.match_count !== 1 ? "es" : ""}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <button
                        className="btn ghost"
                        onClick={() => toggleEnabled(rule.id, !rule.enabled)}
                        style={{ fontSize: 12 }}
                      >
                        {rule.enabled ? "Pause" : "Enable"}
                      </button>
                      <button
                        className="icon-btn"
                        title="Delete rule"
                        onClick={() => deleteRule(rule.id)}
                        style={{ color: "var(--muted)" }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M2 2l12 12M14 2L2 14" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
