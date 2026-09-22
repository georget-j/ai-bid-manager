import { classifyEventType, classifyVirtual } from "../classify";
import { geocodePostcode } from "../geocode";
import type {
  EventFetchResult,
  EventFetchSinceParams,
  InvestorEventSourceConnector,
  NormalizedInvestorEvent,
} from "../types";

// UKBAA (UK Business Angels Association) — upcoming angel/investor events from
// ukbaa.org.uk/events/. The site is plain server-rendered WordPress (no JS
// needed): ~12 events per listing page, paginated at /events/page/N/ (~3
// pages), with detail pages at /events/{slug}/ carrying the date/time, venue
// address (venue name, street, city, postcode as <br>-separated lines) and the
// event's category/region tags in plain HTML. A region tag of "Online" (or an
// "Online via Zoom"-style venue line) marks virtual events.
//
// fetchSince walks one listing page per call (cursor = JSON {page}), then
// fetches each event's detail page politely (identifying UA, 150ms pacing, 20s
// timeouts) and stores the FULL detail HTML as the raw payload (raw before
// normalisation, per repo policy) — normalize stays pure apart from a
// best-effort postcode geocode. All parsing is defensive regex over real
// markup (fixtures in tests/fixtures/ukbaa-*.html): if the template drifts we
// still ingest whatever parsed rather than throwing.

const BASE_URL = "https://ukbaa.org.uk";
// Plain identifying UA — ukbaa.org.uk's WAF 403s the "Mozilla/5.0 (compatible;
// …)" crawler pattern but accepts an honestly-named agent (verified live).
const USER_AGENT =
  process.env.EVENTS_USER_AGENT ??
  "AIBidManager/1.0 (+https://ai-bid-manager.vercel.app)";
const REQUEST_DELAY_MS = 150; // polite pacing between detail-page fetches
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_DETAIL_PER_PAGE = 12; // safety cap on detail fetches per listing page
const MAX_DESCRIPTION_CHARS = 4_000;

// Raw payload stored per event: the detail page's full HTML plus the stable
// slug (`id` lets the sync engine's extractEventId see it) and the listing
// title as a fallback when the detail fetch failed.
export interface UkbaaEventRaw {
  id: string; // = slug, the stable sourceEventId
  url: string;
  title: string | null; // listing-page title (fallback when detail parse fails)
  html: string | null; // full detail-page HTML (null when the detail fetch failed)
  listedAt: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`UKBAA ${res.status} for ${url}`);
  }
  return res.text();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&quot;/g, '"');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Listing URL (page 1 has no /page/ segment). */
export function listingUrl(page: number): string {
  return page <= 1 ? `${BASE_URL}/events/` : `${BASE_URL}/events/page/${page}/`;
}

/** Parse the JSON {page} cursor (resilient: bare numbers and garbage → page 1). */
export function parseCursor(cursor?: string | null): number {
  if (!cursor) return 1;
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (typeof parsed === "number" && parsed >= 1) return Math.floor(parsed);
    if (parsed && typeof parsed === "object") {
      const page = Number((parsed as { page?: unknown }).page);
      if (Number.isFinite(page) && page >= 1) return Math.floor(page);
    }
  } catch {
    const n = Number(cursor);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return 1;
}

// Non-event /events/ paths that could appear on listing pages.
const NON_EVENT_SLUGS = new Set(["page", "feed"]);

/** Extract event detail URLs (+ listing titles where present) from a listing page. */
export function extractEventStubs(
  html: string,
): Array<{ url: string; slug: string; title: string | null }> {
  const out: Array<{ url: string; slug: string; title: string | null }> = [];
  const seen = new Set<string>();
  // Primary: the listing's titled entry links (<a href=".../events/{slug}/"><h5>…</h5>).
  const titledRe =
    /<a[^>]*href="https:\/\/(?:www\.)?ukbaa\.org\.uk\/events\/([a-z0-9][a-z0-9_-]*)\/?"[^>]*>\s*<h5>([\s\S]*?)<\/h5>/gi;
  let m: RegExpExecArray | null;
  while ((m = titledRe.exec(html)) !== null) {
    const [, slug, titleHtml] = m;
    if (NON_EVENT_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      url: `${BASE_URL}/events/${slug}/`,
      slug,
      title: stripTags(titleHtml) || null,
    });
  }
  // Fallback (template drift): any plain event link not already captured.
  const plainRe =
    /href=["']https:\/\/(?:www\.)?ukbaa\.org\.uk\/events\/([a-z0-9][a-z0-9_-]*)\/?["']/gi;
  while ((m = plainRe.exec(html)) !== null) {
    const slug = m[1];
    if (NON_EVENT_SLUGS.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ url: `${BASE_URL}/events/${slug}/`, slug, title: null });
  }
  return out;
}

/** True when the listing's pagination nav has a "next page" link. */
export function hasNextListingPage(html: string): boolean {
  return /class=["'][^"']*\bnext\b[^"']*page-numbers[^"']*["']/.test(html);
}

/** Text of the detail page's taxonomy anchor (class='category' / class='region'). */
function taxonomyAnchor(html: string, cls: string): string | null {
  const re = new RegExp(`class=['"]${cls}['"][^>]*>([^<]+)<`, "i");
  const m = re.exec(html);
  return m ? stripTags(m[1]) || null : null;
}

/** <h1> title (entities decoded). */
function parseTitle(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripTags(m[1]) || null : null;
}

/** Description: the content between the </h1> and the social-share block. */
function parseDescription(html: string): string | null {
  const h1End = html.search(/<\/h1>/i);
  if (h1End === -1) return null;
  const after = html.slice(h1End + 5);
  const shareIdx = after.indexOf('<div class="share">');
  const chunk =
    shareIdx === -1 ? after.slice(0, 12_000) : after.slice(0, shareIdx);
  const text = stripTags(chunk);
  return text ? text.slice(0, MAX_DESCRIPTION_CHARS) : null;
}

/** Venue Address sidebar lines, e.g. ["Potter Clarkson", "Mount Street", "Nottingham", "NG1 6HQ"]. */
function parseVenueLines(html: string): string[] {
  const m = html.match(
    /<h6[^>]*>\s*Venue Address\s*<\/h6>\s*<p>([\s\S]*?)<\/p>/i,
  );
  if (!m) return [];
  return m[1]
    .split(/<br\s*\/?>/i)
    .map((line) => stripTags(line))
    .filter(Boolean);
}

const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

interface ParsedTime {
  h: number;
  m: number;
}

/** All HH:MM times (24h, or with am/pm) in the sidebar's time text, in order. */
function parseTimes(text: string): ParsedTime[] {
  const out: ParsedTime[] = [];
  const re = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const meridiem = (m[3] ?? "").toLowerCase();
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    if (h <= 23 && min <= 59) out.push({ h, m: min });
  }
  return out;
}

/** All "dd Month yyyy" dates in the sidebar's date text, in order. */
function parseDates(text: string): string[] {
  return [...text.matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)].map(
    (m) => `${m[1]} ${m[2]} ${m[3]}`,
  );
}

/**
 * "11 June 2026" + {h:14,m:0} → ISO. UKBAA shows UK local time with no zone;
 * treated as UTC (at most an hour off during BST — fine for an events list),
 * same as the UKRI grants connector. Date-only falls back to midday.
 */
function toUtcIso(dateText: string, time?: ParsedTime | null): string | null {
  const hh = String(time?.h ?? 12).padStart(2, "0");
  const mm = String(time?.m ?? 0).padStart(2, "0");
  const d = new Date(`${dateText} ${hh}:${mm}:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Sidebar "Date and time" block → starts/ends ISO strings. */
function parseStartEnd(html: string): {
  startsAt: string | null;
  endsAt: string | null;
} {
  const dateM = html.match(/<div class="date">\s*([\s\S]*?)<\/div>/i);
  const timeM = html.match(/<div class="time">\s*([\s\S]*?)<\/div>/i);
  const dates = parseDates(dateM ? stripTags(dateM[1]) : "");
  const times = parseTimes(timeM ? stripTags(timeM[1]) : "");
  if (dates.length === 0) return { startsAt: null, endsAt: null };

  const startsAt = toUtcIso(dates[0], times[0] ?? null);
  // End: second listed date (multi-day) or the same day's end time.
  const endDate = dates[1] ?? dates[0];
  let endsAt =
    times[1] || dates[1] ? toUtcIso(endDate, times[1] ?? null) : null;
  if (startsAt && endsAt && endsAt <= startsAt) {
    // "18:00 - 01:00" style overnight events roll into the next day.
    const rolled = new Date(new Date(endsAt).getTime() + 24 * 60 * 60 * 1000);
    endsAt = rolled.toISOString();
  }
  return { startsAt, endsAt };
}

export const ukbaaConnector: InvestorEventSourceConnector = {
  sourceName: "ukbaa",
  displayName: "UKBAA — UK Business Angels Association",
  baseUrl: BASE_URL,

  async fetchSince(params: EventFetchSinceParams): Promise<EventFetchResult> {
    const page = parseCursor(params.cursor);
    if (page > 1) await sleep(REQUEST_DELAY_MS);

    const listHtml = await getHtml(listingUrl(page));
    const cap = Math.min(
      params.limit ?? MAX_DETAIL_PER_PAGE,
      MAX_DETAIL_PER_PAGE,
    );
    const stubs = extractEventStubs(listHtml).slice(0, cap);

    const items: UkbaaEventRaw[] = [];
    for (const stub of stubs) {
      const base = {
        id: stub.slug,
        url: stub.url,
        title: stub.title,
        listedAt: new Date().toISOString(),
      };
      try {
        await sleep(REQUEST_DELAY_MS);
        items.push({ ...base, html: await getHtml(stub.url) });
      } catch {
        // Detail fetch failed — keep the stub (listing title only) so the
        // event still ingests minimally and retries on the next sync.
        items.push({ ...base, html: null });
      }
    }

    const hasMore = hasNextListingPage(listHtml) && stubs.length > 0;
    return {
      sourceName: "ukbaa",
      rawItems: items,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedInvestorEvent[]> {
    const r = raw as Partial<UkbaaEventRaw>;
    const slug =
      (typeof r.id === "string" && r.id) ||
      (typeof r.url === "string" &&
        (r.url.match(/\/events\/([a-z0-9][a-z0-9_-]*)\/?/i)?.[1] ?? "")) ||
      "";
    if (!slug) return [];
    const html = typeof r.html === "string" ? r.html : "";
    const eventUrl =
      typeof r.url === "string" && r.url
        ? r.url
        : `${BASE_URL}/events/${slug}/`;

    // Defensive: every field below is optional — if the template has changed we
    // still return an event with whatever parsed (title falls back to the listing).
    const title = parseTitle(html) ?? (r.title || null);
    if (!title) return [];

    const category = taxonomyAnchor(html, "category");
    const regionTag = taxonomyAnchor(html, "region");
    const description = parseDescription(html);
    const { startsAt, endsAt } = parseStartEnd(html);

    const venueLines = parseVenueLines(html);
    const venueText = venueLines.join(", ");
    // Virtual = the "Online" region tag, or an "Online via Zoom"-style venue line.
    const venueVirtual = classifyVirtual(venueText);
    const isVirtual =
      regionTag?.toLowerCase() === "online" || venueVirtual.isVirtual;

    let venueName: string | null = null;
    let address: string | null = null;
    let city: string | null = null;
    let postcode: string | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (!isVirtual && venueLines.length > 0) {
      venueName = venueLines[0];
      const last = venueLines[venueLines.length - 1];
      const pcMatch = last.match(UK_POSTCODE_RE);
      const middle = venueLines.slice(1, pcMatch ? -1 : undefined);
      if (pcMatch) postcode = pcMatch[1].toUpperCase();
      if (middle.length > 0) {
        // Last middle line is the town/city, anything before it is the street.
        city = middle[middle.length - 1];
        address = middle.slice(0, -1).join(", ") || null;
      }
      if (postcode) {
        const point = await geocodePostcode(postcode);
        if (point) {
          latitude = point.lat;
          longitude = point.lng;
        }
      }
    }

    return [
      {
        sourceName: "ukbaa",
        sourceEventId: slug,
        title,
        description,
        eventUrl,
        startsAt,
        endsAt,
        isVirtual,
        virtualPlatform: isVirtual ? venueVirtual.platform : null,
        venueName,
        address,
        city,
        postcode,
        region:
          regionTag && regionTag.toLowerCase() !== "online" ? regionTag : null,
        latitude,
        longitude,
        // The category tag ("Pitching events", "Webinars", …) is a strong hint
        // when the title/description say nothing — fed in as description text.
        eventType: classifyEventType(
          title,
          [category, description].filter(Boolean).join(" — ") || null,
        ),
        organizerName: "UKBAA",
        organizerUrl: `${BASE_URL}/events/`,
        priceText: null,
      },
    ];
  },
};
