// Sell2Wales monthly bulk-download fallback.
//
// Used when the primary Sell2Wales OCDS API (api.sell2wales.gov.wales) is
// unreachable (e.g. an expired leaf cert). The public download page is an ASP.NET
// WebForms postback on the www host (valid cert):
//   GET  /Notice/Download/Download.aspx  -> hidden __VIEWSTATE / __EVENTVALIDATION
//        + a ddDateRange <option> per month
//   POST same URL with rblCollectionType=0 (list by month+type),
//        rblOutputType=0 (OCDS), rblDownloadType=0 (JSON), the exact ddDateRange
//        option value, and one ddlNoticeTypes (OJEU F-type) -> an OCDS release
//        package (JSON). We request the opportunity/award F-types and concatenate.
//
// NOTE: event validation REQUIRES the EXACT rendered option value (the current
// month's range ends at the latest data date, not the 30th), and the POST must
// carry the session cookie from the GET.

const DOWNLOAD_URL =
  process.env.SELL2WALES_DOWNLOAD_URL ??
  "https://www.sell2wales.gov.wales/Notice/Download/Download.aspx";

// OJEU F-type ids on the download form that carry opportunities + awards
// (F1 PIN, F2 contract notice, F3 award, F5/F6 utilities, F21/F22 social & other).
const BULK_NOTICE_FTYPES = [1, 2, 3, 5, 6, 21, 22];

const REQUEST_TIMEOUT_MS = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function hiddenField(html: string, name: string): string {
  const re = new RegExp(
    `name="${name.replace(/[$]/g, "\\$")}"[^>]*value="([^"]*)"`,
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : "";
}

/** "MM-YYYY" -> the exact ddDateRange option value on the page, or null if absent. */
function findMonthOption(html: string, month: string): string | null {
  const [mm, yyyy] = month.split("-");
  if (!mm || !yyyy) return null;
  const prefix = `${yyyy}-${mm}-01 00:00:00`;
  const re = new RegExp(`value="(${prefix.replace(/[-]/g, "\\-")}\\|[^"]*)"`);
  const m = html.match(re);
  return m ? m[1] : null;
}

async function withTimeout<T>(
  p: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Download every opportunity/award F-type for one month and return the
 * concatenated OCDS releases. Tolerates per-type failures; throws only if the
 * page itself can't be loaded.
 */
export async function fetchSell2WalesMonthBulk(
  month: string,
): Promise<unknown[]> {
  // 1) GET the form to capture viewstate + session cookie + the month option.
  const getRes = await withTimeout((signal) =>
    fetch(DOWNLOAD_URL, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
      signal,
    }),
  );
  if (!getRes.ok) {
    throw new Error(`Sell2Wales download page HTTP ${getRes.status}`);
  }
  const cookie = (getRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const html = await getRes.text();

  const dateOption = findMonthOption(html, month);
  if (!dateOption) {
    // The month isn't offered (e.g. too old) — nothing to download, not an error.
    return [];
  }

  const base = {
    __VIEWSTATE: hiddenField(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hiddenField(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hiddenField(html, "__EVENTVALIDATION"),
    __PREVIOUSPAGE: hiddenField(html, "__PREVIOUSPAGE"),
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    ctl00$MainBody$rblCollectionType: "0", // list by month + type
    ctl00$MainBody$ddDateRange: dateOption,
    ctl00$MainBody$rblOutputType: "0", // OCDS
    ctl00$MainBody$rblDownloadType: "0", // JSON
    ctl00$MainBody$buttonDownload: "Download",
  };

  const releases: unknown[] = [];
  for (const ftype of BULK_NOTICE_FTYPES) {
    const body = new URLSearchParams({
      ...base,
      ctl00$MainBody$ddlNoticeTypes: String(ftype),
    }).toString();
    try {
      const res = await withTimeout((signal) =>
        fetch(DOWNLOAD_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json, text/html",
            ...(cookie ? { Cookie: cookie } : {}),
            Referer: DOWNLOAD_URL,
          },
          body,
          signal,
        }),
      );
      if (!res.ok) continue;
      const text = await res.text();
      const payload = JSON.parse(text) as AnyRecord; // throws on the HTML error page
      if (Array.isArray(payload.releases)) releases.push(...payload.releases);
    } catch {
      // Per-type failure (HTML error page / parse) — skip; other types may work.
    }
  }
  return releases;
}
