/**
 * Display-copy helpers — pure functions, no network or DB.
 *
 * - formatDaysLeft (lib/dates): plural-correct deadline badges ("1 day left",
 *   never "1 days left").
 * - formatAmountRange (lib/grants/copy): one shared way to render a grant's
 *   funding range, including the live "£1–£1.4m" placeholder-minimum bug.
 */
import { describe, it, expect } from "vitest";
import { daysUntil, formatDaysLeft } from "@/lib/dates";
import { formatAmountRange, AMOUNT_NOT_STATED } from "@/lib/grants/copy";

describe("formatDaysLeft", () => {
  it("says the deadline has passed for any negative day count", () => {
    expect(formatDaysLeft(-1)).toBe("Deadline passed");
    expect(formatDaysLeft(-30)).toBe("Deadline passed");
  });

  it("says due today for zero days", () => {
    expect(formatDaysLeft(0)).toBe("Due today");
  });

  it("uses the singular for exactly one day", () => {
    expect(formatDaysLeft(1)).toBe("1 day left");
  });

  it("uses the plural for two or more days", () => {
    expect(formatDaysLeft(2)).toBe("2 days left");
    expect(formatDaysLeft(14)).toBe("14 days left");
    expect(formatDaysLeft(120)).toBe("120 days left");
  });

  it("composes with daysUntil for midnight-anchored deadlines", () => {
    // Deadlines are stored at midnight starting the deadline day, so during
    // that day daysUntil is 0 ("due today") and the next day it goes negative.
    const now = new Date("2026-06-10T09:00:00Z");
    const at = (iso: string) => formatDaysLeft(daysUntil(iso, now));
    expect(at("2026-06-10T00:00:00Z")).toBe("Due today");
    expect(at("2026-06-11T00:00:00Z")).toBe("1 day left");
    expect(at("2026-06-13T00:00:00Z")).toBe("3 days left");
    expect(at("2026-06-09T00:00:00Z")).toBe("Deadline passed");
  });
});

describe("formatAmountRange", () => {
  it("treats placeholder minimums (≤ £5) as absent — the £1–£1.4m bug", () => {
    expect(formatAmountRange(1, 1_400_000)).toBe("Up to £1.4m");
    expect(formatAmountRange(5, 1_400_000)).toBe("Up to £1.4m"); // boundary
    expect(formatAmountRange(0, 250_000)).toBe("Up to £250k");
  });

  it("keeps a real minimum just above the placeholder cut-off", () => {
    expect(formatAmountRange(6, 1_400_000)).toBe("£6–£1.4m");
  });

  it("renders 'Up to' when only a maximum is stated", () => {
    expect(formatAmountRange(null, 250_000)).toBe("Up to £250k");
    expect(formatAmountRange(undefined, 999)).toBe("Up to £999");
  });

  it("renders 'From' when only a minimum is stated", () => {
    expect(formatAmountRange(25_000, null)).toBe("From £25k");
    expect(formatAmountRange(1_500_000, undefined)).toBe("From £1.5m");
  });

  it("renders a single figure when min and max are equal", () => {
    expect(formatAmountRange(50_000, 50_000)).toBe("£50k");
    expect(formatAmountRange(2_000_000, 2_000_000)).toBe("£2m");
  });

  it("renders a range when both are stated", () => {
    expect(formatAmountRange(10_000, 100_000)).toBe("£10k–£100k");
    expect(formatAmountRange(800, 950)).toBe("£800–£950");
    expect(formatAmountRange(1_000_000, 2_500_000)).toBe("£1m–£2.5m");
  });

  it("compacts whole millions without a decimal", () => {
    expect(formatAmountRange(null, 1_000_000)).toBe("Up to £1m");
    expect(formatAmountRange(null, 1_400_000)).toBe("Up to £1.4m");
  });

  it("falls back to plain copy when nothing usable is stated", () => {
    expect(formatAmountRange(null, null)).toBe(AMOUNT_NOT_STATED);
    expect(formatAmountRange(undefined, undefined)).toBe("Amount not stated");
    expect(formatAmountRange(0, null)).toBe(AMOUNT_NOT_STATED); // placeholder min only
    expect(formatAmountRange(3, 0)).toBe(AMOUNT_NOT_STATED); // nothing meaningful
    expect(formatAmountRange(NaN, NaN)).toBe(AMOUNT_NOT_STATED);
  });
});
