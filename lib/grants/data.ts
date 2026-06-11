import { getServiceSupabase } from "@/lib/supabase-service";
import { CURATED_PROGRAMMES_SOURCE } from "@/lib/programmes/data";
import type { GrantRow, GrantMatchRow } from "./types";

/**
 * Sources hidden from grant surfaces by default. Curated programme rows live in
 * the grants table so the guided apply flow works for them (lib/programmes/seed.ts),
 * but they are programmes, not grants — they must never appear in grant lists or
 * recommendations. Pass `excludeSources: []` to include everything.
 */
export const DEFAULT_EXCLUDED_GRANT_SOURCES = [CURATED_PROGRAMMES_SOURCE];

/** PostgREST `not in` filter value — each source quoted, e.g. `("a","b")`. */
export function excludedSourcesFilter(sources: string[]): string {
  return `(${sources.map((s) => `"${s}"`).join(",")})`;
}

// List/scoring paths never read the heavy jsonb (raw_json / documents) — only the
// single-row getGrant() does. Project the scalar columns to keep payloads small.
const LIST_COLUMNS =
  "id, source_name, source_notice_id, source_url, application_url, title, " +
  "description, funder_name, funder_id, funder_region, funding_type, amount_min, " +
  "amount_max, currency, open_at, deadline_at, status, themes, sectors, regions, " +
  "eligibility_text, eligible_org_types, match_funding_required, beneficiaries, " +
  "published_at, created_at, updated_at";

export interface ListGrantsOptions {
  status?: string;
  /** Match any of these statuses (e.g. ["open", "forthcoming"]). Wins over `status`. */
  statuses?: string[];
  funder?: string;
  search?: string;
  theme?: string;
  region?: string;
  amountMin?: number;
  amountMax?: number;
  /** Deadline status: "open" (future/none), "soon" (≤30d), "closed" (past). */
  deadline?: string;
  /** Source names to hide. Defaults to DEFAULT_EXCLUDED_GRANT_SOURCES; pass [] for none. */
  excludeSources?: string[];
  limit?: number;
  offset?: number;
  full?: boolean;
}

export async function listGrants(
  opts: ListGrantsOptions,
): Promise<{ grants: GrantRow[]; total: number }> {
  const {
    status,
    statuses,
    funder,
    search,
    theme,
    region,
    amountMin,
    amountMax,
    deadline,
  } = opts;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const excludeSources = opts.excludeSources ?? DEFAULT_EXCLUDED_GRANT_SOURCES;

  const supabase = getServiceSupabase();
  let query = supabase
    .from("grants")
    .select(opts.full ? "*" : LIST_COLUMNS, { count: "exact" })
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (excludeSources.length > 0) {
    query = query.not(
      "source_name",
      "in",
      excludedSourcesFilter(excludeSources),
    );
  }
  if (statuses?.length) query = query.in("status", statuses);
  else if (status) query = query.eq("status", status);
  if (funder) query = query.ilike("funder_name", `%${funder}%`);
  if (search) query = query.ilike("title", `%${search}%`);
  if (theme) query = query.contains("themes", [theme]);
  if (region) query = query.contains("regions", [region]);
  if (amountMin != null) query = query.gte("amount_max", amountMin);
  if (amountMax != null) query = query.lte("amount_min", amountMax);

  if (deadline === "open") {
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    query = query.or(`deadline_at.gte.${nowIso},deadline_at.is.null`);
  } else if (deadline === "soon") {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    query = query
      .gte("deadline_at", now.toISOString())
      .lte("deadline_at", soon.toISOString());
  } else if (deadline === "closed") {
    query = query.lt("deadline_at", new Date().toISOString());
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list grants: ${error.message}`);
  return {
    grants: (data ?? []) as unknown as GrantRow[],
    total: count ?? 0,
  };
}

// ── Display-level duplicate collapse ─────────────────────────────────────────
// The same open call often appears 2–3× across sources (GOV.UK Find a Grant,
// Innovate UK, UKRI Funding Finder all list each other's competitions). DB rows
// are kept untouched (each preserves its own raw payload + audit trail); this is
// a pure, display-only collapse applied where grants are listed.

// Most-authoritative source first — its row becomes the card that is shown.
const CANONICAL_SOURCE_ORDER = [
  "govuk-find-a-grant",
  "innovate-uk",
  "ukri-funding-finder",
];

function sourceRank(sourceName: string): number {
  const i = CANONICAL_SOURCE_ORDER.indexOf(sourceName);
  return i === -1 ? CANONICAL_SOURCE_ORDER.length : i;
}

/** Normalise a title for duplicate matching: case, punctuation and spacing. */
export function normaliseGrantTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Calendar date (YYYY-MM-DD) of a deadline, or "none" — time-of-day differences
 *  between sources (e.g. 11am vs midday cutoffs) must not defeat the collapse. */
function deadlineDateKey(deadlineAt: string | null): string {
  if (!deadlineAt) return "none";
  const d = new Date(deadlineAt);
  return Number.isNaN(d.getTime()) ? deadlineAt : d.toISOString().slice(0, 10);
}

/**
 * Collapse duplicate grants for display: rows sharing a normalised title and the
 * same deadline DATE become one card, keeping the most authoritative source's
 * row. Order is preserved (each group keeps its first row's position). Pure.
 */
export function collapseDuplicateGrants(grants: GrantRow[]): GrantRow[] {
  const byKey = new Map<string, GrantRow>();
  const order: string[] = [];
  for (const g of grants) {
    const key = `${normaliseGrantTitle(g.title)}|${deadlineDateKey(g.deadline_at)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, g);
      order.push(key);
    } else if (sourceRank(g.source_name) < sourceRank(existing.source_name)) {
      byKey.set(key, g); // better source wins the card, position unchanged
    }
  }
  return order.map((key) => byKey.get(key)!);
}

export async function getGrant(id: string): Promise<GrantRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("grants")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as GrantRow;
}

export interface FunderGrantRef {
  id: string;
  title: string;
  amount_min: number | null;
  amount_max: number | null;
  status: string;
  deadline_at: string | null;
  published_at: string | null;
}

export interface FunderProfile {
  name: string;
  region: string | null;
  grantCount: number;
  totalAmount: number;
  avgAmount: number;
  medianAmount: number;
  maxAmount: number;
  statusBreakdown: Record<string, number>;
  topThemes: Array<{ theme: string; count: number }>;
  regions: string[];
  openCount: number;
  grants: FunderGrantRef[];
}

/** Aggregate everything we hold about a funder (from the grants catalogue). */
export async function getFunderProfile(
  name: string,
): Promise<FunderProfile | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("grants")
    .select(
      "id, title, amount_min, amount_max, status, deadline_at, published_at, funder_region, themes, regions",
    )
    .eq("funder_name", name)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error || !data || data.length === 0) return null;

  const amounts = data
    .map((g) => g.amount_max ?? g.amount_min)
    .filter((a): a is number => typeof a === "number" && a > 0)
    .sort((a, b) => a - b);
  const total = amounts.reduce((s, a) => s + a, 0);
  const median = amounts.length
    ? amounts[Math.floor((amounts.length - 1) / 2)]
    : 0;

  const statusBreakdown: Record<string, number> = {};
  const themeCounts = new Map<string, number>();
  const regionSet = new Set<string>();
  let region: string | null = null;
  let openCount = 0;
  for (const g of data) {
    statusBreakdown[g.status] = (statusBreakdown[g.status] ?? 0) + 1;
    if (["open", "forthcoming", "rolling"].includes(g.status)) openCount++;
    if (!region && g.funder_region) region = g.funder_region;
    for (const t of (g.themes ?? []) as string[])
      themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
    for (const r of (g.regions ?? []) as string[]) regionSet.add(r);
  }

  return {
    name,
    region,
    grantCount: data.length,
    totalAmount: total,
    avgAmount: amounts.length ? Math.round(total / amounts.length) : 0,
    medianAmount: median,
    maxAmount: amounts.length ? amounts[amounts.length - 1] : 0,
    statusBreakdown,
    topThemes: [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([theme, count]) => ({ theme, count })),
    regions: [...regionSet].slice(0, 12),
    openCount,
    grants: data.slice(0, 60).map((g) => ({
      id: g.id,
      title: g.title,
      amount_min: g.amount_min,
      amount_max: g.amount_max,
      status: g.status,
      deadline_at: g.deadline_at,
      published_at: g.published_at,
    })),
  };
}

export async function getGrantMatchesForOrg(
  orgId: string,
  grantIds?: string[],
): Promise<GrantMatchRow[]> {
  const supabase = getServiceSupabase();
  let query = supabase.from("grant_matches").select("*").eq("org_id", orgId);
  if (grantIds?.length) query = query.in("grant_id", grantIds);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch grant matches: ${error.message}`);
  return (data ?? []) as GrantMatchRow[];
}
