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

export async function syncSource(
  connector: ProcurementSourceConnector,
  options: { fromDate?: Date; toDate?: Date } = {},
): Promise<SyncResult> {
  const supabase = getServiceSupabase();
  const errors: string[] = [];
  let rawStored = 0;
  let duplicatesSkipped = 0;
  let opportunitiesUpserted = 0;
  let opportunitiesErrored = 0;
  const upsertedIds: string[] = [];

  // Fetch the source row to get last cursor / last sync time
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
  const cursor: string | null = sourceRow?.last_cursor ?? null;

  // Fetch raw data
  let fetchResult;
  try {
    fetchResult = await connector.fetchSince({ from, to, cursor });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateSourceError(supabase, connector.sourceName, msg);
    return {
      source: connector.sourceName,
      fetched: 0,
      rawStored: 0,
      duplicatesSkipped: 0,
      opportunitiesUpserted: 0,
      opportunitiesErrored: 0,
      errors: [msg],
      hasMore: false,
      nextCursor: null,
    };
  }

  const { rawItems, hasMore } = fetchResult;
  const nextCursor: string | null = fetchResult.nextCursor ?? null;

  // Process each raw item
  for (const raw of rawItems) {
    const contentHash = hashPayload(raw);

    // Store raw notice — skip if identical hash already exists
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
        // unique_violation — duplicate, skip
        duplicatesSkipped++;
      } else {
        errors.push(`raw_notice insert: ${rawError.message}`);
      }
      continue;
    }

    rawStored++;

    // Normalize and upsert opportunity
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

  // Run alert matching for newly upserted opportunities
  if (upsertedIds.length > 0) {
    try {
      await matchAlertsForOpportunities(upsertedIds);
    } catch {
      // Alert matching failures should not fail the sync
    }
  }

  // Update source sync status
  await supabase
    .from("sources")
    .update({
      last_successful_sync_at:
        rawStored > 0 ? now.toISOString() : sourceRow?.last_successful_sync_at,
      last_cursor: nextCursor,
      last_error: errors.length > 0 ? errors[0] : null,
      updated_at: now.toISOString(),
    })
    .eq("name", connector.sourceName);

  return {
    source: connector.sourceName,
    fetched: rawItems.length,
    rawStored,
    duplicatesSkipped,
    opportunitiesUpserted,
    opportunitiesErrored,
    errors,
    hasMore,
    nextCursor,
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
