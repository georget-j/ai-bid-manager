/**
 * Unit tests for lib/safe-fetch.ts (SSRF guard, S-017).
 *
 * No network calls: isPrivateAddress is pure, and safeFetch's scheme /
 * literal-IP rejections throw before any DNS lookup or fetch. Redirect
 * handling is exercised with a stubbed global fetch using documentation-range
 * (203.0.113.0/24) literals, which are never routed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { safeFetch, isPrivateAddress } from "../lib/safe-fetch";

// ── isPrivateAddress ─────────────────────────────────────────────────────────

describe("isPrivateAddress", () => {
  it("blocks IPv4 loopback (127.0.0.0/8)", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.255.255.255")).toBe(true);
  });

  it("blocks RFC 1918 private ranges", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.255.255.255")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.31.255.255")).toBe(true);
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("192.168.255.255")).toBe(true);
  });

  it("does not block neighbours of 172.16/12", () => {
    expect(isPrivateAddress("172.15.255.255")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
  });

  it("blocks link-local / cloud metadata (169.254.0.0/16)", () => {
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("169.254.0.1")).toBe(true);
  });

  it("blocks the unspecified network (0.0.0.0/8)", () => {
    expect(isPrivateAddress("0.0.0.0")).toBe(true);
    expect(isPrivateAddress("0.1.2.3")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("51.140.0.1")).toBe(false);
    expect(isPrivateAddress("192.167.0.1")).toBe(false);
    expect(isPrivateAddress("169.253.0.1")).toBe(false);
  });

  it("blocks IPv6 loopback and unspecified", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isPrivateAddress("::")).toBe(true);
  });

  it("blocks IPv6 link-local (fe80::/10), with and without zone index", () => {
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("febf::1")).toBe(true); // upper edge of /10
    expect(isPrivateAddress("fe80::1%en0")).toBe(true);
  });

  it("blocks IPv6 unique-local (fc00::/7)", () => {
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fd12:3456::1")).toBe(true);
    expect(isPrivateAddress("fe00::1")).toBe(false); // just outside /7
  });

  it("applies IPv4 rules to IPv4-mapped IPv6 addresses", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateAddress("2001:db8::1")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });

  it("returns false for non-IP strings (hostnames are resolved by safeFetch)", () => {
    expect(isPrivateAddress("localhost")).toBe(false);
    expect(isPrivateAddress("example.com")).toBe(false);
    expect(isPrivateAddress("")).toBe(false);
  });
});

// ── safeFetch: scheme + literal-IP rejection (throws before DNS/fetch) ───────

describe("safeFetch rejection paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Stub fetch so any unexpected network attempt fails the test loudly. */
  function stubNoNetwork() {
    const mock = vi.fn(() => {
      throw new Error("unexpected network call");
    });
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("rejects non-http(s) schemes", async () => {
    const mock = stubNoNetwork();
    await expect(safeFetch("ftp://example.com/file.pdf")).rejects.toThrow(
      /unsupported scheme/,
    );
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(
      /unsupported scheme/,
    );
    await expect(safeFetch("gopher://example.com")).rejects.toThrow(
      /unsupported scheme/,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it("rejects unparseable URLs", async () => {
    const mock = stubNoNetwork();
    await expect(safeFetch("not a url")).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });

  it("rejects private/loopback/metadata literal IPv4 hosts", async () => {
    const mock = stubNoNetwork();
    for (const url of [
      "http://127.0.0.1/admin",
      "http://0.0.0.0/",
      "http://10.0.0.1/internal",
      "http://172.16.0.1/",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "https://169.254.169.254/latest/meta-data/",
    ]) {
      await expect(safeFetch(url)).rejects.toThrow(/private address/);
    }
    expect(mock).not.toHaveBeenCalled();
  });

  it("rejects obfuscated IPv4 literals (URL parser canonicalises them)", async () => {
    const mock = stubNoNetwork();
    await expect(safeFetch("http://2130706433/")).rejects.toThrow(
      /private address/,
    ); // decimal 127.0.0.1
    await expect(safeFetch("http://0x7f000001/")).rejects.toThrow(
      /private address/,
    ); // hex 127.0.0.1
    expect(mock).not.toHaveBeenCalled();
  });

  it("rejects private literal IPv6 hosts (bracketed)", async () => {
    const mock = stubNoNetwork();
    for (const url of [
      "http://[::1]/admin",
      "http://[fe80::1]/",
      "http://[fd00::1]/",
      "http://[::ffff:10.0.0.1]/",
    ]) {
      await expect(safeFetch(url)).rejects.toThrow(/private address/);
    }
    expect(mock).not.toHaveBeenCalled();
  });
});

// ── safeFetch: manual redirect handling (stubbed fetch, no network) ──────────

describe("safeFetch redirect handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function redirectTo(location: string) {
    return new Response(null, { status: 302, headers: { location } });
  }

  it("returns non-redirect responses as-is", async () => {
    const mock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const res = await safeFetch("http://203.0.113.1/doc.pdf");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect, re-validating the new host", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo("http://203.0.113.2/moved.pdf"))
      .mockResolvedValueOnce(new Response("moved", { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const res = await safeFetch("http://203.0.113.1/doc.pdf");
    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[1][0])).toBe("http://203.0.113.2/moved.pdf");
  });

  it("blocks redirects to private hosts", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        redirectTo("http://169.254.169.254/latest/meta-data/"),
      );
    vi.stubGlobal("fetch", mock);
    await expect(safeFetch("http://203.0.113.1/doc.pdf")).rejects.toThrow(
      /private address/,
    );
    expect(mock).toHaveBeenCalledTimes(1); // never fetched the metadata host
  });

  it("forces redirect: 'manual' on every hop, preserving caller init", async () => {
    const mock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", mock);
    await safeFetch("http://203.0.113.1/doc.pdf", {
      headers: { "User-Agent": "test-agent" },
      redirect: "follow",
    });
    const init = mock.mock.calls[0][1];
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toEqual({ "User-Agent": "test-agent" });
  });

  it("gives up after 5 redirect hops", async () => {
    const mock = vi.fn(async () => redirectTo("http://203.0.113.2/loop"));
    vi.stubGlobal("fetch", mock);
    await expect(safeFetch("http://203.0.113.1/loop")).rejects.toThrow(
      /too many redirects/,
    );
    expect(mock).toHaveBeenCalledTimes(6); // initial request + 5 hops
  });
});
