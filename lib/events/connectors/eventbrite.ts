import { getServiceSupabase } from "@/lib/supabase-service";
import { classifyEventType, classifyVirtual } from "../classify";
import { geocodePostcode } from "../geocode";
import type {
  EventFetchResult,
  EventFetchSinceParams,
  InvestorEventSourceConnector,
  NormalizedInvestorEvent,
} from "../types";

// Eventbrite — organizer-scoped event polling. Eventbrite retired its public
// event SEARCH API in 2020, but the organizer-scoped endpoint works with a free
// personal token:
//   GET /v3/organizations/{org_id}/events/?status=live&expand=venue,organizer
// We walk the curated investor_organizers rows that have a verified
// eventbrite_org_id (seeded in lib/events/seed.ts — ids are never guessed) and
// pull each organisation's live events. The cursor is JSON
// {orgIndex, continuation}: organisations are walked sequentially (ordered by
// slug for a stable walk) and Eventbrite paginates each organisation's events
// with continuation tokens.
//
// Auth: the token is sent as an Authorization: Bearer header (officially
// supported, equivalent to the documented ?token= query param) so it can never
// leak into stored URLs, error messages or request logs.
//
// The source is seeded DISABLED — operators enable it after configuring
// EVENTBRITE_TOKEN. Without the token, fetchSince throws a clear config error
// which the sync engine records on the source row.

const API_BASE = "https://www.eventbriteapi.com/v3";
const USER_AGENT =
  process.env.EVENTS_USER_AGENT ??
  "AIBidManager/1.0 (+https://ai-bid-manager.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between paged API calls
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DESCRIPTION_CHARS = 4_000;

export const EVENTBRITE_TOKEN_ERROR =
  "Eventbrite API token not configured — add EVENTBRITE_TOKEN to enable this source.";

export interface EventbriteCursor {
  orgIndex: number;
  continuation: string | null;
}

/** Parse the JSON {orgIndex, continuation} cursor (garbage → start of the walk). */
export function parseEventbriteCursor(
  cursor?: string | null,
): EventbriteCursor {
  if (!cursor) return { orgIndex: 0, continuation: null };
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (parsed && typeof parsed === "object") {
      const orgIndex = Number((parsed as { orgIndex?: unknown }).orgIndex);
      const continuation = (parsed as { continuation?: unknown }).continuation;
      return {
        orgIndex:
          Number.isFinite(orgIndex) && orgIndex >= 0 ? Math.floor(orgIndex) : 0,
        continuation: typeof continuation === "string" ? continuation : null,
      };
    }
  } catch {
    // fall through — restart the walk rather than poisoning the sync
  }
  return { orgIndex: 0, continuation: null };
}

/** Organizer-scoped live-events URL (token travels in the Authorization header). */
export function eventbriteEventsUrl(
  orgId: string,
  continuation?: string | null,
): string {
  // /organizers/ (not /organizations/): the ids on public /o/{slug}-{id} pages
  // are organizer ids — the organizations API 404s for them (verified live).
  const base = `${API_BASE}/organizers/${encodeURIComponent(orgId)}/events/?status=live&expand=venue,organizer`;
  return continuation
    ? `${base}&continuation=${encodeURIComponent(continuation)}`
    : base;
}

// Minimal slice of Eventbrite's event JSON that normalize reads. Venue
// latitude/longitude are strings (deprecated-but-present) → parsed, with a
// geocodePostcode fallback on the venue postcode.
export interface EventbriteEventRaw {
  id?: string | number;
  name?: { text?: string | null } | null;
  description?: { text?: string | null } | null;
  url?: string | null;
  start?: { utc?: string | null } | null;
  end?: { utc?: string | null } | null;
  online_event?: boolean | null;
  is_free?: boolean | null;
  organization_id?: string | number | null;
  organizer?: {
    name?: string | null;
    url?: string | null;
  } | null;
  venue?: {
    name?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    address?: {
      address_1?: string | null;
      address_2?: string | null;
      city?: string | null;
      region?: string | null;
      postal_code?: string | null;
    } | null;
  } | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toCoord(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyResult(): EventFetchResult {
  return {
    sourceName: "eventbrite",
    rawItems: [],
    nextCursor: null,
    fetchedAt: new Date().toISOString(),
    hasMore: false,
  };
}

export const eventbriteConnector: InvestorEventSourceConnector = {
  sourceName: "eventbrite",
  displayName: "Eventbrite — investor event organisers",
  baseUrl: API_BASE,

  async fetchSince(params: EventFetchSinceParams): Promise<EventFetchResult> {
    const token = process.env.EVENTBRITE_TOKEN;
    if (!token) throw new Error(EVENTBRITE_TOKEN_ERROR);

    // The organisations to poll come from the curated catalog (verified ids
    // only). Ordered by slug so the {orgIndex} cursor stays stable across runs.
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("investor_organizers")
      .select("id, slug, eventbrite_org_id")
      .not("eventbrite_org_id", "is", null)
      .order("slug", { ascending: true });
    if (error) {
      throw new Error(
        `Eventbrite: investor_organizers read failed: ${error.message}`,
      );
    }
    const orgs = (data ?? []).filter(
      (o): o is { id: string; slug: string; eventbrite_org_id: string } =>
        typeof o.eventbrite_org_id === "string" && o.eventbrite_org_id !== "",
    );

    const { orgIndex, continuation } = parseEventbriteCursor(params.cursor);
    if (orgs.length === 0 || orgIndex >= orgs.length) return emptyResult();

    const orgId = orgs[orgIndex].eventbrite_org_id;
    if (orgIndex > 0 || continuation) await sleep(REQUEST_DELAY_MS);

    const res = await fetch(eventbriteEventsUrl(orgId, continuation), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 404) {
      // Stale/wrong organizer id: skip it and let the engine continue the walk
      // from the next organizer — one bad id must not kill the whole sync.
      console.error(
        `[eventbrite] organizer ${orgId} not found (404) — skipping`,
      );
      const skipCursor =
        orgIndex + 1 < orgs.length
          ? JSON.stringify({ orgIndex: orgIndex + 1, continuation: null })
          : null;
      return {
        sourceName: "eventbrite",
        rawItems: [],
        nextCursor: skipCursor,
        fetchedAt: new Date().toISOString(),
        hasMore: skipCursor !== null,
      };
    }
    if (!res.ok) {
      // Deliberately no URL/token in the message.
      throw new Error(`Eventbrite API ${res.status} for organisation ${orgId}`);
    }
    const body = (await res.json()) as {
      events?: EventbriteEventRaw[];
      pagination?: { has_more_items?: boolean; continuation?: string | null };
    };
    const events = Array.isArray(body.events) ? body.events : [];
    // One rawItem per event: the full event JSON with a string id injected so
    // the sync engine's extractEventId sees a stable source_event_id.
    const rawItems = events
      .filter((e) => e && e.id !== null && e.id !== undefined)
      .map((e) => ({ ...e, id: String(e.id) }));

    const more =
      body.pagination?.has_more_items === true &&
      typeof body.pagination.continuation === "string" &&
      body.pagination.continuation !== "";
    let nextCursor: string | null = null;
    if (more) {
      nextCursor = JSON.stringify({
        orgIndex,
        continuation: body.pagination!.continuation,
      });
    } else if (orgIndex + 1 < orgs.length) {
      nextCursor = JSON.stringify({
        orgIndex: orgIndex + 1,
        continuation: null,
      });
    }

    return {
      sourceName: "eventbrite",
      rawItems,
      nextCursor,
      fetchedAt: new Date().toISOString(),
      hasMore: nextCursor !== null,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedInvestorEvent[]> {
    const e = raw as EventbriteEventRaw;
    const id = e?.id !== null && e?.id !== undefined ? String(e.id) : "";
    const title = e?.name?.text?.trim() ?? "";
    if (!id || !title) return [];

    const description =
      e.description?.text?.trim().slice(0, MAX_DESCRIPTION_CHARS) || null;
    const venue = e.venue ?? null;
    const address = venue?.address ?? null;

    // online_event is authoritative (venue is absent for online events), but a
    // venue whose name reads "Online — Zoom …" also counts as virtual.
    const venueVirtual = classifyVirtual(venue?.name);
    const isVirtual = e.online_event === true || venueVirtual.isVirtual;

    const postcode = address?.postal_code?.trim() || null;
    let latitude = toCoord(venue?.latitude);
    let longitude = toCoord(venue?.longitude);
    if (!isVirtual && (latitude === null || longitude === null) && postcode) {
      const point = await geocodePostcode(postcode);
      if (point) {
        latitude = point.lat;
        longitude = point.lng;
      }
    }

    const streetAddress =
      [address?.address_1, address?.address_2]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(", ") || null;

    return [
      {
        sourceName: "eventbrite",
        sourceEventId: id,
        title,
        description,
        eventUrl: e.url?.trim() || null,
        startsAt: toIso(e.start?.utc),
        endsAt: toIso(e.end?.utc),
        isVirtual,
        virtualPlatform: isVirtual ? venueVirtual.platform : null,
        venueName: isVirtual ? null : venue?.name?.trim() || null,
        address: isVirtual ? null : streetAddress,
        city: isVirtual ? null : address?.city?.trim() || null,
        postcode: isVirtual ? null : postcode,
        region: isVirtual ? null : address?.region?.trim() || null,
        latitude: isVirtual ? null : latitude,
        longitude: isVirtual ? null : longitude,
        eventType: classifyEventType(title, description),
        organizerName: e.organizer?.name?.trim() || null,
        organizerUrl: e.organizer?.url?.trim() || null,
        organizerEventbriteId:
          e.organization_id !== null && e.organization_id !== undefined
            ? String(e.organization_id)
            : null,
        priceText: e.is_free === true ? "Free" : null,
      },
    ];
  },
};
