/**
 * Unit tests for lib/extractors/*.
 *
 * PDF extractor uses vi.mock to stub pdf-parse — we're testing our logic
 * (scanned heuristic, title derivation), not the library itself.
 * All other extractors run against real fixture files in tests/fixtures/.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ── Mock pdf-parse before importing the PDF extractor ────────────────────────

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdfParse from "pdf-parse";
const mockPdfParse = vi.mocked(pdfParse);

// Import extractors after mocks are set up
import { extract as extractTxt } from "../lib/extractors/txt";
import { extract as extractMarkdown } from "../lib/extractors/markdown";
import { extract as extractPdf } from "../lib/extractors/pdf";
import { extract as extractDocx } from "../lib/extractors/docx";
import { extract as extractCsv } from "../lib/extractors/csv";
import { extract as extractXlsx } from "../lib/extractors/xlsx";
import { extract as extractHtml } from "../lib/extractors/html";
import { extract as extractJson } from "../lib/extractors/json";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name));

// ── TXT ──────────────────────────────────────────────────────────────────────

describe("txt extractor", () => {
  it("returns non-empty text and no warnings", async () => {
    const result = await extractTxt(fixture("sample.txt"), "sample.txt");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("derives title from filename", async () => {
    const result = await extractTxt(fixture("sample.txt"), "my-document.txt");
    expect(result.title).toBe("my document");
  });
});

// ── Markdown ─────────────────────────────────────────────────────────────────

describe("markdown extractor", () => {
  it("returns non-empty text and no warnings", async () => {
    const result = await extractMarkdown(fixture("sample.md"), "sample.md");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("uses the first # heading as the title", async () => {
    const result = await extractMarkdown(fixture("sample.md"), "sample.md");
    expect(result.title).toBe("Security Compliance Guide");
  });

  it("falls back to filename when there is no heading", async () => {
    const noHeading = Buffer.from("Just some plain text without a heading.");
    const result = await extractMarkdown(noHeading, "release-notes.md");
    expect(result.title).toBe("release notes");
  });
});

// ── PDF ───────────────────────────────────────────────────────────────────────

describe("pdf extractor", () => {
  it("returns text and no warning for a normal PDF", async () => {
    const longText =
      "Implementation Playbook\n\n" +
      "Standard implementation takes 6-8 weeks from contract to go-live. ".repeat(
        5,
      );
    mockPdfParse.mockResolvedValueOnce({
      text: longText,
      numpages: 2,
    } as never);

    const result = await extractPdf(Buffer.from("fake"), "playbook.pdf");
    expect(result.text).toContain("Implementation Playbook");
    expect(result.warnings).toEqual([]);
    expect(result.pageCount).toBe(2);
  });

  it("emits a scanned-PDF warning when text is sparse relative to page count", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "hi", // 2 chars across 5 pages = 0.4 chars/page < 100
      numpages: 5,
    } as never);

    const result = await extractPdf(Buffer.from("fake"), "scanned.pdf");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].toLowerCase()).toContain("scanned");
  });

  it("derives title from filename", async () => {
    mockPdfParse.mockResolvedValueOnce({
      text: "content",
      numpages: 1,
    } as never);
    const result = await extractPdf(Buffer.from("fake"), "annual-report.pdf");
    expect(result.title).toBe("annual report");
  });
});

// ── DOCX ─────────────────────────────────────────────────────────────────────

describe("docx extractor", () => {
  it("returns non-empty text and no warnings", async () => {
    const result = await extractDocx(fixture("sample.docx"), "sample.docx");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toBeInstanceOf(Array);
  });

  it("contains expected content from the fixture", async () => {
    const result = await extractDocx(fixture("sample.docx"), "sample.docx");
    expect(result.text).toContain("Implementation Playbook");
  });
});

// ── CSV ───────────────────────────────────────────────────────────────────────

describe("csv extractor", () => {
  it("returns non-empty text and no warnings", async () => {
    const result = await extractCsv(fixture("sample.csv"), "sample.csv");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it('formats each row as "col: val" pairs', async () => {
    const result = await extractCsv(fixture("sample.csv"), "sample.csv");
    expect(result.text).toMatch(/product: .+/);
    expect(result.text).toMatch(/price: .+/);
  });
});

// ── XLSX ──────────────────────────────────────────────────────────────────────

describe("xlsx extractor", () => {
  it("returns non-empty text and no warnings", async () => {
    const result = await extractXlsx(fixture("sample.xlsx"), "sample.xlsx");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("contains values from the first sheet", async () => {
    const result = await extractXlsx(fixture("sample.xlsx"), "sample.xlsx");
    expect(result.text).toContain("Vendor");
  });
});

// ── HTML ──────────────────────────────────────────────────────────────────────

describe("html extractor", () => {
  it("returns non-empty text and no warnings", async () => {
    const result = await extractHtml(fixture("sample.html"), "sample.html");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("uses the <title> tag as the document title", async () => {
    const result = await extractHtml(fixture("sample.html"), "sample.html");
    expect(result.title).toBe("Product Overview");
  });

  it("strips <script> and <style> and <nav> content", async () => {
    const result = await extractHtml(fixture("sample.html"), "sample.html");
    expect(result.text).not.toContain("console.log");
    expect(result.text).not.toContain("font-family");
  });

  it("includes visible body text", async () => {
    const result = await extractHtml(fixture("sample.html"), "sample.html");
    expect(result.text).toContain("RFP Automation");
  });
});

// ── JSON ──────────────────────────────────────────────────────────────────────

describe("json extractor", () => {
  it("returns non-empty text and no warnings for a small file", async () => {
    const result = await extractJson(fixture("sample.json"), "sample.json");
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  it("round-trips the JSON content", async () => {
    const result = await extractJson(fixture("sample.json"), "sample.json");
    expect(result.text).toContain("SOC 2 Type II");
    expect(result.text).toContain("99.9%");
  });

  it("emits a warning when the JSON has more than 500 keys", async () => {
    const deep: Record<string, unknown> = {};
    for (let i = 0; i < 600; i++) deep[`key_${i}`] = `value_${i}`;
    const buf = Buffer.from(JSON.stringify(deep));
    const result = await extractJson(buf, "large.json");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].toLowerCase()).toContain("large");
  });
});
