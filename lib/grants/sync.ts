import { getServiceSupabase } from "@/lib/supabase-service";
import { hashPayload } from "@/lib/procurement/hash";
import { matchAlertsForGrants } from "./alerts";
import type {
  GrantSourceConnector,
  NormalizedGrant,
  GrantSourceRow,
} from "./types";

export interface GrantSyncResult {
  source: string;
  fetched: number;
  pages: number;
  rawStored: number;
  duplicatesSkipped: number;
  grantsUpserted: number;
  grantsErrored: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
  closedPruned: number;
}

const LOOKBACK_HOURS = Number(process.env.GRANTS_SYNC_LOOKBACK_HOURS ?? "168"); // 7d
const SYNC_LIMIT = Number(process.env.GRANTS_SYNC_LIMIT ?? "100");
const MAX_PAGES = Number(process.env.GRANTS_MAX_PAGES ?? "20");
const OVERLAP_MINUTES = Number(
  process.env.GRANTS_SYNC_OVERLAP_MINUTES ?? "1440",
);

export async function syncGrantSource(
  connector: GrantSourceConnector,
  options: {
    fromDate?: Date;
    toDate?: Date;
    backfill?: boolean;
    cursor?: string | null;
    maxPages?: number;
    timeBudgetMs?: number;
  } = {},
): Promise<GrantSyncResult> {
  const supabase = getServiceSupabase();
  const startedAt = Date.now();
  const errors: string[] = [];
  let rawStored = 0;
  let duplicatesSkipped = 0;
  let grantsUpserted = 0;
  let grantsErrored = 0;
  let normalizeErrors = 0;
  let totalFetched = 0;
  let totalPages = 0;
  let closedPruned = 0;
  const upsertedIds: string[] = [];
  const seenNoticeIds = new Set<string>();

  const { data: sourceRow } = await supabase
    .from("grant_sources")
    .select("*")
    .eq("name", connector.sourceName)
    .single();

  const now = new Date();
  const from =
    options.fromDate ??
    (sourceRow?.last_successful_sync_at
      ? new Date(
          new Date(sourceRow.last_successful_sync_at).getTime() -
            OVERLAP_MINUTES * 60 * 1000,
        )
      : new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000));
  const to = options.toDate ?? now;

  const startCursor: string | null =
    options.cursor !== undefined
      ? (options.cursor ?? null)
      : options.fromDate
        ? null
        : (sourceRow?.last_cursor ?? null);

  const pageLimit = options.maxPages ?? MAX_PAGES;
  let currentCursor = startCursor;
  let hasMoreAfterCap = false;

  while (totalPages < pageLimit) {
    let fetchResult;
    try {
      fetchResult = await connector.fetchSince({
        from,
        to,
        cursor: currentCursor,
        limit: SYNC_LIMIT,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (totalPages === 0) {
        if (!options.backfill) {
          await updateSourceError(supabase, connector.sourceName, msg);
        }
        return {
          source: connector.sourceName,
          fetched: 0,
          pages: 0,
          rawStored: 0,
          duplicatesSkipped: 0,
          grantsUpserted: 0,
          grantsErrored: 0,
          errors: [msg],
          hasMore: false,
          nextCursor: null,
          closedPruned: 0,
        };
      }
      errors.push(`page ${totalPages + 1} fetch: ${msg}`);
      break;
    }

    const { rawItems, hasMore } = fetchResult;
    const nextPageCursor: string | null = fetchResult.nextCursor ?? null;
    totalFetched += rawItems.length;
    totalPages++;

    // Dedup by content hash, then bulk-insert raw + bulk-upsert grants.
    const seenInPage = new Set<string>();
    const pageItems: Array<{ raw: unknown; hash: string; noticeId: string }> =
      [];
    for (const raw of rawItems) {
      const hash = hashPayload(raw);
      const noticeId = extractGrantId(raw) ?? hash;
      seenNoticeIds.add(noticeId); // every fetched item, for delisting prune
      if (seenInPage.has(hash)) continue;
      seenInPage.add(hash);
      pageItems.push({ raw, hash, noticeId });
    }

    const existingHashes = new Set<string>();
    for (const group of chunk(
      pageItems.map((i) => i.hash),
      100,
    )) {
      const { data: rows } = await supabase
        .from("raw_grant_notices")
        .select("content_hash")
        .eq("source_name", connector.sourceName)
        .in("content_hash", group);
      for (const row of rows ?? []) existingHashes.add(row.content_hash);
    }

    const freshItems = pageItems.filter((i) => !existingHashes.has(i.hash));
    duplicatesSkipped += pageItems.length - freshItems.length;

    if (freshItems.length > 0) {
      const rawRows = freshItems.map((i) => ({
        source_name: connector.sourceName,
        source_notice_id: i.noticeId,
        external_id: extractGrantId(i.raw),
        raw_payload: i.raw as object,
        content_hash: i.hash,
        fetched_at: fetchResult.fetchedAt,
        parser_version: "1",
      }));
      const { error: rawErr } = await supabase
        .from("raw_grant_notices")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rawRows as any, {
          onConflict: "source_name,source_notice_id,content_hash",
          ignoreDuplicates: true,
        });
      if (rawErr) errors.push(`raw_grant_notices: ${rawErr.message}`);
      else rawStored += freshItems.length;

      const normResults = await Promise.allSettled(
        freshItems.map((i) => connector.normalize(i.raw)),
      );
      const grantByKey = new Map<string, Record<string, unknown>>();
      for (const res of normResults) {
        if (res.status === "rejected") {
          normalizeErrors++;
          errors.push(`normalize: ${String(res.reason)}`);
          continue;
        }
        for (const g of res.value) {
          grantByKey.set(`${g.sourceName}|${g.sourceNoticeId}`, toGrantRow(g));
        }
      }
      const grantRows = [...grantByKey.values()];

      if (grantRows.length > 0) {
        const { data: upserted, error: gErr } = await supabase
          .from("grants")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(grantRows as any, {
            onConflict: "source_name,source_notice_id",
            ignoreDuplicates: false,
          })
          .select("id");
        if (gErr) {
          errors.push(`grants: ${gErr.message}`);
          grantsErrored += grantRows.length;
        } else {
          grantsUpserted += grantRows.length;
          for (const row of upserted ?? [])
            if (row?.id) upsertedIds.push(row.id as string);
        }
      }
    }

    currentCursor = nextPageCursor;
    if (!hasMore || !currentCursor) break;
    if (totalPages >= pageLimit) {
      hasMoreAfterCap = true;
      break;
    }
    if (options.timeBudgetMs && Date.now() - startedAt > options.timeBudgetMs) {
      hasMoreAfterCap = true;
      break;
    }
  }

  if (!options.backfill) {
    await supabase
      .from("grant_sources")
      .update({
        last_successful_sync_at:
          rawStored > 0
            ? now.toISOString()
            : sourceRow?.last_successful_sync_at,
        last_cursor: hasMoreAfterCap ? currentCursor : null,
        last_error: errors.length > 0 ? errors[0] : null,
        last_run_at: now.toISOString(),
        last_fetched_count: totalFetched,
        last_pages: totalPages,
        last_normalize_errors: normalizeErrors,
        updated_at: now.toISOString(),
      })
      .eq("name", connector.sourceName);
  }

  // Prune delisted grants: for sources that return their whole current open set,
  // any previously-open grant not seen in a COMPLETE, clean sync has been delisted
  // (closed at source) — mark it closed so it drops out of recommendations and
  // stops showing dead "Apply"/"View source" links. Guarded to avoid mass-closing
  // on a partial run or a source outage.
  if (
    connector.listsAllOpenCalls &&
    !options.backfill &&
    !hasMoreAfterCap &&
    totalFetched > 0 &&
    seenNoticeIds.size > 0 &&
    !errors.some((e) => e.includes("fetch"))
  ) {
    try {
      const { data: existing } = await supabase
        .from("grants")
        .select("id, source_notice_id")
        .eq("source_name", connector.sourceName)
        .neq("status", "closed");
      const absent = (existing ?? [])
        .filter((g) => !seenNoticeIds.has(g.source_notice_id))
        .map((g) => g.id as string);
      for (const group of chunk(absent, 100)) {
        await supabase
          .from("grants")
          .update({ status: "closed", updated_at: now.toISOString() })
          .in("id", group);
      }
      closedPruned = absent.length;
    } catch (err) {
      errors.push(`prune: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fire grant alerts for newly upserted grants (best-effort; never fail the sync).
  if (upsertedIds.length > 0) {
    try {
      await matchAlertsForGrants(upsertedIds);
    } catch (err) {
      errors.push(
        `alerts: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    source: connector.sourceName,
    fetched: totalFetched,
    pages: totalPages,
    rawStored,
    duplicatesSkipped,
    grantsUpserted,
    grantsErrored,
    errors,
    hasMore: hasMoreAfterCap,
    nextCursor: hasMoreAfterCap ? currentCursor : null,
    closedPruned,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toGrantRow(g: NormalizedGrant): Record<string, unknown> {
  return {
    source_name: g.sourceName,
    source_notice_id: g.sourceNoticeId,
    source_url: g.sourceUrl ?? null,
    application_url: g.applicationUrl ?? null,
    title: g.title,
    description: g.description ?? null,
    funder_name: g.funderName ?? null,
    funder_id: g.funderId ?? null,
    funder_region: g.funderRegion ?? null,
    funding_type: g.fundingType ?? null,
    amount_min: g.amountMin ?? null,
    amount_max: g.amountMax ?? null,
    currency: g.currency ?? "GBP",
    open_at: g.openAt ?? null,
    deadline_at: g.deadlineAt ?? null,
    status: g.status,
    themes: g.themes ?? [],
    sectors: g.sectors ?? [],
    regions: g.regions ?? [],
    eligibility_text: g.eligibilityText ?? null,
    eligible_org_types: g.eligibleOrgTypes ?? [],
    match_funding_required: g.matchFundingRequired ?? false,
    beneficiaries: g.beneficiaries ?? [],
    documents: g.documents ?? null,
    raw_json: g.rawJson ?? null,
    published_at: g.publishedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

function extractGrantId(raw: unknown): string | null {
  const r = raw as Record<string, unknown>;
  // 360Giving wraps the grant under `data` with a top-level `grant_id`; other
  // sources use `id`.
  if (typeof r?.grant_id === "string") return r.grant_id;
  if (typeof r?.id === "string") return r.id;
  if (typeof r?.id === "number") return String(r.id);
  return null;
}

async function updateSourceError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  name: string,
  message: string,
) {
  await supabase
    .from("grant_sources")
    .update({
      last_error: message,
      last_cursor: null,
      updated_at: new Date().toISOString(),
    })
    .eq("name", name);
}

/** Ensure grant source rows exist (idempotent). */
export async function seedGrantSources(): Promise<void> {
  const supabase = getServiceSupabase();
  const rows: Array<Omit<GrantSourceRow, "id" | "created_at" | "updated_at">> =
    [
      {
        name: "360giving",
        display_name: "360Giving (GrantNav)",
        type: "360Giving open data",
        base_url: "https://grantnav.threesixtygiving.org",
        enabled: true,
        last_successful_sync_at: null,
        last_cursor: null,
        last_error: null,
      },
      {
        name: "ukri-gtr",
        display_name: "UKRI Gateway to Research",
        type: "GtR JSON API",
        base_url: "https://gtr.ukri.org",
        enabled: true,
        last_successful_sync_at: null,
        last_cursor: null,
        last_error: null,
      },
      {
        name: "govuk-find-a-grant",
        display_name: "GOV.UK Find a Grant",
        type: "Web (guardrailed)",
        base_url: "https://www.find-government-grants.service.gov.uk",
        enabled: true, // open calls — reads the service's own embedded JSON
        last_successful_sync_at: null,
        last_cursor: null,
        last_error: null,
      },
      {
        name: "innovate-uk",
        display_name: "Innovate UK (Innovation Funding Service)",
        type: "Web (guardrailed)",
        base_url: "https://apply-for-innovation-funding.service.gov.uk",
        enabled: true, // open innovation competitions (grants)
        last_successful_sync_at: null,
        last_cursor: null,
        last_error: null,
      },
      {
        name: "manual-upload",
        display_name: "Manual Upload",
        type: "File upload",
        base_url: null,
        enabled: true,
        last_successful_sync_at: null,
        last_cursor: null,
        last_error: null,
      },
    ];

  for (const row of rows) {
    await supabase
      .from("grant_sources")
      .upsert(
        { ...row, updated_at: new Date().toISOString() },
        { onConflict: "name" },
      );
  }
}
