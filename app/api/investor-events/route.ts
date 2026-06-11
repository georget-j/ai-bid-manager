import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import type {
  InvestorEventRow,
  InvestorOrganizerRow,
} from "@/lib/events/types";

export const dynamic = "force-dynamic";

const MODES = new Set(["in-person", "virtual", "all"]);

const EVENT_TYPES = new Set([
  "pitch-night",
  "demo-day",
  "angel-network",
  "vc-office-hours",
  "conference",
  "networking",
  "accelerator",
  "webinar",
  "other",
]);

const DEFAULT_DAYS = 120;
const MAX_DAYS = 365;
const MAX_EVENTS = 500;

// Events that started in the last 6 hours still count as "upcoming" — an
// evening pitch night shouldn't vanish from the list the minute it starts.
const STARTED_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * GET /api/investor-events?mode=in-person|virtual|all&type=<event_type>&days=<N>
 *
 * Returns upcoming investor events (global catalogue, sorted soonest first)
 * plus the organizer rows referenced by those events.
 */
export async function GET(req: Request) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      {
        error:
          "Could not determine your organisation — try signing out and back in.",
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const modeParam = url.searchParams.get("mode") ?? "all";
  const mode = MODES.has(modeParam) ? modeParam : "all";
  const typeParam = url.searchParams.get("type");
  const type = typeParam && EVENT_TYPES.has(typeParam) ? typeParam : undefined;
  const daysParam = Number(url.searchParams.get("days") ?? DEFAULT_DAYS);
  const days =
    Number.isFinite(daysParam) && daysParam >= 1
      ? Math.min(Math.floor(daysParam), MAX_DAYS)
      : DEFAULT_DAYS;

  const now = Date.now();
  const since = new Date(now - STARTED_GRACE_MS).toISOString();
  const until = new Date(now + days * 86_400_000).toISOString();

  const supabase = getServiceSupabase();
  let query = supabase
    .from("investor_events")
    .select("*")
    .gte("starts_at", since)
    .lte("starts_at", until)
    .order("starts_at", { ascending: true })
    .limit(MAX_EVENTS);

  if (mode === "in-person") query = query.eq("is_virtual", false);
  if (mode === "virtual") query = query.eq("is_virtual", true);
  if (type) query = query.eq("event_type", type);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch events: ${error.message}` },
      { status: 500 },
    );
  }

  const events = (data ?? []) as InvestorEventRow[];

  // Include the organizer rows referenced by these events so the UI can link
  // straight through to organizer profiles without extra round-trips.
  let organizers: InvestorOrganizerRow[] = [];
  const organizerIds = Array.from(
    new Set(
      events
        .map((e) => e.organizer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (organizerIds.length > 0) {
    const { data: orgRows, error: orgError } = await supabase
      .from("investor_organizers")
      .select("*")
      .in("id", organizerIds);
    if (orgError) {
      return NextResponse.json(
        { error: `Failed to fetch organizers: ${orgError.message}` },
        { status: 500 },
      );
    }
    organizers = (orgRows ?? []) as InvestorOrganizerRow[];
  }

  return NextResponse.json({ events, organizers });
}
