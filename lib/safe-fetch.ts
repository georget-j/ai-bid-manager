// SSRF-guarded fetch for URLs taken from EXTERNAL data (scraped grant/tender
// pages). A poisoned link must never make the server fetch localhost, cloud
// metadata (169.254.169.254) or other internal hosts.
//
// Guards:
//   1. http(s) schemes only.
//   2. Literal IP hostnames are checked directly (the WHATWG URL parser already
//      canonicalises decimal/octal/hex IPv4 forms like http://2130706433/).
//   3. Hostnames are resolved via dns.lookup({ all: true }) and rejected if ANY
//      resolved address is loopback, private (RFC 1918), link-local/metadata,
//      unique-local or unspecified.
//   4. Redirects are followed MANUALLY (up to 5 hops), re-validating every
//      hop's host the same way — `redirect: "follow"` would bypass the guard.
//
// Limitations (acceptable for these best-effort ingestion paths): validation
// happens at lookup time, so a DNS-rebinding attacker with a near-zero TTL
// could still race the subsequent fetch's own resolution. Callers only send
// non-sensitive headers (UA/Accept), so headers are not stripped on
// cross-origin redirects. Timeouts and size caps stay in the callers.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** 0/8, 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 — from octets. */
function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // "this network", incl. 0.0.0.0
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  return false;
}

/** Expand an IPv6 literal (incl. "::" shorthand and embedded IPv4 tail) into 8 groups. */
function parseIPv6Groups(ip: string): number[] | null {
  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1) -> two trailing 16-bit groups.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = tail.split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => Number.isNaN(n) || n > 255)) {
      return null;
    }
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    ip = `${ip.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const all = [...left, ...Array<string>(fill).fill("0"), ...right];
  if (all.length !== 8) return null;
  const groups = all.map((g) => parseInt(g, 16));
  return groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)
    ? null
    : groups;
}

/**
 * True when `ip` is an IP literal we must never fetch: loopback (127/8, ::1),
 * private (10/8, 172.16/12, 192.168/16, fc00::/7), link-local/metadata
 * (169.254/16, fe80::/10) or unspecified (0.0.0.0/8, ::). IPv4-mapped IPv6
 * addresses are checked against the IPv4 rules. Non-IP strings return false —
 * hostnames are resolved (and their addresses checked) by safeFetch.
 */
export function isPrivateAddress(ip: string): boolean {
  const zone = ip.indexOf("%"); // strip zone index (fe80::1%en0)
  const bare = zone === -1 ? ip : ip.slice(0, zone);
  const version = isIP(bare);

  if (version === 4) {
    return isPrivateIPv4(bare.split(".").map(Number));
  }

  if (version === 6) {
    const groups = parseIPv6Groups(bare.toLowerCase());
    if (!groups) return true; // unparseable despite isIP() — fail closed
    const headIsZero = groups.slice(0, 7).every((g) => g === 0);
    if (headIsZero && (groups[7] === 0 || groups[7] === 1)) return true; // :: and ::1
    if ((groups[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((groups[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
      // IPv4-mapped (::ffff:a.b.c.d) — apply the IPv4 rules.
      return isPrivateIPv4([
        groups[6] >> 8,
        groups[6] & 0xff,
        groups[7] >> 8,
        groups[7] & 0xff,
      ]);
    }
    return false;
  }

  return false; // not an IP literal
}

/** Throw unless the URL is http(s) and its host (or every resolved address) is public. */
async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Blocked URL (unsupported scheme): ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, ""); // IPv6 literals are bracketed
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error(`Blocked URL (private address): ${host}`);
    }
    return;
  }
  // DNS failures propagate — they degrade exactly like a failed fetch.
  const addresses = await lookup(host, { all: true });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(`Blocked URL (resolves to private address): ${host}`);
    }
  }
}

/**
 * fetch() for externally-sourced URLs. Rejects non-http(s) schemes and hosts
 * that are (or resolve to) loopback/private/link-local/metadata addresses,
 * following redirects manually (max 5 hops) so every hop is re-validated.
 *
 * The caller's init (headers, AbortSignal/timeout) is passed through to every
 * hop; `redirect` is always overridden to "manual". Callers here only GET, so
 * no method rewriting is needed on 303s.
 */
export async function safeFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  let url = new URL(typeof input === "string" ? input : input.href);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(res.status)) return res;
    const location = res.headers.get("location");
    if (!location) return res; // malformed redirect — let the caller handle the 3xx
    if (res.body) await res.body.cancel().catch(() => {});
    url = new URL(location, url);
  }
  throw new Error(`Blocked URL (too many redirects): ${url.href}`);
}
