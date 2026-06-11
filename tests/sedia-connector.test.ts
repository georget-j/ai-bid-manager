/**
 * EU SEDIA / Horizon Europe connector unit tests — pure normalize + cursor logic,
 * no network or DB. tests/fixtures/sedia-search-page.json is a TRIMMED copy of a real
 * response from the EC search API (POST multipart, apiKey=SEDIA) fetched 2026-06-11:
 * 2 records kept, long HTML metadata strings truncated, budgetOverview intact.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  sediaHorizonConnector,
  parseCursor,
  topicUrl,
} from "@/lib/grants/connectors/sedia";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const page = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "sedia-search-page.json"), "utf-8"),
) as AnyRecord;

describe("sedia-horizon cursor logic", () => {
  it("starts at page 1 with no cursor and resumes from a JSON {page} cursor", () => {
    expect(parseCursor(null)).toBe(1);
    expect(parseCursor(undefined)).toBe(1);
    expect(parseCursor(JSON.stringify({ page: 5 }))).toBe(5);
  });

  it("is resilient to bare-number and malformed cursors", () => {
    expect(parseCursor("2")).toBe(2);
    expect(parseCursor("garbage")).toBe(1);
    expect(parseCursor('{"page":-1}')).toBe(1);
  });

  it("builds the portal topic page URL from an identifier", () => {
    expect(topicUrl("HORIZON-JU-CHIPS-2025-IA-LEAI-two-stage")).toBe(
      "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-JU-CHIPS-2025-IA-LEAI-two-stage",
    );
  });
});

describe("sedia-horizon normalize", () => {
  it("normalizes a real two-stage Horizon topic: id, budget, final deadline", async () => {
    const raw = page.results[0]; // HORIZON-JU-CHIPS-2025-IA-LEAI-two-stage
    const [g] = await sediaHorizonConnector.normalize(raw);

    expect(g.sourceName).toBe("sedia-horizon");
    expect(g.sourceNoticeId).toBe("HORIZON-JU-CHIPS-2025-IA-LEAI-two-stage");
    expect(g.title).toBe("Low power Edge AI Chips");
    expect(g.funderName).toBe("European Commission — Horizon Europe");
    expect(g.fundingType).toBe("grant");
    expect(g.currency).toBe("EUR");
    // budgetOverview: minContribution 1,000,000 / maxContribution 20,000,000.
    expect(g.amountMin).toBe(1_000_000);
    expect(g.amountMax).toBe(20_000_000);
    expect(g.openAt).toMatch(/^2025-03-04T/);
    // Two deadlineDate entries — the FINAL stage deadline wins.
    expect(g.deadlineAt).toMatch(/^2025-09-17T/);
    // Final deadline is in the past, so the derived status is closed (the API's
    // open flag can lag for two-stage calls).
    expect(g.status).toBe("closed");
    expect(g.sourceUrl).toBe(
      topicUrl("HORIZON-JU-CHIPS-2025-IA-LEAI-two-stage"),
    );
    expect(g.applicationUrl).toBe(g.sourceUrl);
    expect(g.regions).toEqual(["International"]);
    expect(g.eligibilityText).toContain(
      "Open to UK organisations (Horizon Europe association)",
    );
    expect(g.rawJson).toBe(raw);
  });

  it("normalizes the second fixture record and strips HTML from the description", async () => {
    const raw = page.results[1];
    const [g] = await sediaHorizonConnector.normalize(raw);
    expect(g.sourceNoticeId).toBe(raw.metadata.identifier[0]);
    expect(g.title).toBeTruthy();
    if (g.description) {
      expect(g.description).not.toMatch(/<[a-z][^>]*>/i);
    }
    // Both fixture records carry only identifier-style keywords, which are
    // filtered out of themes entirely.
    expect(g.themes).toEqual([]);
  });

  it("keeps real subject keywords as themes but drops identifier-style ones", async () => {
    const [g] = await sediaHorizonConnector.normalize({
      metadata: {
        identifier: ["HORIZON-CL2-2027-01-TRANSFO-01"],
        title: ["Keyword test topic"],
        keywords: [
          "HORIZON-CL2-2027-01-TRANSFO-01",
          "HORIZON-CL2-2027-01",
          "Environmental change and society",
          "Urbanization and urban planning, cities",
        ],
      },
    });
    expect(g.themes).toEqual([
      "Environmental change and society",
      "Urbanization and urban planning, cities",
    ]);
  });

  it("derives open/forthcoming status from dates (synthetic, deterministic)", async () => {
    const base = {
      reference: "ref-1",
      metadata: {
        identifier: ["HORIZON-TEST-OPEN-01"],
        title: ["Open test topic"],
        startDate: ["2020-01-01T00:00:00.000+0000"],
        deadlineDate: ["2099-01-01T00:00:00.000+0000"],
      },
    };
    const [open] = await sediaHorizonConnector.normalize(base);
    expect(open.status).toBe("open");
    expect(open.deadlineAt).toMatch(/^2099-01-01T/);

    const [forthcoming] = await sediaHorizonConnector.normalize({
      ...base,
      metadata: {
        ...base.metadata,
        startDate: ["2098-01-01T00:00:00.000+0000"],
      },
    });
    expect(forthcoming.status).toBe("forthcoming");
  });

  it("survives missing optional fields and a malformed budgetOverview", async () => {
    const [g] = await sediaHorizonConnector.normalize({
      metadata: {
        identifier: ["HORIZON-TEST-SPARSE-01"],
        title: ["Sparse topic"],
        budgetOverview: ["not-json{{{"],
      },
    });
    expect(g.sourceNoticeId).toBe("HORIZON-TEST-SPARSE-01");
    expect(g.amountMin).toBeNull();
    expect(g.amountMax).toBeNull();
    expect(g.openAt).toBeNull();
    expect(g.deadlineAt).toBeNull();
    expect(g.status).toBe("open");
  });

  it("falls back to summary/content for the title and reference for the id", async () => {
    const [g] = await sediaHorizonConnector.normalize({
      reference: "50149727TOPICSen",
      summary: "Fallback title from summary",
      metadata: {},
    });
    expect(g.sourceNoticeId).toBe("50149727TOPICSen");
    expect(g.title).toBe("Fallback title from summary");
  });

  it("returns [] when there is no identifier or no title at all", async () => {
    expect(await sediaHorizonConnector.normalize({})).toEqual([]);
    expect(
      await sediaHorizonConnector.normalize({
        metadata: { identifier: ["HORIZON-NO-TITLE-01"] },
      }),
    ).toEqual([]);
    expect(
      await sediaHorizonConnector.normalize({
        summary: "Title but no id",
      }),
    ).toEqual([]);
  });
});
