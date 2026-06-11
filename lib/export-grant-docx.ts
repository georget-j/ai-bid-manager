// Shareable grant application DOCX — modelled on the tender response export
// (lib/export-response-docx.ts): centred cover page, navy/Calibri styling,
// word-limit display with red over-limit counts, and "[Response to be drafted]"
// placeholders so unanswered questions never silently vanish.
//
// Two modes (contract C4):
//   "clean"  (default) — the shareable submission file: no internal QA blocks,
//                        no knowledge-base excerpts.
//   "review" — adds clearly-badged internal review notes (confidence, missing
//              information, next steps, sources) under each answer.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  PageBreak,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
} from "docx";
import type { RFPResponse } from "./schema";
import type { GrantBudget } from "./grants/budget";
import { budgetTotals, hasBudget } from "./grants/budget";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GrantExportMode = "clean" | "review";

/** Narrow structural slice of a grant row — GrantRow satisfies it. */
export interface GrantExportGrant {
  title: string;
  funder_name: string | null;
  deadline_at: string | null;
  amount_min: number | null;
  amount_max: number | null;
  source_notice_id: string | null;
  details?: { output_genre?: { kind: string } | null } | null;
}

/** A question the applicant chose to answer (joined back from the draft). */
export interface GrantExportQuestion {
  id: number;
  text: string;
  section: string;
  word_limit: number | null;
  mandatory?: boolean;
}

/** A drafted answer, keyed by question id in the answers map. */
export interface GrantExportAnswer {
  question_id: number;
  question_text: string;
  section: string;
  response: RFPResponse;
  /** Reviewer-edited text — wins over the AI draft when present (contract C5). */
  edited_draft?: string | null;
}

export interface GrantExportInput {
  grant: GrantExportGrant | null;
  orgName: string;
  draft: { rfp_title: string };
  questions: GrantExportQuestion[];
  answers: Record<string, GrantExportAnswer>;
  budget: GrantBudget | null;
  mode: GrantExportMode;
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

const DOC_TYPE_BY_GENRE: Record<string, string> = {
  "application-form": "Grant Application",
  "project-proposal": "Project Proposal",
  pitch: "Funding Pitch",
  "business-case": "Business Case",
  unknown: "Grant Application",
};

/** Doc-type heading for the funder's expected submission format (contract C3). */
export function docTypeForGenre(kind: string | null | undefined): string {
  return DOC_TYPE_BY_GENRE[kind ?? "unknown"] ?? "Grant Application";
}

/** The text to print for an answer: the reviewer's edit when present, else the draft. */
export function answerTextFor(
  answer: GrantExportAnswer | undefined | null,
): string {
  if (!answer) return "";
  const edited = answer.edited_draft?.trim();
  if (edited) return edited;
  return answer.response?.draft_answer?.trim() ?? "";
}

export function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isOverWordLimit(
  count: number,
  limit: number | null | undefined,
): boolean {
  return limit != null && limit > 0 && count > limit;
}

export interface CompletenessSummary {
  selected: number;
  answered: number;
  unanswered: GrantExportQuestion[];
}

/** Which selected questions still have no usable answer text. */
export function questionCompleteness(
  questions: GrantExportQuestion[],
  answers: Record<string, GrantExportAnswer>,
): CompletenessSummary {
  const unanswered = questions.filter(
    (q) => answerTextFor(answers[String(q.id)]).length === 0,
  );
  return {
    selected: questions.length,
    answered: questions.length - unanswered.length,
    unanswered,
  };
}

// Funding rows that look like the money being asked of THIS funder.
const REQUESTED_FUNDING_RE = /\b(grant|request|award|appl)/i;

/**
 * The amount being requested from the funder, when the budget's funding rows
 * make it derivable: rows labelled like the grant request win; a single funding
 * row is unambiguous; anything else is "can't tell".
 */
export function requestedAmountFromBudget(
  budget: GrantBudget | null | undefined,
): number | null {
  const funding = (budget?.funding ?? []).filter(
    (l) => Number.isFinite(l.amount) && l.amount > 0,
  );
  if (funding.length === 0) return null;
  const requested = funding.filter((l) =>
    REQUESTED_FUNDING_RE.test(l.label ?? ""),
  );
  if (requested.length > 0) return requested.reduce((s, l) => s + l.amount, 0);
  if (funding.length === 1) return funding[0].amount;
  return null;
}

export function formatAmountRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min != null && max != null)
    return min === max ? money(max) : `${money(min)} – ${money(max)}`;
  if (max != null) return `Up to ${money(max)}`;
  if (min != null) return `From ${money(min)}`;
  return null;
}

// ── Styling helpers ───────────────────────────────────────────────────────────

const FONT = "Calibri";
const BRAND_COLOR = "1E3A5F"; // dark navy — professional, client-facing
const NOTE_BG = "FFF7ED"; // soft amber — internal review notes
const NOTE_COLOR = "92400E";

function money(n: number) {
  return `£${Math.round(n).toLocaleString()}`;
}

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

function para(children: TextRun[], spacing = 120) {
  return new Paragraph({ spacing: { after: spacing }, children });
}

function heading1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 3, color: BRAND_COLOR },
    },
    children: [
      new TextRun({
        text,
        font: FONT,
        bold: true,
        size: 28,
        color: BRAND_COLOR,
      }),
    ],
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" } },
    spacing: { before: 160, after: 160 },
    children: [],
  });
}

function gap(pts = 120) {
  return new Paragraph({ spacing: { after: pts }, children: [] });
}

function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function centredDetail(label: string, value: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [
      t(`${label}: `, { bold: true, color: "374151" }),
      t(value, { color: "374151" }),
    ],
  });
}

// ── Cover page ────────────────────────────────────────────────────────────────

function coverPage(input: GrantExportInput, docType: string): Paragraph[] {
  const { grant, orgName, draft } = input;
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const title = grant?.title ?? draft.rfp_title;
  const deadline = longDate(grant?.deadline_at);
  const amountRange = formatAmountRange(grant?.amount_min, grant?.amount_max);

  return [
    gap(800),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: orgName.toUpperCase(),
          font: FONT,
          bold: true,
          size: 28,
          color: BRAND_COLOR,
          allCaps: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: docType,
          font: FONT,
          size: 22,
          color: "6B7280",
        }),
      ],
    }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 3, color: BRAND_COLOR },
      },
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 400 },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: title,
          font: FONT,
          bold: true,
          size: 36,
          color: "111827",
        }),
      ],
    }),
    gap(200),
    ...(grant?.funder_name ? [centredDetail("Funder", grant.funder_name)] : []),
    ...(deadline ? [centredDetail("Deadline", deadline)] : []),
    ...(amountRange ? [centredDetail("Funding available", amountRange)] : []),
    ...(grant?.source_notice_id
      ? [centredDetail("Reference", grant.source_notice_id)]
      : []),
    centredDetail("Prepared by", orgName),
    centredDetail("Date", today),
    gap(200),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ── Application summary ───────────────────────────────────────────────────────

function summaryRow(labelText: string, value: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 32, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: "F3F4F6", fill: "F3F4F6" },
        children: [
          new Paragraph({
            children: [t(labelText, { bold: true, size: 20, color: "374151" })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 68, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [t(value, { size: 20, color: "111827" })],
          }),
        ],
      }),
    ],
  });
}

function applicationSummary(
  input: GrantExportInput,
  completeness: CompletenessSummary,
): (Paragraph | Table)[] {
  const { grant, draft, budget } = input;
  const rows: TableRow[] = [];

  rows.push(summaryRow("Programme", grant?.title ?? draft.rfp_title));
  if (grant?.funder_name) rows.push(summaryRow("Funder", grant.funder_name));
  const deadline = longDate(grant?.deadline_at);
  if (deadline) rows.push(summaryRow("Deadline", deadline));

  const requested = requestedAmountFromBudget(budget);
  if (requested != null) {
    rows.push(summaryRow("Amount requested", money(requested)));
  } else {
    const range = formatAmountRange(grant?.amount_min, grant?.amount_max);
    if (range) rows.push(summaryRow("Funding available", range));
  }

  rows.push(
    summaryRow(
      "Questions answered",
      `${completeness.answered} of ${completeness.selected}`,
    ),
  );

  const out: (Paragraph | Table)[] = [
    heading1("Application summary"),
    gap(80),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
  ];

  if (completeness.unanswered.length > 0) {
    out.push(gap(120));
    out.push(
      para(
        [
          t(
            `${completeness.unanswered.length} question${
              completeness.unanswered.length === 1 ? " is" : "s are"
            } still to be answered — they appear below as "[Response to be drafted]".`,
            { size: 20, color: "B45309", italics: true },
          ),
        ],
        80,
      ),
    );
  }

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

// ── Internal review notes (mode = "review" only) ──────────────────────────────

function notePara(children: TextRun[], spacingAfter = 60) {
  return new Paragraph({
    indent: { left: 360 },
    shading: { type: ShadingType.SOLID, color: NOTE_BG, fill: NOTE_BG },
    spacing: { after: spacingAfter },
    children,
  });
}

function reviewNotes(response: RFPResponse): Paragraph[] {
  const out: Paragraph[] = [];

  out.push(gap(60));
  out.push(
    notePara(
      [
        t("Internal review notes — remove before sending", {
          bold: true,
          size: 18,
          color: NOTE_COLOR,
        }),
      ],
      80,
    ),
  );

  if (response.confidence) {
    out.push(
      notePara([
        t("Confidence: ", { bold: true, size: 18, color: NOTE_COLOR }),
        t(
          `${response.confidence.level.toUpperCase()} — ${response.confidence.reason}`,
          { size: 18, color: "78350F" },
        ),
      ]),
    );
  }

  if ((response.missing_information ?? []).length > 0) {
    out.push(
      notePara([
        t("Information still needed:", {
          bold: true,
          size: 18,
          color: NOTE_COLOR,
        }),
      ]),
    );
    for (const mi of response.missing_information) {
      const owner =
        mi.suggested_owner && mi.suggested_owner !== "unknown"
          ? ` (ask: ${mi.suggested_owner})`
          : "";
      out.push(
        notePara([
          t(`• ${mi.item} — ${mi.why_it_matters}${owner}`, {
            size: 18,
            color: "78350F",
          }),
        ]),
      );
    }
  }

  if ((response.suggested_next_actions ?? []).length > 0) {
    out.push(
      notePara([
        t("Suggested next steps:", {
          bold: true,
          size: 18,
          color: NOTE_COLOR,
        }),
      ]),
    );
    for (const action of response.suggested_next_actions) {
      out.push(notePara([t(`• ${action}`, { size: 18, color: "78350F" })]));
    }
  }

  if ((response.citations ?? []).length > 0) {
    out.push(
      notePara([
        t("Sources used:", { bold: true, size: 18, color: NOTE_COLOR }),
      ]),
    );
    for (const c of response.citations) {
      const excerpt =
        c.excerpt.length > 200 ? c.excerpt.slice(0, 197) + "…" : c.excerpt;
      out.push(
        notePara([
          t(`• ${c.source_title}  `, {
            bold: true,
            size: 18,
            color: "78350F",
          }),
          t(`"${excerpt}"`, { italics: true, size: 18, color: "78350F" }),
        ]),
      );
    }
  }

  out.push(gap(80));
  return out;
}

// ── Section content ───────────────────────────────────────────────────────────

function renderSection(
  sectionLabel: string,
  items: GrantExportQuestion[],
  answers: Record<string, GrantExportAnswer>,
  mode: GrantExportMode,
  showHeading: boolean,
): Paragraph[] {
  const out: Paragraph[] = [];

  if (showHeading) {
    out.push(heading1(sectionLabel));
  }

  let qNum = 0;
  for (const q of items) {
    qNum++;
    const answer = answers[String(q.id)];
    const text = answerTextFor(answer);
    const wc = text ? wordCountOf(text) : 0;

    out.push(gap(120));
    out.push(divider());

    // Question header line
    out.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `Q${qNum}.  `,
            font: FONT,
            bold: true,
            size: 22,
            color: BRAND_COLOR,
          }),
          t(q.text, { bold: true, size: 22, color: "111827" }),
          ...(q.word_limit
            ? [
                t(`   (Limit: ${q.word_limit} words)`, {
                  size: 18,
                  color: "9CA3AF",
                  italics: true,
                }),
              ]
            : []),
        ],
      }),
    );

    if (text) {
      const paragraphs = text.split(/\n\n+/).filter(Boolean);
      for (const p of paragraphs) {
        out.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [t(p, { color: "1F2937" })],
          }),
        );
      }

      // Word count footer — red when over the funder's limit
      out.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 80 },
          children: [
            t(
              q.word_limit
                ? `Word count: ${wc} / ${q.word_limit}`
                : `Word count: ${wc}`,
              {
                size: 18,
                color: isOverWordLimit(wc, q.word_limit) ? "DC2626" : "6B7280",
                italics: true,
              },
            ),
          ],
        }),
      );

      if (mode === "review" && answer?.response) {
        out.push(...reviewNotes(answer.response));
      }
    } else {
      // Selected but unanswered — visible placeholder, never silently dropped
      out.push(gap(120));
      out.push(
        new Paragraph({
          spacing: { after: 200 },
          shading: { type: ShadingType.SOLID, color: "F9FAFB", fill: "F9FAFB" },
          children: [
            t("[Response to be drafted]", {
              size: 20,
              color: "9CA3AF",
              italics: true,
            }),
          ],
        }),
      );
    }
  }

  return out;
}

// ── Project budget (adapted from the batch export's budget table) ─────────────

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
    new Paragraph({ children: [new PageBreak()] }),
    heading1("Project budget"),
    gap(80),
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

// ── Main export function ──────────────────────────────────────────────────────

export async function generateGrantApplicationDocx(
  input: GrantExportInput,
): Promise<Buffer> {
  const { grant, orgName, draft, questions, answers, budget, mode } = input;

  const docTitle = grant?.title ?? draft.rfp_title;
  const docType = docTypeForGenre(grant?.details?.output_genre?.kind);
  const completeness = questionCompleteness(questions, answers);

  // Group questions into sections, preserving their order
  const sectionMap = new Map<string, GrantExportQuestion[]>();
  for (const q of questions) {
    const key = q.section?.trim() || "General";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(q);
  }
  const sections = Array.from(sectionMap.entries()).map(([label, items]) => ({
    label,
    items,
  }));

  const children: (Paragraph | Table)[] = [
    ...coverPage(input, docType),
    ...applicationSummary(input, completeness),
  ];

  const showSectionHeadings = sections.length > 1;
  for (const section of sections) {
    children.push(
      ...renderSection(
        section.label,
        section.items,
        answers,
        mode,
        showSectionHeadings,
      ),
    );
  }

  if (hasBudget(budget)) {
    children.push(...budgetSection(budget!));
  }

  const doc = new Document({
    creator: orgName,
    title: docTitle,
    description: `${docType} prepared by ${orgName}`,
    sections: [
      {
        // Keep the cover page free of the running header / page number
        properties: { titlePage: true },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [t(docTitle, { size: 16, color: "9CA3AF" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    font: FONT,
                    size: 16,
                    color: "9CA3AF",
                    children: [
                      "Page ",
                      PageNumber.CURRENT,
                      " of ",
                      PageNumber.TOTAL_PAGES,
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
