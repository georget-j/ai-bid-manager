// Server-side data assembly for the home page. One round of parallel queries, each
// section individually guarded — a failed query degrades that section to fallback
// copy instead of crashing the page.
//
// Recommendations reuse the same underlying lib functions as the API routes
// (app/api/opportunities/recommendations + app/api/grants/recommendations):
// listOpportunities/scoreOpportunity and scoreGrant. The grants route adds a
// semantic-embedding boost on top of the keyword score; that needs an AI call per
// page view, so the home page sticks to the deterministic part of the same scorer.

import { getServiceSupabase } from "@/lib/supabase-service";
import { getRequestOrgId } from "@/lib/org";
import { getIsOperator } from "@/lib/admin-auth";
import { getOrgProfile, listOpportunities } from "@/lib/procurement/data";
import { scoreOpportunity } from "@/lib/procurement/scoring";
import { scoreGrant } from "@/lib/grants/scoring";
import {
  DEFAULT_EXCLUDED_GRANT_SOURCES,
  excludedSourcesFilter,
} from "@/lib/grants/data";
import type { OrganisationProfileRow } from "@/lib/procurement/types";
import type { GrantRow } from "@/lib/grants/types";
import { daysUntil } from "@/lib/dates";
import {
  buildSetupFlow,
  profileCompletenessPct,
  type SetupFlow,
} from "@/lib/setup-flow";

const RECS_SAMPLE = 150;
const RECS_TOP = 3;
const DUE_SOON_WINDOW_DAYS = 14;
const DUE_SOON_MAX = 6;
const SECTION_TIMEOUT_MS = 5000;

/** One card in "Recommended for you" — same shape for tenders and grants. */
export interface RecommendedItem {
  kind: "tender" | "grant";
  id: string;
  title: string;
  /** Who it's from — buyer (tender) or funder (grant). */
  from: string | null;
  deadlineAt: string | null;
  /** 0–100 match score. */
  score: number;
  /** One plain-English reason it matched. */
  reason: string | null;
  href: string;
}

/** One row in "Due soon" — tender deadlines and grant-application deadlines merged. */
export interface DueSoonItem {
  kind: "tender" | "grant";
  title: string;
  from: string | null;
  deadlineAt: string;
  daysLeft: number;
  href: string;
}

export interface HomeCounts {
  /** null = the count query failed (render "—"). */
  openTenders: number | null;
  openGrants: number | null;
  evidenceDocs: number | null;
  matchesThisWeek: number | null;
}

export interface SourceStatus {
  name: string;
  display_name: string;
  enabled: boolean;
  last_successful_sync_at: string | null;
  last_error: string | null;
}

export interface HomeData {
  isOperator: boolean;
  hasProfile: boolean;
  setup: SetupFlow;
  counts: HomeCounts;
  /** null = section query failed; [] = profile exists but nothing matched. */
  tenderRecs: RecommendedItem[] | null;
  grantRecs: RecommendedItem[] | null;
  dueSoon: DueSoonItem[] | null;
  /** Only fetched for operators; null for everyone else (and on failure). */
  sources: SourceStatus[] | null;
}

/** Resolve to null on rejection or timeout — sections degrade, the page never crashes. */
function safe<T>(p: Promise<T>, ms = SECTION_TIMEOUT_MS): Promise<T | null> {
  const timeout = new Promise<null>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    // Don't hold the process open for the losing branch (no-op outside Node).
    t.unref?.();
  });
  return Promise.race([p.catch(() => null), timeout]);
}

// ── Recommendations ───────────────────────────────────────────────────────────

/** Same composition as /api/opportunities/recommendations: live tenders scored
 *  against the profile, saved-to-pipeline ones excluded, ranked fit then urgency. */
async function tenderRecommendations(
  orgId: string,
  profile: OrganisationProfileRow,
): Promise<RecommendedItem[]> {
  const supabase = getServiceSupabase();
  const [pipelineRes, listRes] = await Promise.all([
    supabase.from("bid_pipeline").select("opportunity_id").eq("org_id", orgId),
    listOpportunities({
      status: "active",
      deadline: "open",
      limit: RECS_SAMPLE,
    }),
  ]);
  const inPipeline = new Set(
    (pipelineRes.data ?? []).map((r) => r.opportunity_id),
  );

  return listRes.opportunities
    .map((opp) => ({ opp, result: scoreOpportunity(opp, profile) }))
    .filter(
      (s) =>
        s.result.fitScore > 0 &&
        !inPipeline.has(s.opp.id) &&
        (s.opp.deadline_at == null || daysUntil(s.opp.deadline_at) >= 0),
    )
    .sort((a, b) => {
      if (b.result.fitScore !== a.result.fitScore)
        return b.result.fitScore - a.result.fitScore;
      const ad = a.opp.deadline_at ? daysUntil(a.opp.deadline_at) : Infinity;
      const bd = b.opp.deadline_at ? daysUntil(b.opp.deadline_at) : Infinity;
      return ad - bd;
    })
    .slice(0, RECS_TOP)
    .map(({ opp, result }) => ({
      kind: "tender" as const,
      id: opp.id,
      title: opp.title,
      from: opp.buyer_name,
      deadlineAt: opp.deadline_at,
      score: result.fitScore,
      reason: result.reasons[0] ?? null,
      href: `/opportunities/${opp.id}`,
    }));
}

// The projection scoreGrant reads — same columns the recommendations route selects
// (minus the embedding, which only the semantic boost needs).
const GRANT_SCORING_COLUMNS =
  "id, title, funder_name, amount_min, amount_max, currency, deadline_at, " +
  "status, themes, regions, eligibility_text, eligible_org_types, " +
  "match_funding_required, description, sectors, beneficiaries";

/** Keyword-score the applyable grant calls (open/forthcoming/rolling) — the
 *  deterministic part of /api/grants/recommendations. */
async function grantRecommendations(
  profile: OrganisationProfileRow,
): Promise<RecommendedItem[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("grants")
    .select(GRANT_SCORING_COLUMNS)
    .in("status", ["open", "forthcoming", "rolling"])
    // Curated programme rows are recommended on /programmes, not as grants.
    .not(
      "source_name",
      "in",
      excludedSourcesFilter(DEFAULT_EXCLUDED_GRANT_SOURCES),
    )
    .limit(RECS_SAMPLE);
  if (error) throw new Error(`Failed to load grants: ${error.message}`);

  const grants = (data ?? []) as unknown as GrantRow[];
  return grants
    .map((g) => ({ g, result: scoreGrant(g, profile) }))
    .filter(
      (s) =>
        s.result.fitScore > 0 &&
        s.result.eligible &&
        (s.g.deadline_at == null || daysUntil(s.g.deadline_at) >= 0),
    )
    .sort((a, b) => {
      if (b.result.fitScore !== a.result.fitScore)
        return b.result.fitScore - a.result.fitScore;
      const ad = a.g.deadline_at ? daysUntil(a.g.deadline_at) : Infinity;
      const bd = b.g.deadline_at ? daysUntil(b.g.deadline_at) : Infinity;
      return ad - bd;
    })
    .slice(0, RECS_TOP)
    .map(({ g, result }) => ({
      kind: "grant" as const,
      id: g.id,
      title: g.title,
      from: g.funder_name,
      deadlineAt: g.deadline_at,
      score: result.fitScore,
      reason: result.reasons[0] ?? null,
      href: `/grants/${g.id}`,
    }));
}

// ── Due soon ──────────────────────────────────────────────────────────────────

/** Tender deadlines + this org's grant-application deadlines, merged, soonest first. */
async function dueSoonItems(orgId: string | null): Promise<DueSoonItem[]> {
  const supabase = getServiceSupabase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const horizonIso = new Date(
    now + DUE_SOON_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const [tendersRes, draftsRes] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, title, buyer_name, deadline_at")
      .eq("status", "active")
      .gte("deadline_at", nowIso)
      .lte("deadline_at", horizonIso)
      .order("deadline_at", { ascending: true })
      .limit(DUE_SOON_MAX),
    // Same query lib/grants/deadlines.ts uses for the digest, scoped to this org:
    // a grant application = a grant-linked draft still being worked.
    orgId
      ? supabase
          .from("response_drafts")
          .select(
            "id, rfp_title, grant:grants(title, funder_name, deadline_at)",
          )
          .eq("org_id", orgId)
          .not("grant_id", "is", null)
          .neq("status", "archived")
          .in("stage", ["drafting", "submitted"])
      : Promise.resolve({ data: [], error: null }),
  ]);

  const items: DueSoonItem[] = [];

  for (const t of tendersRes.data ?? []) {
    if (!t.deadline_at) continue;
    items.push({
      kind: "tender",
      title: t.title,
      from: t.buyer_name,
      deadlineAt: t.deadline_at,
      daysLeft: daysUntil(t.deadline_at, now),
      href: `/opportunities/${t.id}`,
    });
  }

  for (const row of draftsRes.data ?? []) {
    // Supabase types embedded relations as an array even for many-to-one joins.
    const g = Array.isArray(row.grant) ? row.grant[0] : row.grant;
    if (!g?.deadline_at) continue;
    const days = daysUntil(g.deadline_at, now);
    if (days < 0 || days > DUE_SOON_WINDOW_DAYS) continue;
    items.push({
      kind: "grant",
      title: g.title ?? row.rfp_title,
      from: g.funder_name ?? null,
      deadlineAt: g.deadline_at,
      daysLeft: days,
      href: `/rfp/drafts/${row.id}`,
    });
  }

  return items.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, DUE_SOON_MAX);
}

// ── Counts ────────────────────────────────────────────────────────────────────

/** Cheap head-only counts for the KPI row; each one degrades to null on its own. */
async function homeCounts(orgId: string | null): Promise<HomeCounts> {
  const supabase = getServiceSupabase();
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const count = async (q: PromiseLike<{ count: number | null }>) => {
    const { count: n } = await q;
    return n ?? 0;
  };

  const [openTenders, openGrants, evidenceDocs, tenderMatches, grantMatches] =
    await Promise.all([
      safe(
        count(
          supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),
        ),
      ),
      safe(
        count(
          supabase
            .from("grants")
            .select("id", { count: "exact", head: true })
            .in("status", ["open", "forthcoming", "rolling"]),
        ),
      ),
      orgId
        ? safe(
            count(
              supabase
                .from("documents")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId),
            ),
          )
        : Promise.resolve(0),
      orgId
        ? safe(
            count(
              supabase
                .from("alert_matches")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .gte("matched_at", weekAgoIso),
            ),
          )
        : Promise.resolve(0),
      orgId
        ? safe(
            count(
              supabase
                .from("grant_matches")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .gte("created_at", weekAgoIso),
            ),
          )
        : Promise.resolve(0),
    ]);

  return {
    openTenders,
    openGrants,
    evidenceDocs,
    matchesThisWeek:
      tenderMatches === null && grantMatches === null
        ? null
        : (tenderMatches ?? 0) + (grantMatches ?? 0),
  };
}

// ── Operator: source sync status ──────────────────────────────────────────────

async function sourceStatuses(): Promise<SourceStatus[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("sources")
    .select("name, display_name, enabled, last_successful_sync_at, last_error")
    .order("display_name", { ascending: true });
  if (error) throw new Error(`Failed to load sources: ${error.message}`);
  return (data ?? []) as SourceStatus[];
}

// ── Assembly ──────────────────────────────────────────────────────────────────

export async function getHomeData(): Promise<HomeData> {
  const [orgId, isOperator] = await Promise.all([
    getRequestOrgId().catch(() => null),
    getIsOperator().catch(() => false),
  ]);

  // The profile gates both recommendation sections, so resolve it first.
  const profile = orgId ? await safe(getOrgProfile(orgId)) : null;

  const [counts, tenderRecs, grantRecs, dueSoon, sources, draftCount] =
    await Promise.all([
      homeCounts(orgId),
      profile && orgId
        ? safe(tenderRecommendations(orgId, profile))
        : Promise.resolve([]),
      profile ? safe(grantRecommendations(profile)) : Promise.resolve([]),
      safe(dueSoonItems(orgId)),
      isOperator ? safe(sourceStatuses()) : Promise.resolve(null),
      orgId
        ? safe(
            (async () => {
              const { count } = await getServiceSupabase()
                .from("response_drafts")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .neq("status", "archived");
              return count ?? 0;
            })(),
          )
        : Promise.resolve(0),
    ]);

  const setup = buildSetupFlow({
    profileExists: !!profile,
    profileCompletenessPct: profileCompletenessPct(profile),
    kbDocCount: counts.evidenceDocs ?? 0,
    tenderMatchCount: tenderRecs?.length ?? 0,
    grantMatchCount: grantRecs?.length ?? 0,
    hasAnyDraft: (draftCount ?? 0) > 0,
  });

  return {
    isOperator,
    hasProfile: !!profile,
    setup,
    counts,
    // No profile → empty arrays read as the "add your profile" teach state, not failure.
    tenderRecs,
    grantRecs,
    dueSoon,
    sources,
  };
}
