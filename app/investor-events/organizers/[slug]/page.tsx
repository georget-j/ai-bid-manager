import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase-service";
import type {
  InvestorEventRow,
  InvestorOrganizerRow,
} from "@/lib/events/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Plain-English labels. Duplicated from EventsExplorer.tsx because value
// imports from a "use client" module aren't usable in server components
// (lib/events exports types only, no label maps).
const EVENT_TYPE_LABELS: Record<string, string> = {
  "pitch-night": "Pitch night",
  "demo-day": "Demo day",
  "angel-network": "Angel network",
  "vc-office-hours": "Investor office hours",
  conference: "Conference",
  networking: "Networking",
  accelerator: "Accelerator",
  webinar: "Webinar",
  other: "Event",
};

const ORGANIZER_TYPE_LABELS: Record<string, string> = {
  "angel-network": "Angel network",
  vc: "Venture capital firm",
  accelerator: "Accelerator",
  university: "University",
  government: "Government",
  community: "Community group",
  corporate: "Corporate",
  other: "Organiser",
};

const STARTED_GRACE_MS = 6 * 60 * 60 * 1000;

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return time === "00:00" ? date : `${date}, ${time}`;
}

function locationLine(ev: InvestorEventRow): string {
  if (ev.is_virtual) {
    return ev.virtual_platform ? `Online · ${ev.virtual_platform}` : "Online";
  }
  const parts = [ev.venue_name, ev.city ?? ev.region].filter(Boolean);
  return parts.join(", ") || "Location to be confirmed";
}

/** Upcoming events for an organiser plus a count of their past events. */
async function loadOrganizerEvents(organizerId: string): Promise<{
  upcoming: InvestorEventRow[];
  pastCount: number;
}> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - STARTED_GRACE_MS).toISOString();

  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from("investor_events")
      .select("*")
      .eq("organizer_id", organizerId)
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
      .limit(50),
    supabase
      .from("investor_events")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerId)
      .lt("starts_at", since),
  ]);

  return {
    upcoming: (upcomingRes.data ?? []) as InvestorEventRow[],
    pastCount: pastRes.count ?? 0,
  };
}

export default async function OrganizerProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = getServiceSupabase();

  const { data: organizerRow, error: organizerError } = await supabase
    .from("investor_organizers")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (organizerError) {
    return (
      <div style={{ maxWidth: 840 }}>
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "#dc2626" }}>
            Couldn&apos;t load this organiser: {organizerError.message}
          </p>
        </div>
      </div>
    );
  }
  if (!organizerRow) notFound();

  const organizer = organizerRow as InvestorOrganizerRow;
  const { upcoming, pastCount } = await loadOrganizerEvents(organizer.id);

  return (
    <div style={{ maxWidth: 840 }}>
      <Link
        href="/investor-events"
        style={{
          display: "inline-flex",
          gap: 6,
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "none",
          marginBottom: 18,
        }}
      >
        ← All investor events
      </Link>

      {/* Organiser card */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {ORGANIZER_TYPE_LABELS[organizer.organizer_type] ?? "Organiser"}
        </div>
        <h1
          style={{
            fontSize: 22,
            fontFamily: "var(--font-serif)",
            lineHeight: 1.25,
            marginBottom: 4,
          }}
        >
          {organizer.name}
        </h1>
        {organizer.regions.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {organizer.regions.join(" · ")}
          </p>
        )}
        {organizer.description && (
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              marginTop: 12,
            }}
          >
            {organizer.description}
          </p>
        )}
        {organizer.focus_sectors.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}
            >
              What they focus on
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {organizer.focus_sectors.map((s) => (
                <span
                  key={s}
                  style={{
                    fontSize: 11.5,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: "var(--accent-tint)",
                    color: "var(--accent)",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {organizer.website && (
          <p style={{ marginTop: 14 }}>
            <a
              href={organizer.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12.5,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              Visit their website →
            </a>
          </p>
        )}
      </div>

      {/* Upcoming events */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Upcoming events
        </div>
        {upcoming.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            No upcoming events from this organiser right now. We pull events in
            from live sources every night, so check back soon.
          </p>
        )}
        {upcoming.map((ev) => {
          const when = formatWhen(ev.starts_at);
          return (
            <div
              key={ev.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 0",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginBottom: 3,
                  }}
                >
                  {ev.title}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {when ? `${when} · ` : ""}
                  {locationLine(ev)}
                </p>
                {ev.event_url && (
                  <a
                    href={ev.event_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      fontSize: 12.5,
                      color: "var(--accent)",
                      textDecoration: "none",
                      marginTop: 4,
                    }}
                  >
                    View event →
                  </a>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 9px",
                  borderRadius: 999,
                  background: "var(--accent-tint)",
                  color: "var(--accent)",
                  flexShrink: 0,
                }}
              >
                {EVENT_TYPE_LABELS[ev.event_type] ?? "Event"}
              </span>
            </div>
          );
        })}
      </div>

      {pastCount > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
          This organiser has run {pastCount.toLocaleString()} past event
          {pastCount === 1 ? "" : "s"} that we know about.
        </p>
      )}
    </div>
  );
}
