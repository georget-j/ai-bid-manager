// Investor events domain types — parallel to lib/grants/types.ts but event-shaped.
// "Investor events" = UK meetings founders can attend to meet investors: pitch
// nights, demo days, angel-network meetings, VC office hours, conferences, webinars.

export type EventSourceName = "eventbrite" | "ukbaa" | "manual";

export type InvestorEventType =
  | "pitch-night"
  | "demo-day"
  | "angel-network"
  | "vc-office-hours"
  | "conference"
  | "networking"
  | "accelerator"
  | "webinar"
  | "other";

export type InvestorOrganizerType =
  | "angel-network"
  | "vc"
  | "accelerator"
  | "university"
  | "government"
  | "community"
  | "corporate"
  | "other";

export interface NormalizedInvestorEvent {
  sourceName: EventSourceName;
  sourceEventId: string;

  title: string;
  description?: string | null;
  eventUrl?: string | null;

  startsAt?: string | null;
  endsAt?: string | null;

  isVirtual?: boolean;
  virtualPlatform?: string | null;

  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  eventType?: InvestorEventType;

  organizerName?: string | null;
  organizerUrl?: string | null;
  /**
   * Eventbrite organisation id of the event's organiser, when the source knows it.
   * NOT a DB column on investor_events — used only to link organizer_id against
   * investor_organizers.eventbrite_org_id during sync.
   */
  organizerEventbriteId?: string | null;

  priceText?: string | null;
}

// DB row shape (snake_case, matches the `investor_events` table).
export interface InvestorEventRow {
  id: string;
  source_name: string;
  source_event_id: string;
  organizer_id: string | null;
  title: string;
  description: string | null;
  event_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_virtual: boolean;
  virtual_platform: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  event_type: string;
  organizer_name: string | null;
  organizer_url: string | null;
  price_text: string | null;
  created_at: string;
  updated_at: string;
}

// DB row shape (snake_case, matches the `investor_organizers` table).
export interface InvestorOrganizerRow {
  id: string;
  slug: string;
  name: string;
  organizer_type: string;
  website: string | null;
  eventbrite_org_id: string | null;
  description: string | null;
  focus_sectors: string[];
  regions: string[];
  links: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// DB row shape (snake_case, matches the `investor_event_sources` table — keyed
// by name; no uuid id, no updated_at).
export interface InvestorEventSourceRow {
  name: EventSourceName;
  display_name: string;
  base_url: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_successful_sync_at: string | null;
  last_error: string | null;
  last_cursor: string | null;
  last_fetched_count: number | null;
  created_at: string;
}

// Connector interface (mirror of GrantSourceConnector). Event listings are
// always "what's coming up", so there is no from/to date window — just paging.
export interface EventFetchSinceParams {
  cursor?: string | null;
  limit?: number;
}

export interface EventFetchResult {
  sourceName: EventSourceName;
  rawItems: unknown[];
  nextCursor?: string | null;
  fetchedAt: string;
  hasMore: boolean;
}

export interface InvestorEventSourceConnector {
  sourceName: EventSourceName;
  displayName: string;
  baseUrl: string;
  fetchSince(params: EventFetchSinceParams): Promise<EventFetchResult>;
  normalize(raw: unknown): Promise<NormalizedInvestorEvent[]>;
}

// Sync run summary (mirror of GrantSyncResult).
export interface EventSyncResult {
  source: string;
  fetched: number;
  pages: number;
  rawStored: number;
  duplicatesSkipped: number;
  eventsUpserted: number;
  eventsErrored: number;
  errors: string[];
  hasMore: boolean;
  nextCursor: string | null;
}
