import { getServiceSupabase } from "@/lib/supabase-service";
import type { InvestorEventRow, InvestorOrganizerRow } from "./types";

// Read paths for the investor events catalog. investor_events and
// investor_organizers are platform-level open data (like `grants`), so reads go
// through the service client; org scoping is enforced by the API routes via the
// usual auth check (getRequestOrgId), not row filters.

/**
 * Events that started up to 6h ago still count as "upcoming" — an evening pitch
 * night shouldn't vanish from the map the minute it starts.
 */
const UPCOMING_GRACE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DAYS_AHEAD = 120;
const LIST_LIMIT = 500;
const ORGANIZER_EVENTS_LIMIT = 200;

export type EventMode = "in-person" | "virtual" | "all";

export interface ListUpcomingEventsOptions {
  mode?: EventMode;
  type?: string;
  /** How far ahead to look, in days (default 120). */
  days?: number;
}

export async function listUpcomingEvents(
  opts: ListUpcomingEventsOptions = {},
): Promise<{
  events: InvestorEventRow[];
  organizers: InvestorOrganizerRow[];
}> {
  const supabase = getServiceSupabase();
  const days =
    opts.days != null && opts.days > 0 ? opts.days : DEFAULT_DAYS_AHEAD;
  const now = Date.now();
  const fromIso = new Date(now - UPCOMING_GRACE_MS).toISOString();
  const toIso = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("investor_events")
    .select("*")
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(LIST_LIMIT);
  if (opts.mode === "in-person") query = query.eq("is_virtual", false);
  else if (opts.mode === "virtual") query = query.eq("is_virtual", true);
  if (opts.type) query = query.eq("event_type", opts.type);

  const { data, error } = await query;
  if (error)
    throw new Error(`Failed to list investor events: ${error.message}`);
  const events = (data ?? []) as InvestorEventRow[];

  // Only the organizers actually referenced by the returned events.
  const organizerIds = [
    ...new Set(
      events
        .map((e) => e.organizer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let organizers: InvestorOrganizerRow[] = [];
  if (organizerIds.length > 0) {
    const { data: orgRows, error: orgError } = await supabase
      .from("investor_organizers")
      .select("*")
      .in("id", organizerIds);
    if (orgError) {
      throw new Error(`Failed to list event organisers: ${orgError.message}`);
    }
    organizers = (orgRows ?? []) as InvestorOrganizerRow[];
  }

  return { events, organizers };
}

export async function getOrganizer(
  slug: string,
): Promise<InvestorOrganizerRow | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("investor_organizers")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) return null;
  return data as InvestorOrganizerRow;
}

/** Upcoming events for one organizer's profile page, soonest first. */
export async function listOrganizerEvents(
  organizerId: string,
): Promise<InvestorEventRow[]> {
  const supabase = getServiceSupabase();
  const fromIso = new Date(Date.now() - UPCOMING_GRACE_MS).toISOString();
  const { data, error } = await supabase
    .from("investor_events")
    .select("*")
    .eq("organizer_id", organizerId)
    .gte("starts_at", fromIso)
    .order("starts_at", { ascending: true })
    .limit(ORGANIZER_EVENTS_LIMIT);
  if (error) {
    throw new Error(`Failed to list organiser events: ${error.message}`);
  }
  return (data ?? []) as InvestorEventRow[];
}
