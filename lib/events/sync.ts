import { getServiceSupabase } from "@/lib/supabase-service";
import { hashPayload } from "@/lib/procurement/hash";
import type {
  EventSourceName,
  EventSyncResult,
  InvestorEventSourceConnector,
  NormalizedInvestorEvent,
} from "./types";

// Investor-events sync engine — mirror of lib/grants/sync.ts:
//   * raw-before-normalise with content-hash dedupe (raw_event_notices),
//   * upsert on (source_name, source_event_id),
//   * cursor resume across runs,
//   * per-source run-state recording, where ATTEMPTS always write last_run_at
//     and only clean runs advance last_successful_sync_at.

const SYNC_LIMIT = Number(process.env.EVENTS_SYNC_LIMIT ?? "100");
const MAX_PAGES = Number(process.env.EVENTS_MAX_PAGES ?? "20");

/** Minimal organizer projection used for linking events to the curated catalog. */
export interface OrganizerRef {
  id: string;
  name: string;
  eventbrite_org_id: string | null;
}

/**
 * Normalise an organisation name for matching: lowercase, punctuation to
 * spaces, drop noise words ("The Entrepreneurs Collective Ltd" ==
 * "entrepreneurs collective").
 */
function normalizeOrgName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|ltd|limited|llp|plc|cic)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Link an event to a curated organizer: exact Eventbrite organisation id wins,
 * then a normalised name match. Conservative on purpose — an unlinked event is
 * fine (it still shows organizer_name); a wrong link is not.
 */
export function matchOrganizerId(
  event: Pick<
    NormalizedInvestorEvent,
    "organizerName" | "organizerEventbriteId"
  >,
  organizers: OrganizerRef[],
): string | null {
  if (event.organizerEventbriteId) {
    const byId = organizers.find(
      (o) =>
        o.eventbrite_org_id &&
        o.eventbrite_org_id === event.organizerEventbriteId,
    );
    if (byId) return byId.id;
  }
  const wanted = normalizeOrgName(event.organizerName);
  if (!wanted) return null;
  const byName = organizers.find((o) => normalizeOrgName(o.name) === wanted);
  return byName?.id ?? null;
}

export async function syncEventSource(
  connector: InvestorEventSourceConnector,
  options: {
    cursor?: string | null;
    maxPages?: number;
    timeBudgetMs?: number;
  } = {},
): Promise<EventSyncResult> {
  const supabase = getServiceSupabase();
  const startedAt = Date.now();
  const errors: string[] = [];
  let rawStored = 0;
  let duplicatesSkipped = 0;
  let eventsUpserted = 0;
  let eventsErrored = 0;
  let totalFetched = 0;
  let totalPages = 0;

  const { data: sourceRow } = await supabase
    .from("investor_event_sources")
    .select("*")
    .eq("name", connector.sourceName)
    .single();

  const now = new Date();
  const startCursor: string | null =
    options.cursor !== undefined
      ? (options.cursor ?? null)
      : (sourceRow?.last_cursor ?? null);

  // Curated organizer catalog, loaded once per run for organizer_id linking.
  const { data: organizerRows } = await supabase
    .from("investor_organizers")
    .select("id, name, eventbrite_org_id");
  const organizers = (organizerRows ?? []) as OrganizerRef[];

  const pageLimit = options.maxPages ?? MAX_PAGES;
  let currentCursor = startCursor;
  let hasMoreAfterCap = false;

  while (totalPages < pageLimit) {
    let fetchResult;
    try {
      fetchResult = await connector.fetchSince({
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
          eventsUpserted: 0,
          eventsErrored: 0,
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

    // Dedup by content hash, then bulk-insert raw + bulk-upsert events.
    const seenInPage = new Set<string>();
    const pageItems: Array<{ raw: unknown; hash: string; eventId: string }> =
      [];
    for (const raw of rawItems) {
      const hash = hashPayload(raw);
      const eventId = extractEventId(raw) ?? hash;
      if (seenInPage.has(hash)) continue;
      seenInPage.add(hash);
      pageItems.push({ raw, hash, eventId });
    }

    const existingHashes = new Set<string>();
    for (const group of chunk(
      pageItems.map((i) => i.hash),
      100,
    )) {
      const { data: rows } = await supabase
        .from("raw_event_notices")
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
        source_event_id: i.eventId,
        content_hash: i.hash,
        payload: i.raw as object,
        fetched_at: fetchResult.fetchedAt,
      }));
      const { error: rawErr } = await supabase
        .from("raw_event_notices")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(rawRows as any, {
          onConflict: "source_name,source_event_id,content_hash",
          ignoreDuplicates: true,
        });
      if (rawErr) {
        // Raw-before-normalise (repo policy): if the raw payload can't be stored,
        // do NOT normalise this page — no event row without its audit trail. The
        // hash dedup won't see these items next run, so they retry automatically.
        errors.push(`raw_event_notices: ${rawErr.message}`);
        eventsErrored += freshItems.length;
      } else {
        rawStored += freshItems.length;

        const normResults = await Promise.allSettled(
          freshItems.map((i) => connector.normalize(i.raw)),
        );
        const eventByKey = new Map<string, Record<string, unknown>>();
        for (const res of normResults) {
          if (res.status === "rejected") {
            errors.push(`normalize: ${String(res.reason)}`);
            continue;
          }
          for (const e of res.value) {
            eventByKey.set(
              `${e.sourceName}|${e.sourceEventId}`,
              toEventRow(e, organizers),
            );
          }
        }
        const eventRows = [...eventByKey.values()];

        if (eventRows.length > 0) {
          const { error: eErr } = await supabase
            .from("investor_events")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert(eventRows as any, {
              onConflict: "source_name,source_event_id",
              ignoreDuplicates: false,
            });
          if (eErr) {
            errors.push(`investor_events: ${eErr.message}`);
            eventsErrored += eventRows.length;
          } else {
            eventsUpserted += eventRows.length;
          }
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

  await supabase
    .from("investor_event_sources")
    .update({
      // A clean run is a successful sync even when everything was a duplicate
      // (the steady state); an errored run must NOT advance the watermark.
      last_successful_sync_at:
        errors.length === 0 && totalPages > 0
          ? now.toISOString()
          : (sourceRow?.last_successful_sync_at ?? null),
      last_cursor: hasMoreAfterCap ? currentCursor : null,
      last_error: errors.length > 0 ? errors[0] : null,
      last_run_at: now.toISOString(),
      last_fetched_count: totalFetched,
    })
    .eq("name", connector.sourceName);

  return {
    source: connector.sourceName,
    fetched: totalFetched,
    pages: totalPages,
    rawStored,
    duplicatesSkipped,
    eventsUpserted,
    eventsErrored,
    errors,
    hasMore: hasMoreAfterCap,
    nextCursor: hasMoreAfterCap ? currentCursor : null,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toEventRow(
  e: NormalizedInvestorEvent,
  organizers: OrganizerRef[],
): Record<string, unknown> {
  return {
    source_name: e.sourceName,
    source_event_id: e.sourceEventId,
    organizer_id: matchOrganizerId(e, organizers),
    title: e.title,
    description: e.description ?? null,
    event_url: e.eventUrl ?? null,
    starts_at: e.startsAt ?? null,
    ends_at: e.endsAt ?? null,
    is_virtual: e.isVirtual ?? false,
    virtual_platform: e.virtualPlatform ?? null,
    venue_name: e.venueName ?? null,
    address: e.address ?? null,
    city: e.city ?? null,
    postcode: e.postcode ?? null,
    region: e.region ?? null,
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    event_type: e.eventType ?? "other",
    organizer_name: e.organizerName ?? null,
    organizer_url: e.organizerUrl ?? null,
    price_text: e.priceText ?? null,
    updated_at: new Date().toISOString(),
  };
}

function extractEventId(raw: unknown): string | null {
  const r = raw as Record<string, unknown>;
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
  // last_run_at records ATTEMPTS, not just successes — a source that fails every
  // night must not look like it never ran (same fix as the grants engine's live
  // 360giving bug). A poisoned cursor is cleared so the source self-recovers.
  await supabase
    .from("investor_event_sources")
    .update({
      last_error: message,
      last_cursor: null,
      last_run_at: new Date().toISOString(),
      last_fetched_count: 0,
    })
    .eq("name", name);
}

/** Ensure investor event source rows exist (idempotent, insert-only-missing). */
export async function seedEventSources(): Promise<void> {
  const supabase = getServiceSupabase();
  const rows: Array<{
    name: EventSourceName;
    display_name: string;
    base_url: string | null;
    enabled: boolean;
  }> = [
    {
      name: "eventbrite",
      display_name: "Eventbrite — investor event organisers",
      base_url: "https://www.eventbriteapi.com/v3",
      enabled: false, // needs EVENTBRITE_TOKEN — operators enable after configuring it
    },
    {
      name: "ukbaa",
      display_name: "UKBAA — UK Business Angels Association",
      base_url: "https://www.ukbaa.org.uk",
      enabled: true,
    },
    {
      name: "manual",
      display_name: "Manual",
      base_url: null,
      enabled: true,
    },
  ];

  // Insert only rows that don't exist yet. An upsert here would clobber operator
  // enable/disable toggles and live sync state (last_error/last_cursor/
  // last_successful_sync_at) on every run.
  const { data: existing } = await supabase
    .from("investor_event_sources")
    .select("name");
  const have = new Set((existing ?? []).map((r: { name: string }) => r.name));
  const missing = rows.filter((row) => !have.has(row.name));
  if (missing.length > 0) {
    await supabase.from("investor_event_sources").insert(missing);
  }
}
