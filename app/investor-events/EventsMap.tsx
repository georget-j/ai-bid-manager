"use client";

// All leaflet imports live in this file only — leaflet touches `window` at
// import time, so EventsExplorer loads this component with next/dynamic and
// ssr disabled. Do not import this module from server code.

import { useMemo } from "react";
import { divIcon, latLngBounds } from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { InvestorEventRow } from "@/lib/events/types";
import { eventTypeLabel } from "./EventsExplorer";

// Initial view: the whole UK.
const UK_BOUNDS = latLngBounds([49.9, -8.6], [60.9, 1.8]);

// Volume is low in v1, so no clustering — but cap markers defensively.
const MAX_MARKERS = 300;

// Inline SVG pin via divIcon — leaflet's default icon assets break under
// bundlers (the PNG URLs don't resolve), so we never touch them.
function pinSvg(fill: string): string {
  return (
    `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M13 1C6.7 1 1.5 6.2 1.5 12.5 1.5 21 13 33 13 33s11.5-12 11.5-20.5C24.5 6.2 19.3 1 13 1z" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>` +
    `<circle cx="13" cy="12.5" r="4.5" fill="#ffffff"/>` +
    `</svg>`
  );
}

function makePin(fill: string) {
  return divIcon({
    className: "", // suppress leaflet's default divIcon box styling
    html: pinSvg(fill),
    iconSize: [26, 34],
    iconAnchor: [13, 33],
    popupAnchor: [0, -30],
  });
}

const PIN = makePin("#1f4347"); // var(--accent) resolved — CSS vars can't reach divIcon HTML reliably
const PIN_SELECTED = makePin("#b45309");

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return time === "00:00" ? date : `${date}, ${time}`;
}

export default function EventsMap({
  events,
  selectedId,
  onSelect,
}: {
  events: InvestorEventRow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const markers = useMemo(
    () =>
      events
        .filter((e) => e.latitude != null && e.longitude != null)
        .slice(0, MAX_MARKERS),
    [events],
  );

  return (
    <MapContainer
      bounds={UK_BOUNDS}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((ev) => (
        <Marker
          key={ev.id}
          position={[ev.latitude as number, ev.longitude as number]}
          icon={ev.id === selectedId ? PIN_SELECTED : PIN}
          eventHandlers={{ click: () => onSelect?.(ev.id) }}
        >
          <Popup>
            <div style={{ minWidth: 180, maxWidth: 240 }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 4px" }}>
                {ev.title}
              </p>
              {ev.starts_at && (
                <p style={{ fontSize: 12, margin: "0 0 2px" }}>
                  {formatWhen(ev.starts_at)}
                </p>
              )}
              {(ev.venue_name || ev.city) && (
                <p style={{ fontSize: 12, margin: "0 0 2px" }}>
                  {[ev.venue_name, ev.city].filter(Boolean).join(", ")}
                </p>
              )}
              <p
                style={{ fontSize: 11.5, color: "#6b7280", margin: "0 0 6px" }}
              >
                {eventTypeLabel(ev.event_type)}
              </p>
              {ev.event_url && (
                <a
                  href={ev.event_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12.5 }}
                >
                  View event →
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
