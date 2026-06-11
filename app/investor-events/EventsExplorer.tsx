"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  InvestorEventRow,
  InvestorOrganizerRow,
} from "@/lib/events/types";

// Plain-English labels for non-technical founders.
export const EVENT_TYPE_LABELS: Record<string, string> = {
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

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? "Event";
}

// ── Explorer ────────────────────────────────────────────────────────────────

type Mode = "in-person" | "virtual" | "all";

const MODE_LABELS: { value: Mode; label: string }[] = [
  { value: "in-person", label: "In person" },
  { value: "virtual", label: "Virtual" },
  { value: "all", label: "All" },
];

const DAYS_OPTIONS = [30, 60, 120];

// Leaflet touches `window`, so the map is client-only: all leaflet imports
// live inside EventsMap.tsx and it is loaded with ssr disabled.
const EventsMap = dynamic(() => import("./EventsMap"), {
  ssr: false,
  loading: () => (
    <div
      className="shimmer"
      style={{ height: "100%", width: "100%" }}
      aria-hidden
    />
  ),
});

function datePieces(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-GB", { day: "numeric" }),
    month: d.toLocaleDateString("en-GB", { month: "short" }),
    full: d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

function locationLine(ev: InvestorEventRow): string {
  if (ev.is_virtual) {
    return ev.virtual_platform ? `Online · ${ev.virtual_platform}` : "Online";
  }
  const parts = [ev.venue_name, ev.city ?? ev.region].filter(Boolean);
  return parts.join(", ") || "Location to be confirmed";
}

export function EventsExplorer({
  initialEvents,
  initialOrganizers,
}: {
  initialEvents: InvestorEventRow[];
  initialOrganizers: InvestorOrganizerRow[];
}) {
  const [mode, setMode] = useState<Mode>("all");
  const [type, setType] = useState<string>("");
  const [days, setDays] = useState<number>(120);
  const [events, setEvents] = useState<InvestorEventRow[]>(initialEvents);
  const [organizers, setOrganizers] =
    useState<InvestorOrganizerRow[]>(initialOrganizers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const firstRender = useRef(true);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // Refetch when a filter changes (the initial data is server-rendered with
  // the same defaults, so the first render skips the fetch).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    const params = new URLSearchParams({ mode, days: String(days) });
    if (type) params.set("type", type);
    fetch(`/api/investor-events?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          events?: InvestorEventRow[];
          organizers?: InvestorOrganizerRow[];
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setError(body.error ?? "Couldn't load events — please try again.");
        } else {
          setEvents(body.events ?? []);
          setOrganizers(body.organizers ?? []);
          setSelectedId(null);
        }
      })
      .catch((e: unknown) => {
        if (!active || (e instanceof DOMException && e.name === "AbortError"))
          return;
        setError("Network problem — check your connection and try again.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, type, days]);

  const organizersById = useMemo(() => {
    const map = new Map<string, InvestorOrganizerRow>();
    for (const o of organizers) map.set(o.id, o);
    return map;
  }, [organizers]);

  const showMap = mode !== "virtual";
  const mapEvents = useMemo(
    () =>
      events.filter(
        (e) => !e.is_virtual && e.latitude != null && e.longitude != null,
      ),
    [events],
  );

  function handleMarkerSelect(id: string) {
    setSelectedId(id);
    cardRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div>
      {/* Filter bar */}
      <div
        className="card card-pad"
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div
          style={{ display: "flex", gap: 6 }}
          role="group"
          aria-label="Where"
        >
          {MODE_LABELS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`btn sm ${mode === m.value ? "primary" : "ghost"}`}
              onClick={() => setMode(m.value)}
              style={{ fontSize: 12.5 }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          role="group"
          aria-label="Event type"
        >
          <TypeChip
            label="All types"
            active={type === ""}
            onClick={() => setType("")}
          />
          {Object.entries(EVENT_TYPE_LABELS)
            .filter(([value]) => value !== "other")
            .map(([value, label]) => (
              <TypeChip
                key={value}
                label={label}
                active={type === value}
                onClick={() => setType(type === value ? "" : value)}
              />
            ))}
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            color: "var(--muted)",
            marginLeft: "auto",
          }}
        >
          Show
          <select
            className="input"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: 140, fontSize: 12.5 }}
          >
            {DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Next {d} days
              </option>
            ))}
          </select>
        </label>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span>
          {busy
            ? "Updating…"
            : `Showing ${events.length.toLocaleString()} upcoming event${events.length === 1 ? "" : "s"}`}
        </span>
        {!busy && showMap && mapEvents.length > 0 && (
          <span>{mapEvents.length.toLocaleString()} on the map</span>
        )}
      </p>

      {error && (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>
        </div>
      )}

      {!error && events.length === 0 && !busy && (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
            No upcoming events match these filters. We pull events in from live
            sources every night, so new ones appear daily — try a longer time
            window, a different event type, or check back tomorrow.
          </p>
        </div>
      )}

      {(events.length > 0 || busy) && (
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "stretch",
            flexWrap: "wrap",
          }}
        >
          {showMap && (
            <div
              className="card"
              style={{
                flex: "1 1 460px",
                minWidth: 320,
                height: 600,
                overflow: "hidden",
              }}
            >
              <EventsMap
                events={mapEvents}
                selectedId={selectedId}
                onSelect={handleMarkerSelect}
              />
            </div>
          )}

          <div
            style={{
              flex: showMap ? "1 1 380px" : "1 1 100%",
              minWidth: 300,
              maxHeight: showMap ? 600 : undefined,
              overflowY: showMap ? "auto" : undefined,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {events.map((ev) => {
              const date = datePieces(ev.starts_at);
              const organizer = ev.organizer_id
                ? organizersById.get(ev.organizer_id)
                : undefined;
              const selected = ev.id === selectedId;
              return (
                <div
                  key={ev.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(ev.id, el);
                    else cardRefs.current.delete(ev.id);
                  }}
                  className="card card-pad"
                  onClick={() => setSelectedId(ev.id)}
                  style={{
                    display: "flex",
                    gap: 12,
                    outline: selected ? "2px solid var(--accent)" : "none",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      flexShrink: 0,
                      textAlign: "center",
                      paddingTop: 2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 19,
                        fontWeight: 700,
                        color: "var(--ink)",
                        lineHeight: 1.1,
                      }}
                    >
                      {date?.day ?? "—"}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      {date?.month ?? ""}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--ink)",
                        marginBottom: 4,
                      }}
                    >
                      {ev.title}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 9px",
                          borderRadius: 999,
                          background: "var(--accent-tint)",
                          color: "var(--accent)",
                        }}
                      >
                        {eventTypeLabel(ev.event_type)}
                      </span>
                      {ev.is_virtual && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 9px",
                            borderRadius: 999,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                          }}
                        >
                          Online
                        </span>
                      )}
                    </div>
                    {date && (
                      <p
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          marginBottom: 2,
                        }}
                      >
                        {date.full}
                        {date.time !== "00:00" ? `, ${date.time}` : ""}
                      </p>
                    )}
                    <p
                      style={{
                        fontSize: 12.5,
                        color: "var(--muted)",
                        marginBottom: 2,
                      }}
                    >
                      {locationLine(ev)}
                      {ev.price_text ? ` · ${ev.price_text}` : ""}
                    </p>
                    {(organizer || ev.organizer_name) && (
                      <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        Run by{" "}
                        {organizer ? (
                          <Link
                            href={`/investor-events/organizers/${organizer.slug}`}
                            style={{
                              color: "var(--accent)",
                              textDecoration: "none",
                            }}
                          >
                            {organizer.name}
                          </Link>
                        ) : (
                          ev.organizer_name
                        )}
                      </p>
                    )}
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
                          marginTop: 6,
                        }}
                      >
                        View event →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
