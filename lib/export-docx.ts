import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  PageBreak,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from "docx";
import type { RFPResponse } from "./schema";
import type { GrantBudget } from "./grants/budget";
import { budgetTotals, hasBudget } from "./grants/budget";

export type BatchItem = {
  section: string;
  question: string;
  response: RFPResponse;
  editedDraft?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const FONT = "Calibri";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "16A34A",
  medium: "D97706",
  low: "DC2626",
};

function t(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    color?: string;
    italics?: boolean;
  } = {},
) {
  return new TextRun({ text, font: FONT, size: opts.size ?? 22, ...opts });
}

function heading1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [
      new TextRun({ text, font: FONT, bold: true, size: 32, color: "111827" }),
    ],
  });
}

function heading2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text, font: FONT, bold: true, size: 26, color: "1F2937" }),
    ],
  });
}

function body(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [t(text)],
  });
}

function label(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [t(text, { bold: true, size: 20, color: "6B7280" })],
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" } },
    spacing: { before: 320, after: 320 },
    children: [],
  });
}

function gap(pts = 160) {
  return new Paragraph({ spacing: { after: pts }, children: [] });
}

// ── Single response export ────────────────────────────────────────────────────

export async function generateDocx(
  query: string,
  response: RFPResponse,
  editedDraft?: string,
): Promise<Buffer> {
  const draft = editedDraft ?? response.draft_answer;
  const confColor = CONFIDENCE_COLOR[response.confidence.level] ?? "374151";

  const children: Paragraph[] = [
    // Title
    new Paragraph({
      spacing: { after: 80 },
      children: [t("RFP Response", { bold: true, size: 52, color: "111827" })],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
      },
      spacing: { after: 400 },
      children: [],
    }),

    // Question
    heading2("Requirement"),
    new Paragraph({
      spacing: { after: 240 },
      children: [t(query, { bold: true, size: 24, color: "111827" })],
    }),

    // Executive summary — accented block
    label("Executive Summary"),
    new Paragraph({
      indent: { left: 360 },
      border: { left: { style: BorderStyle.THICK, size: 10, color: "3B82F6" } },
      shading: { type: ShadingType.SOLID, color: "F0F7FF" },
      spacing: { before: 80, after: 240 },
      children: [t(response.executive_summary, { size: 22, color: "1E3A5F" })],
    }),

    // Confidence
    new Paragraph({
      spacing: { before: 80, after: 240 },
      children: [
        t("Confidence  ", { bold: true, size: 20, color: "374151" }),
        t(response.confidence.level.toUpperCase(), {
          bold: true,
          size: 20,
          color: confColor,
        }),
        t(`  —  ${response.confidence.reason}`, { size: 20, color: "6B7280" }),
      ],
    }),

    // Full response
    heading2("Full Response"),
    ...draft.split("\n\n").filter(Boolean).map(body),
    gap(),
  ];

  // Citations
  if (response.citations.length > 0) {
    children.push(label("Source Citations"));
    for (const c of response.citations) {
      const excerpt =
        c.excerpt.length > 200 ? c.excerpt.slice(0, 197) + "…" : c.excerpt;
      children.push(
        new Paragraph({
          indent: { left: 360 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
          },
          spacing: { after: 100 },
          children: [
            t(`${c.source_title}  `, { bold: true, size: 20, color: "374151" }),
            t(`"${excerpt}"`, { italics: true, size: 20, color: "6B7280" }),
          ],
        }),
      );
    }
    children.push(gap());
  }

  // Missing information
  if (response.missing_information.length > 0) {
    children.push(label("Information Required"));
    for (const mi of response.missing_information) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 100 },
          children: [
            t(`[${mi.suggested_owner.toUpperCase()}]  `, {
              bold: true,
              size: 20,
              color: "D97706",
            }),
            t(`${mi.item} — ${mi.why_it_matters}`, {
              size: 20,
              color: "374151",
            }),
          ],
        }),
      );
    }
    children.push(gap());
  }

  // Next actions
  if (response.suggested_next_actions.length > 0) {
    children.push(label("Suggested Next Actions"));
    for (const action of response.suggested_next_actions) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 80 },
          children: [t(`• ${action}`, { size: 20 })],
        }),
      );
    }
  }

  const doc = new Document({
    creator: "AI RFP Agent",
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

// ── Project budget table ────────────────────────────────────────────────────

function money(n: number) {
  return `£${Math.round(n).toLocaleString()}`;
}

function budgetRow(
  labelText: string,
  amount: string,
  opts: { bold?: boolean; shade?: string } = {},
) {
  const cell = (children: Paragraph[]) =>
    new TableCell({
      shading: opts.shade
        ? { type: ShadingType.SOLID, color: opts.shade, fill: opts.shade }
        : undefined,
      children,
    });
  return new TableRow({
    children: [
      cell([
        new Paragraph({
          children: [
            t(labelText, { bold: opts.bold, size: 20, color: "374151" }),
          ],
        }),
      ]),
      cell([
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [t(amount, { bold: opts.bold, size: 20, color: "111827" })],
        }),
      ]),
    ],
  });
}

/** A "Project budget" heading + costs/funding table + balance line. */
function budgetSection(budget: GrantBudget): (Paragraph | Table)[] {
  const totals = budgetTotals(budget);
  const rows: TableRow[] = [];
  rows.push(budgetRow("Project costs", "", { bold: true, shade: "F3F4F6" }));
  for (const l of budget.costs ?? [])
    rows.push(budgetRow(l.label || "—", money(l.amount)));
  rows.push(
    budgetRow("Total project cost", money(totals.cost), { bold: true }),
  );
  rows.push(budgetRow("Funding sources", "", { bold: true, shade: "F3F4F6" }));
  for (const l of budget.funding ?? [])
    rows.push(budgetRow(l.label || "—", money(l.amount)));
  rows.push(budgetRow("Total funding", money(totals.funding), { bold: true }));

  const balance =
    Math.abs(totals.balance) <= 1
      ? "Costs and funding balance."
      : totals.balance < 0
        ? `Shortfall of ${money(-totals.balance)}.`
        : `Surplus of ${money(totals.balance)}.`;

  return [
    heading1("Project budget"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [7000, 3000],
      rows,
    }),
    new Paragraph({
      spacing: { before: 160 },
      children: [t(balance, { bold: true, size: 20, color: "374151" })],
    }),
  ];
}

// ── Batch export ──────────────────────────────────────────────────────────────

export async function generateBatchDocx(
  rfpTitle: string,
  items: BatchItem[],
  budget?: GrantBudget | null,
): Promise<Buffer> {
  const sectionMap = new Map<string, BatchItem[]>();
  for (const item of items) {
    const arr = sectionMap.get(item.section) ?? [];
    arr.push(item);
    sectionMap.set(item.section, arr);
  }

  const children: (Paragraph | Table)[] = [];

  // Cover block
  children.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        t("RFP Response Document", { bold: true, size: 52, color: "111827" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [t(rfpTitle, { size: 28, color: "374151" })],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
      },
      spacing: { after: 80 },
      children: [
        t(
          new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          { size: 20, color: "9CA3AF" },
        ),
      ],
    }),
    gap(600),
  );

  // Project budget (grant applications) — a costs/funding table before the answers.
  if (hasBudget(budget)) {
    children.push(...budgetSection(budget!));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  let sectionIndex = 0;
  for (const [sectionName, sectionItems] of sectionMap) {
    // Page break before every section except the first
    if (sectionIndex > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    sectionIndex++;

    children.push(heading1(sectionName));

    let qNum = 1;
    for (const item of sectionItems) {
      const draft = item.editedDraft ?? item.response.draft_answer;
      const confColor =
        CONFIDENCE_COLOR[item.response.confidence.level] ?? "374151";

      // Question heading
      children.push(
        new Paragraph({
          spacing: { before: 320, after: 160 },
          children: [
            t(`Q${qNum}.  `, { bold: true, size: 26, color: "6B7280" }),
            t(item.question, { bold: true, size: 26, color: "111827" }),
          ],
        }),
      );

      // Executive summary
      children.push(
        new Paragraph({
          indent: { left: 360 },
          border: {
            left: { style: BorderStyle.THICK, size: 10, color: "3B82F6" },
          },
          shading: { type: ShadingType.SOLID, color: "F0F7FF" },
          spacing: { before: 80, after: 200 },
          children: [
            t(item.response.executive_summary, { size: 22, color: "1E3A5F" }),
          ],
        }),
      );

      // Confidence
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 200 },
          children: [
            t("Confidence  ", { bold: true, size: 20, color: "374151" }),
            t(item.response.confidence.level.toUpperCase(), {
              bold: true,
              size: 20,
              color: confColor,
            }),
            t(`  —  ${item.response.confidence.reason}`, {
              size: 20,
              color: "6B7280",
            }),
          ],
        }),
      );

      // Full response
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 100 },
          children: [t("Response", { bold: true, size: 22, color: "374151" })],
        }),
      );
      for (const para of draft.split("\n\n").filter(Boolean)) {
        children.push(body(para));
      }

      // Citations
      if (item.response.citations.length > 0) {
        children.push(label("Sources"));
        for (const c of item.response.citations) {
          const excerpt =
            c.excerpt.length > 200 ? c.excerpt.slice(0, 197) + "…" : c.excerpt;
          children.push(
            new Paragraph({
              indent: { left: 360 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              },
              spacing: { after: 80 },
              children: [
                t(`${c.source_title}  `, {
                  bold: true,
                  size: 18,
                  color: "374151",
                }),
                t(`"${excerpt}"`, { italics: true, size: 18, color: "6B7280" }),
              ],
            }),
          );
        }
      }

      // Missing information
      if (item.response.missing_information.length > 0) {
        children.push(label("Information Required"));
        for (const mi of item.response.missing_information) {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              spacing: { after: 80 },
              children: [
                t(`[${mi.suggested_owner.toUpperCase()}]  `, {
                  bold: true,
                  size: 18,
                  color: "D97706",
                }),
                t(`${mi.item} — ${mi.why_it_matters}`, {
                  size: 18,
                  color: "374151",
                }),
              ],
            }),
          );
        }
      }

      // Next actions
      if (item.response.suggested_next_actions.length > 0) {
        children.push(label("Next Actions"));
        for (const action of item.response.suggested_next_actions) {
          children.push(
            new Paragraph({
              indent: { left: 360 },
              spacing: { after: 80 },
              children: [t(`• ${action}`, { size: 18, color: "374151" })],
            }),
          );
        }
      }

      // Divider between questions (skip after last in section)
      if (qNum < sectionItems.length) {
        children.push(divider());
      }

      qNum++;
    }
  }

  const doc = new Document({
    creator: "AI RFP Agent",
    description: rfpTitle,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
