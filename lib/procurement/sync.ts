import { getServiceSupabase } from "@/lib/supabase";
import { hashPayload } from "./hash";
import { matchAlertsForOpportunities } from "./alerts";
import type {
  ProcurementSourceConnector,
  NormalizedOpportunity,
  SourceRow,
} from "./types";

export interface SyncResult {
  source: string;
  fetched: number;
  pages: number;
  rawStored: number;
  duplicatesSkipped: number;
  opportunitiesUpserted: number;
  opportunitiesErrored: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
}

const LOOKBACK_HOURS = Number(
  process.env.PROCUREMENT_SYNC_LOOKBACK_HOURS ?? "24",
);
const SYNC_LIMIT = Number(process.env.PROCUREMENT_SYNC_LIMIT ?? "100");
// Max pages per syncSource call — prevents runaway fetches / Vercel timeouts
const MAX_PAGES = Number(process.env.PROCUREMENT_MAX_PAGES ?? "20");

export async function syncSource(
  connector: ProcurementSourceConnector,
  options: {
    fromDate?: Date;
    toDate?: Date;
    orgId?: string;
    /**
     * When true the function will NOT update last_successful_sync_at or
     * last_cursor on the source row. Use for historical backfills so that
     * the routine daily-sync state is not clobbered.
     */
    backfill?: boolean;
    /** Explicit starting cursor — overrides stored cursor. Used by backfill. */
    cursor?: string | null;
    /** Max pages to fetch in this call (default MAX_PAGES). Set to 1 for backfill. */
    maxPages?: number;
  } = {},
): Promise<SyncResult> {
  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let rawStored = 0;
  let duplicatesSkipped = 0;
  let opportunitiesUpserted = 0;
  let opportunitiesErrored = 0;
  let totalFetched = 0;
  let totalPages = 0;
  const upsertedIds: string[] = [];

  const { data: sourceRow } = await supabase
    .from("sources")
    .select("*")
    .eq("name", connector.sourceName)
    .single();

  const now = new Date();
  const from =
    options.fromDate ??
    (sourceRow?.last_successful_sync_at
      ? new Date(sourceRow.last_successful_sync_at)
      : new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000));
  const to = options.toDate ?? now;

  // For explicit date ranges (backfills) always start at offset 0 unless an
  // explicit cursor is provided. For incremental syncs, continue from the DB.
  const startCursor: string | null =
    options.cursor !== undefined
      ? (options.cursor ?? null)
      : options.fromDate
        ? null
        : (sourceRow?.last_cursor ?? null);

  const pageLimit = options.maxPages ?? MAX_PAGES;
  let currentCursor = startCursor;
  let hasMoreAfterCap = false;

  // Paginate until exhausted or page limit reached
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
        await updateSourceError(supabase, connector.sourceName, msg);
        return {
          source: connector.sourceName,
          fetched: 0,
          pages: 0,
          rawStored: 0,
          duplicatesSkipped: 0,
          opportunitiesUpserted: 0,
          opportunitiesErrored: 0,
          errors: [msg],
          hasMore: false,
          nextCursor: null,
        };
      }
      errors.push(`page ${totalPages + 1} fetch: ${msg}`);
      break;
    }

    const { rawItems, hasMore } = fetchResult;
    const nextPageCursor: string | null = fetchResult.nextCursor ?? null;
    totalFetched += rawItems.length;
    totalPages++;

    for (const raw of rawItems) {
      const contentHash = hashPayload(raw);

      const { error: rawError } = await supabase.from("raw_notices").insert({
        source_name: connector.sourceName,
        source_notice_id: extractSourceId(raw) ?? contentHash,
        ocid: extractOcid(raw),
        raw_payload: raw as object,
        content_hash: contentHash,
        fetched_at: fetchResult.fetchedAt,
        parser_version: "1",
      });

      if (rawError) {
        if (rawError.code === "23505") {
          duplicatesSkipped++;
        } else {
          errors.push(`raw_notice insert: ${rawError.message}`);
        }
        continue;
      }

      rawStored++;

      let normalized: NormalizedOpportunity[];
      try {
        normalized = await connector.normalize(raw);
      } catch (err) {
        errors.push(
          `normalize: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      for (const opp of normalized) {
        const { data: oppData, error: oppError } = await supabase
          .from("opportunities")
          .upsert(
            {
              canonical_ocid: opp.canonicalOcid ?? null,
              source_name: opp.sourceName,
              source_notice_id: opp.sourceNoticeId,
              source_url: opp.sourceUrl ?? null,
              submission_url: opp.submissionUrl ?? null,
              title: opp.title,
              description: opp.description ?? null,
              buyer_name: opp.buyerName ?? null,
              buyer_identifier: opp.buyerIdentifier ?? null,
              buyer_region: opp.buyerRegion ?? null,
              notice_type: opp.noticeType ?? null,
              procurement_stage: opp.procurementStage,
              status: opp.status,
              cpv_codes: opp.cpvCodes,
              region: opp.region ?? null,
              value_amount: opp.valueAmount ?? null,
              value_currency: opp.valueCurrency ?? "GBP",
              published_at: opp.publishedAt ?? null,
              deadline_at: opp.deadlineAt ?? null,
              contract_start_at: opp.contractStartAt ?? null,
              contract_end_at: opp.contractEndAt ?? null,
              framework_flag: opp.frameworkFlag ?? false,
              lots: opp.lots ?? null,
              documents: opp.documents ?? null,
              raw_json: opp.rawJson ?? null,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "source_name,source_notice_id",
              ignoreDuplicates: false,
            },
          )
          .select("id")
          .single();

        if (oppError) {
          errors.push(`opportunity upsert: ${oppError.message}`);
          opportunitiesErrored++;
        } else {
          opportunitiesUpserted++;
          if (oppData?.id) upsertedIds.push(oppData.id);
        }
      }
    }

    // Advance cursor for next page
    currentCursor = nextPageCursor;

    if (!hasMore || !currentCursor) {
      // All pages consumed
      break;
    }

    if (totalPages >= pageLimit) {
      // Hit the cap — signal caller that there is still more
      hasMoreAfterCap = true;
      break;
    }
  }

  if (upsertedIds.length > 0) {
    try {
      await matchAlertsForOpportunities(upsertedIds);
    } catch {
      // Alert matching failures must not fail the sync
    }
  }

  // Don't mutate source-row state during backfills
  if (!options.backfill) {
    await supabase
      .from("sources")
      .update({
        last_successful_sync_at:
          rawStored > 0
            ? now.toISOString()
            : sourceRow?.last_successful_sync_at,
        // Persist the cursor only if we hit the page cap mid-window so the
        // next routine sync can continue where we left off.
        last_cursor: hasMoreAfterCap ? currentCursor : null,
        last_error: errors.length > 0 ? errors[0] : null,
        updated_at: now.toISOString(),
      })
      .eq("name", connector.sourceName);
  }

  return {
    source: connector.sourceName,
    fetched: totalFetched,
    pages: totalPages,
    rawStored,
    duplicatesSkipped,
    opportunitiesUpserted,
    opportunitiesErrored,
    errors,
    hasMore: hasMoreAfterCap,
    nextCursor: hasMoreAfterCap ? currentCursor : null,
  };
}

function extractSourceId(raw: unknown): string | null {
  const r = raw as Record<string, unknown>;
  return typeof r?.id === "string" ? r.id : null;
}

function extractOcid(raw: unknown): string | null {
  const r = raw as Record<string, unknown>;
  return typeof r?.ocid === "string" ? r.ocid : null;
}

async function updateSourceError(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  name: string,
  message: string,
) {
  await supabase
    .from("sources")
    .update({
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("name", name);
}

// ---------------------------------------------------------------------------
// Fast single-page sync with bulk DB writes
// ---------------------------------------------------------------------------

export interface SyncPageResult {
  fetched: number;
  opportunitiesUpserted: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Fetch exactly one page from a connector and write it to the DB using bulk
 * upserts — 2 DB round-trips per page instead of 200.
 *
 * Intended for the count-based "sync last N" flow. Does not update the source
 * row's last_successful_sync_at so it won't interfere with incremental syncs.
 */
export async function syncPage(
  connector: ProcurementSourceConnector,
  options: {
    cursor?: string | null;
    limit?: number;
    /** Date window to query. Defaults to 2 years → now so CF returns latest first. */
    from?: Date;
    to?: Date;
  } = {},
): Promise<SyncPageResult> {
  const supabase = getServiceSupabase();
  const errors: string[] = [];

  const to = options.to ?? new Date();
  const from =
    options.from ?? new Date(to.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const limit = options.limit ?? SYNC_LIMIT;

  let fetchResult;
  try {
    fetchResult = await connector.fetchSince({
      from,
      to,
      cursor: options.cursor ?? null,
      limit,
    });
  } catch (err) {
    return {
      fetched: 0,
      opportunitiesUpserted: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      hasMore: false,
      nextCursor: null,
    };
  }

  const { rawItems, hasMore } = fetchResult;
  const nextCursor: string | null = fetchResult.nextCursor ?? null;

  if (rawItems.length === 0) {
    return {
      fetched: 0,
      opportunitiesUpserted: 0,
      errors: [],
      hasMore,
      nextCursor,
    };
  }

  // --- Bulk insert raw_notices (skip exact duplicates) ---
  const rawRows = rawItems.map((raw) => ({
    source_name: connector.sourceName,
    source_notice_id: extractSourceId(raw) ?? hashPayload(raw),
    ocid: extractOcid(raw),
    raw_payload: raw as object,
    content_hash: hashPayload(raw),
    fetched_at: fetchResult.fetchedAt,
    parser_version: "1",
  }));

  // Unique constraint is (source_name, source_notice_id, content_hash) — all 3 needed
  const { error: rawErr } = await supabase
    .from("raw_notices")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rawRows as any, {
      onConflict: "source_name,source_notice_id,content_hash",
      ignoreDuplicates: true,
    });

  if (rawErr) errors.push(`raw_notices: ${rawErr.message}`);

  // --- Normalize all items in parallel ---
  const normalizeResults = await Promise.allSettled(
    rawItems.map((raw) => connector.normalize(raw)),
  );

  const oppRows: Record<string, unknown>[] = [];
  for (const r of normalizeResults) {
    if (r.status === "rejected") {
      errors.push(`normalize: ${String(r.reason)}`);
      continue;
    }
    for (const opp of r.value) {
      oppRows.push({
        canonical_ocid: opp.canonicalOcid ?? null,
        source_name: opp.sourceName,
        source_notice_id: opp.sourceNoticeId,
        source_url: opp.sourceUrl ?? null,
        submission_url: opp.submissionUrl ?? null,
        title: opp.title,
        description: opp.description ?? null,
        buyer_name: opp.buyerName ?? null,
        buyer_identifier: opp.buyerIdentifier ?? null,
        buyer_region: opp.buyerRegion ?? null,
        notice_type: opp.noticeType ?? null,
        procurement_stage: opp.procurementStage,
        status: opp.status,
        cpv_codes: opp.cpvCodes,
        region: opp.region ?? null,
        value_amount: opp.valueAmount ?? null,
        value_currency: opp.valueCurrency ?? "GBP",
        published_at: opp.publishedAt ?? null,
        deadline_at: opp.deadlineAt ?? null,
        contract_start_at: opp.contractStartAt ?? null,
        contract_end_at: opp.contractEndAt ?? null,
        framework_flag: opp.frameworkFlag ?? false,
        lots: opp.lots ?? null,
        documents: opp.documents ?? null,
        raw_json: opp.rawJson ?? null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  let opportunitiesUpserted = 0;
  if (oppRows.length > 0) {
    const { data: oppData, error: oppErr } = await supabase
      .from("opportunities")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(oppRows as any, {
        onConflict: "source_name,source_notice_id",
        ignoreDuplicates: false,
      })
      .select("id");

    if (oppErr) {
      errors.push(`opportunities: ${oppErr.message}`);
    } else {
      opportunitiesUpserted = oppData?.length ?? 0;
    }
  }

  return {
    fetched: rawItems.length,
    opportunitiesUpserted,
    errors,
    hasMore,
    nextCursor,
  };
}

/** Ensure source rows exist in the sources table (idempotent). */
export async function seedSources(): Promise<void> {
  const supabase = getServiceSupabase();

  const rows: Array<Omit<SourceRow, "id" | "created_at" | "updated_at">> = [
    {
      name: "find-tender",
      display_name: "Find a Tender",
      type: "OCDS API",
      base_url: "https://www.find-tender.service.gov.uk",
      enabled: true,
      last_successful_sync_at: null,
      last_cursor: null,
      last_error: null,
    },
    {
      name: "contracts-finder",
      display_name: "Contracts Finder",
      type: "OCDS API",
      base_url: "https://www.contractsfinder.service.gov.uk",
      enabled: true,
      last_successful_sync_at: null,
      last_cursor: null,
      last_error: null,
    },
    {
      name: "public-contracts-scotland",
      display_name: "Public Contracts Scotland",
      type: "OCDS API",
      base_url: "https://www.publiccontractsscotland.gov.uk",
      enabled: true,
      last_successful_sync_at: null,
      last_cursor: null,
      last_error: null,
    },
    {
      name: "sell2wales",
      display_name: "Sell2Wales",
      type: "OCDS API",
      base_url: "https://www.sell2wales.gov.wales",
      enabled: false,
      last_successful_sync_at: null,
      last_cursor: null,
      last_error: null,
    },
    {
      name: "etenders-ni",
      display_name: "eTendersNI",
      type: "Manual / Import",
      base_url: null,
      enabled: false,
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
      .from("sources")
      .upsert(
        { ...row, updated_at: new Date().toISOString() },
        { onConflict: "name" },
      );
  }
}
