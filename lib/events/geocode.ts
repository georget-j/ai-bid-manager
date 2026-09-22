// Free, no-auth geocoding for putting UK investor events on a map.
//
//   1. geocodePostcode — postcodes.io (official ONS data, no key, generous limits).
//   2. geocodeVenue   — Nominatim (OpenStreetMap) fallback for events that have a
//      venue/city but no postcode. Nominatim's usage policy requires an
//      identifying User-Agent and ≤1 request/second — CALLERS MUST PACE
//      geocodeVenue calls ≥1s apart (the sync path geocodes inline per event,
//      which is naturally paced; do not fan these out in parallel).
//
// Both helpers return { lat, lng } | null and NEVER throw — geocoding is
// best-effort decoration, a failure must not fail ingestion. Results (including
// definitive "not found"s) are memoised in an in-process Map so re-syncs of the
// same venues don't re-hit the APIs; transient failures (timeouts, 5xx) are NOT
// cached so they retry next time.

const USER_AGENT =
  process.env.EVENTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; AIBidManager/1.0; +https://ai-bid-manager.vercel.app)";
const TIMEOUT_MS = 10_000;

export interface GeoPoint {
  lat: number;
  lng: number;
}

const cache = new Map<string, GeoPoint | null>();

/** Test hook: reset the in-process memoisation between test cases. */
export function clearGeocodeCache(): void {
  cache.clear();
}

/**
 * Geocode a UK postcode via postcodes.io. Returns null for unknown postcodes
 * and on any failure.
 */
export async function geocodePostcode(
  postcode: string,
): Promise<GeoPoint | null> {
  const normalized = postcode.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  const key = `pc:${normalized}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(normalized)}`,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.status === 404) {
      cache.set(key, null); // definitive: not a real postcode
      return null;
    }
    if (!res.ok) return null; // transient — retry next time
    const body = (await res.json()) as {
      result?: { latitude?: unknown; longitude?: unknown };
    };
    const lat = body?.result?.latitude;
    const lng = body?.result?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") {
      cache.set(key, null);
      return null;
    }
    const point = { lat, lng };
    cache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

/**
 * Geocode a venue by name (+ optional city) via Nominatim, restricted to GB.
 * Fallback for events without a postcode. Callers must pace calls ≥1s apart
 * (Nominatim usage policy). Returns null when nothing matches or on failure.
 */
export async function geocodeVenue(
  name: string,
  city?: string | null,
): Promise<GeoPoint | null> {
  const q = [name, city]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  const key = `venue:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "gb");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null; // transient — retry next time
    const body = (await res.json()) as Array<{ lat?: unknown; lon?: unknown }>;
    const first = Array.isArray(body) ? body[0] : null;
    if (!first) {
      cache.set(key, null); // definitive: no match in GB
      return null;
    }
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      cache.set(key, null);
      return null;
    }
    const point = { lat, lng };
    cache.set(key, point);
    return point;
  } catch {
    return null;
  }
}
