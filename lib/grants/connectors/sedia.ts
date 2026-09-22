import type {
  GrantSourceConnector,
  GrantFetchSinceParams,
  GrantFetchResult,
  NormalizedGrant,
  GrantStatus,
} from "../types";

// EU SEDIA / Horizon Europe — OPEN grant topics on the EC Funding & Tenders portal,
// via the official EC search API (anonymous "SEDIA" key, read-only, no auth). UK
// organisations can apply under the Horizon Europe association agreement.
//
// Request shape (verified live 2026-06-11): the endpoint is POST-only (GET = 405)
// and the body must be multipart/form-data — a plain JSON body is ignored or 400s.
// Form parts: `query` (Elasticsearch-style bool filter), `sort`, `languages`
// (without ["en"] every topic repeats once per EU language); text/pageSize/pageNumber
// ride on the query string. Each result's `metadata` holds string-array fields:
// identifier, title, deadlineDate (multi-entry for two-stage calls), startDate,
// status, descriptionByte (HTML), keywords, budgetOverview (a JSON string with
// min/maxContribution). rawItems = the per-record JSON (stored before normalisation)
// plus a top-level `id` so the sync engine's extractGrantId / delisting prune work.

const BASE_URL =
  "https://ec.europa.eu/info/funding-tenders/opportunities/portal";
const API_URL = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
const USER_AGENT =
  process.env.GRANTS_USER_AGENT ??
  "Mozilla/5.0 (compatible; AIBidManager/1.0; +https://ai-bid-manager.vercel.app)";
const PAGE_SIZE = 50;
const FRAMEWORK_HORIZON_EUROPE = "43108390";
const STATUS_OPEN = "31094501";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

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

/** Portal topic page for an identifier (humans apply here, not the JSON data URL). */
export function topicUrl(identifier: string): string {
  return `${BASE_URL}/screen/opportunities/topic-details/${identifier}`;
}

/** First entry of SEDIA's string-array metadata fields. */
function first(value: unknown): string | null {
  if (Array.isArray(value)) {
    const v = value[0];
    return typeof v === "string" && v ? v : null;
  }
  return typeof value === "string" && value ? value : null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveStatus(
  openAt: string | null,
  deadlineAt: string | null,
): GrantStatus {
  const now = Date.now();
  const o = openAt ? Date.parse(openAt) : NaN;
  const c = deadlineAt ? Date.parse(deadlineAt) : NaN;
  if (!Number.isNaN(o) && now < o) return "forthcoming";
  if (!Number.isNaN(c) && now > c) return "closed";
  return "open";
}

/** Min/max contribution across budgetOverview's per-action budget rows (EUR). */
function parseBudget(budgetOverview: string | null): {
  amountMin: number | null;
  amountMax: number | null;
} {
  if (!budgetOverview) return { amountMin: null, amountMax: null };
  try {
    const parsed = JSON.parse(budgetOverview) as AnyRecord;
    const actions = Object.values(parsed?.budgetTopicActionMap ?? {}).flat();
    let min: number | null = null;
    let max: number | null = null;
    for (const a of actions as AnyRecord[]) {
      if (typeof a?.minContribution === "number" && a.minContribution > 0) {
        min =
          min === null ? a.minContribution : Math.min(min, a.minContribution);
      }
      if (typeof a?.maxContribution === "number" && a.maxContribution > 0) {
        max =
          max === null ? a.maxContribution : Math.max(max, a.maxContribution);
      }
    }
    return { amountMin: min, amountMax: max };
  } catch {
    return { amountMin: null, amountMax: null };
  }
}

async function searchPage(page: number, pageSize: number): Promise<AnyRecord> {
  const query = {
    bool: {
      must: [
        { terms: { type: ["1", "2"] } }, // grant topics (8 = tenders — excluded)
        { terms: { status: [STATUS_OPEN] } },
        { term: { programmePeriod: "2021 - 2027" } },
        { terms: { frameworkProgramme: [FRAMEWORK_HORIZON_EUROPE] } },
      ],
    },
  };
  const form = new FormData();
  form.append(
    "query",
    new Blob([JSON.stringify(query)], { type: "application/json" }),
  );
  form.append(
    "sort",
    new Blob([JSON.stringify({ field: "deadlineDate", order: "ASC" })], {
      type: "application/json",
    }),
  );
  form.append(
    "languages",
    new Blob([JSON.stringify(["en"])], { type: "application/json" }),
  );

  const url = `${API_URL}?apiKey=SEDIA&text=***&pageSize=${pageSize}&pageNumber=${page}`;
  const res = await fetch(url, {
    method: "POST",
    // No explicit Content-Type: fetch sets the multipart boundary from FormData.
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`SEDIA search API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as AnyRecord;
}

export const sediaHorizonConnector: GrantSourceConnector = {
  sourceName: "sedia-horizon",
  displayName: "EU Funding & Tenders (Horizon Europe)",
  baseUrl: BASE_URL,
  listsAllOpenCalls: true, // open-status filter; a complete run pages the full set

  async fetchSince(params: GrantFetchSinceParams): Promise<GrantFetchResult> {
    const page = parseCursor(params.cursor);
    const pageSize = Math.min(
      Math.max(params.limit ?? PAGE_SIZE, 1),
      PAGE_SIZE,
    );

    const data = await searchPage(page, pageSize);
    const results: AnyRecord[] = Array.isArray(data.results)
      ? data.results
      : [];
    // Store the per-record JSON as-is, plus a stable top-level id (the topic
    // identifier) for the sync engine's raw-payload bookkeeping.
    const rawItems = results.map((r) => ({
      ...r,
      id: first(r?.metadata?.identifier) ?? r?.reference ?? null,
    }));

    const total = Number(data.totalResults ?? 0);
    const hasMore = page * pageSize < total && results.length > 0;

    return {
      sourceName: "sedia-horizon",
      rawItems,
      nextCursor: hasMore ? JSON.stringify({ page: page + 1 }) : null,
      fetchedAt: new Date().toISOString(),
      hasMore,
    };
  },

  async normalize(raw: unknown): Promise<NormalizedGrant[]> {
    const r = raw as AnyRecord;
    const md = (r?.metadata ?? {}) as AnyRecord;
    const identifier =
      first(md.identifier) ??
      (typeof r?.id === "string" && r.id ? r.id : null) ??
      (typeof r?.reference === "string" && r.reference ? r.reference : null);
    const title =
      first(md.title) ??
      (typeof r?.summary === "string" && r.summary ? r.summary : null) ??
      (typeof r?.content === "string" && r.content ? r.content : null);
    if (!identifier || !title) return [];

    const openAt = toIso(first(md.startDate));
    // deadlineDate is multi-entry for two-stage calls — the LAST is the final deadline.
    const deadlines: string[] = Array.isArray(md.deadlineDate)
      ? md.deadlineDate.filter(
          (d: unknown): d is string => typeof d === "string",
        )
      : [];
    const deadlineAt = toIso(deadlines[deadlines.length - 1] ?? null);

    const descriptionHtml = first(md.descriptionByte);
    const { amountMin, amountMax } = parseBudget(first(md.budgetOverview));

    // keywords mixes the call/topic identifiers with real subject keywords.
    const themes: string[] = Array.isArray(md.keywords)
      ? [
          ...new Set(
            (md.keywords as unknown[])
              .filter((k): k is string => typeof k === "string")
              .filter((k) => !/^HORIZON-/i.test(k)),
          ),
        ]
      : [];

    const url = topicUrl(identifier);
    const actionType = first(md.typesOfAction);

    return [
      {
        sourceName: "sedia-horizon",
        sourceNoticeId: identifier,
        sourceUrl: url,
        applicationUrl: url, // apply via the portal topic page
        title,
        description: descriptionHtml ? stripTags(descriptionHtml) : null,
        funderName: "European Commission — Horizon Europe",
        funderId: null,
        funderRegion: "European Union",
        fundingType: "grant",
        amountMin,
        amountMax,
        currency: "EUR",
        openAt,
        deadlineAt,
        status: deriveStatus(openAt, deadlineAt),
        themes,
        sectors: [],
        regions: ["International"],
        eligibilityText: [
          "Open to UK organisations (Horizon Europe association).",
          actionType ? `Type of action: ${actionType}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        eligibleOrgTypes: [], // consortia rules vary per topic — no hard-stop
        matchFundingRequired: false,
        beneficiaries: [],
        documents: [],
        publishedAt: openAt,
        rawJson: raw,
      },
    ];
  },
};
