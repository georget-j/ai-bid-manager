import { getServiceSupabase } from "@/lib/supabase-service";
import type {
  InvestorEventRow,
  InvestorOrganizerRow,
} from "@/lib/events/types";
import { EventsExplorer } from "./EventsExplorer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Investor Events — UK Bid Intelligence" };

const DEFAULT_DAYS = 120;
const MAX_EVENTS = 500;
const STARTED_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * Initial server-side fetch with the explorer's default filters (all modes,
 * next 120 days). Mirrors GET /api/investor-events, which the client uses for
 * subsequent filter changes.
 */
async function loadInitialEvents(): Promise<{
  events: InvestorEventRow[];
  organizers: InvestorOrganizerRow[];
}> {
  const now = Date.now();
  const since = new Date(now - STARTED_GRACE_MS).toISOString();
  const until = new Date(now + DEFAULT_DAYS * 86_400_000).toISOString();

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("investor_events")
    .select("*")
    .gte("starts_at", since)
    .lte("starts_at", until)
    .order("starts_at", { ascending: true })
    .limit(MAX_EVENTS);
  if (error) throw new Error(error.message);

  const events = (data ?? []) as InvestorEventRow[];

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
    if (orgError) throw new Error(orgError.message);
    organizers = (orgRows ?? []) as InvestorOrganizerRow[];
  }

  return { events, organizers };
}

export default async function InvestorEventsPage() {
  let events: InvestorEventRow[] = [];
  let organizers: InvestorOrganizerRow[] = [];
  let error: string | null = null;
  try {
    const res = await loadInitialEvents();
    events = res.events;
    organizers = res.organizers;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load investor events";
  }

  return (
    <div style={{ maxWidth: 1080 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Funding</div>
        <h1>
          Investor <em>events</em>
        </h1>
        <p className="subtitle">
          Investor events across the UK — pitch nights, demo days and angel
          networks, updated from live sources.
        </p>
      </div>

      {error ? (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>
        </div>
      ) : (
        <EventsExplorer initialEvents={events} initialOrganizers={organizers} />
      )}
    </div>
  );
}
