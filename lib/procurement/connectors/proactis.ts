import https from "node:https";
import tls from "node:tls";
import type {
  FetchSinceParams,
  SourceFetchResult,
  ProcurementSourceName,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// The Proactis API hosts (Public Contracts Scotland, Sell2Wales) serve a leaf
// certificate issued by "Sectigo Public Server Authentication CA DV R36" but
// FAIL TO SEND that intermediate in the TLS handshake, so Node rejects them with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE (curl tolerates it via its CA bundle). We supply
// the missing intermediate as an extra trust anchor ALONGSIDE Node's default roots
// and keep full verification on (no rejectUnauthorized:false). Valid to 2036-03-21.
// Source: http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
const SECTIGO_R36_INTERMEDIATE_PEM = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`;

// Node's default roots + the missing Sectigo intermediate. Full verification stays on.
const PROACTIS_CA: string[] = [
  ...tls.rootCertificates,
  SECTIGO_R36_INTERMEDIATE_PEM,
];

/**
 * GET JSON over HTTPS supplying the Sectigo intermediate the Proactis hosts omit.
 * rejectUnauthorized stays true (default) — this only completes the chain, it does
 * not weaken TLS. Throws on non-2xx, expired/invalid certs, timeouts, or non-JSON.
 */
function secureGetJson(url: string, timeoutMs: number): Promise<AnyRecord> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { Accept: "application/json" }, ca: PROACTIS_CA },
      (res) => {
        const status = res.statusCode ?? 0;
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => {
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("non-JSON response"));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}

/**
 * Optional fallback used when the primary API yields nothing for a whole month —
 * e.g. Sell2Wales' API host cert is expired, so it falls back to the monthly bulk
 * download (which returns every noticeType for the month). Must return OCDS
 * release objects. Called once per month, not per noticeType.
 */
export type ProactisMonthFallback = (month: string) => Promise<unknown[]>;

export interface ProactisConnectorConfig {
  sourceName: ProcurementSourceName;
  /** API host, e.g. https://api.publiccontractsscotland.gov.uk */
  apiBaseUrl: string;
  /** Proactis noticeType ids to iterate, e.g. [101,102,103,104]. */
  noticeTypes: number[];
  /** Optional month-level fallback (e.g. bulk download) when the API yields nothing. */
  monthFallback?: ProactisMonthFallback;
  /** Defensive cap on how many months a single window may enumerate. */
  maxMonths?: number;
}

const REQUEST_TIMEOUT_MS = 30_000;

/** "MM-YYYY" for the given UTC year + 0-based month. */
function monthKey(year: number, month0: number): string {
  return `${String(month0 + 1).padStart(2, "0")}-${year}`;
}

/**
 * Distinct months (newest first) covering [from, to], plus one extra previous
 * month for boundary safety. Dedup (content hash) makes the extra month harmless.
 */
export function enumerateMonths(
  from: Date,
  to: Date,
  maxMonths = 36,
): string[] {
  const months: string[] = [];
  let y = to.getUTCFullYear();
  let m = to.getUTCMonth();
  const fy = from.getUTCFullYear();
  const fm = from.getUTCMonth();
  while ((y > fy || (y === fy && m >= fm)) && months.length < maxMonths) {
    months.push(monthKey(y, m));
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  // one extra previous month (notices published right at a month boundary)
  if (months.length < maxMonths) months.push(monthKey(y, m));
  return months;
}

async function fetchMonthType(
  apiBaseUrl: string,
  month: string,
  noticeType: number,
): Promise<unknown[]> {
  const url = `${apiBaseUrl}/v1/Notices?dateFrom=${month}&outputType=0&noticeType=${noticeType}`;
  // Throws on non-2xx, HTML error pages, expired/invalid certs, or timeout.
  const payload = await secureGetJson(url, REQUEST_TIMEOUT_MS);
  return Array.isArray(payload.releases) ? payload.releases : [];
}

/**
 * Build a `fetchSince` for a Proactis/Millstream OCDS feed (Public Contracts
 * Scotland, Sell2Wales).
 *
 * These feeds have NO cursor pagination: you query one month
 * (`dateFrom=MM-YYYY`) per `noticeType`. We model ONE "page" as ONE month across
 * ALL noticeTypes, and walk months via the opaque `cursor` (the next month key).
 * One month per page keeps the page count ≤ the engine's backfill cap so no
 * notices are dropped mid-window.
 */
export function createProactisFetchSince(
  config: ProactisConnectorConfig,
): (params: FetchSinceParams) => Promise<SourceFetchResult> {
  return async function fetchSince({
    from,
    to,
    cursor,
  }: FetchSinceParams): Promise<SourceFetchResult> {
    const months = enumerateMonths(from, to, config.maxMonths ?? 36);
    if (months.length === 0) {
      return {
        sourceName: config.sourceName,
        rawItems: [],
        nextCursor: null,
        fetchedAt: new Date().toISOString(),
        hasMore: false,
      };
    }

    // cursor names the month to fetch on THIS call (null => newest in window).
    let idx = 0;
    if (cursor) {
      const found = months.indexOf(cursor);
      idx = found >= 0 ? found : 0; // stale cursor (window shifted) => restart
    }
    const month = months[idx];

    const rawItems: unknown[] = [];
    let failures = 0;
    let lastErr: unknown = null;
    for (const noticeType of config.noticeTypes) {
      try {
        rawItems.push(
          ...(await fetchMonthType(config.apiBaseUrl, month, noticeType)),
        );
      } catch (err) {
        lastErr = err;
        failures += 1;
      }
    }

    // If the API produced nothing for the month but at least one call failed,
    // try the month-level fallback (e.g. Sell2Wales bulk download) once.
    if (rawItems.length === 0 && failures > 0 && config.monthFallback) {
      try {
        rawItems.push(...(await config.monthFallback(month)));
        lastErr = null;
      } catch (fbErr) {
        lastErr = fbErr;
      }
    }

    // Nothing worked for this month — surface it so the engine records
    // last_error and the page loop stops (resumes next run).
    if (
      rawItems.length === 0 &&
      failures === config.noticeTypes.length &&
      lastErr
    ) {
      throw new Error(
        `${config.sourceName} ${month}: ${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`,
      );
    }

    const nextCursor = idx + 1 < months.length ? months[idx + 1] : null;
    return {
      sourceName: config.sourceName,
      rawItems,
      nextCursor,
      fetchedAt: new Date().toISOString(),
      hasMore: nextCursor != null,
    };
  };
}
