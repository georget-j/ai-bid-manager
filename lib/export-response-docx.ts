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
} from "docx";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResponseQuestion {
  id: string;
  question_text: string;
  section_ref: string | null;
  question_class: "question" | "requirement" | "guidance";
  sort_order: number | null;
  word_limit: number | null;
  ai_draft: string | null;
  answer_status: string;
}

export interface ResponseOpportunity {
  title: string;
  buyer_name: string | null;
  source_id?: string | null;
}

export interface ExportGapResult {
  question_text: string;
  section_ref: string | null;
  coverage: "covered" | "partial" | "missing" | "expired";
  risk_level: "low" | "medium" | "high";
  gap_note: string;
}

export interface ExportGapReport {
  client_name: string;
  coverage_score: number;
  covered: number;
  partial: number;
  missing: number;
  expired: number;
  results: ExportGapResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FONT = "Calibri";
const BRAND_COLOR = "1E3A5F"; // dark navy — professional, client-facing

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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Cover page ────────────────────────────────────────────────────────────────

function coverPage(
  orgName: string,
  opportunity: ResponseOpportunity,
): Paragraph[] {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
          text: "Response to Tender",
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
          text: opportunity.title,
          font: FONT,
          bold: true,
          size: 36,
          color: "111827",
        }),
      ],
    }),
    gap(200),
    ...(opportunity.buyer_name
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              t("Issued to: ", { bold: true, color: "374151" }),
              t(opportunity.buyer_name, { color: "374151" }),
            ],
          }),
        ]
      : []),
    ...(opportunity.source_id
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              t("Reference: ", { bold: true, color: "374151" }),
              t(opportunity.source_id, { color: "374151" }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        t("Prepared by: ", { bold: true, color: "374151" }),
        t(orgName, { color: "374151" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        t("Date: ", { bold: true, color: "374151" }),
        t(today, { color: "374151" }),
      ],
    }),
    gap(200),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ── Section content ───────────────────────────────────────────────────────────

function renderSection(
  sectionLabel: string,
  items: ResponseQuestion[],
  showHeading: boolean,
): Paragraph[] {
  const out: Paragraph[] = [];

  if (showHeading) {
    out.push(heading1(sectionLabel));
  }

  let qNum = 0;
  let rNum = 0;

  for (const item of items) {
    // Guidance — italic note paragraph
    if (item.question_class === "guidance") {
      out.push(
        new Paragraph({
          spacing: { before: 80, after: 120 },
          shading: { type: ShadingType.SOLID, color: "FFFBEB", fill: "FFFBEB" },
          children: [
            new TextRun({
              text: "ℹ  " + item.question_text,
              font: FONT,
              size: 20,
              color: "92400E",
              italics: true,
            }),
          ],
        }),
      );
      continue;
    }

    // Requirement — compact confirmation row
    if (item.question_class === "requirement") {
      rNum++;
      const answer = item.ai_draft ?? "To be confirmed";
      out.push(gap(80));
      out.push(
        para(
          [
            new TextRun({
              text: `R${rNum}  `,
              font: FONT,
              bold: true,
              size: 20,
              color: "B45309",
            }),
            t(item.question_text, { size: 20, color: "374151" }),
          ],
          40,
        ),
      );
      out.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: "✓  ",
              font: FONT,
              bold: true,
              size: 20,
              color: "059669",
            }),
            t(answer, { size: 20, color: "1F2937" }),
          ],
        }),
      );
      continue;
    }

    // Question — full prose answer
    qNum++;
    const draft = item.ai_draft ?? "";
    const wc = draft ? wordCount(draft) : 0;

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
          t(item.question_text, { bold: true, size: 22, color: "111827" }),
          ...(item.word_limit
            ? [
                t(`   [${item.word_limit} words max]`, {
                  size: 18,
                  color: "9CA3AF",
                  italics: true,
                }),
              ]
            : []),
        ],
      }),
    );

    // Answer body
    if (draft) {
      const paragraphs = draft.split(/\n\n+/).filter(Boolean);
      for (const p of paragraphs) {
        out.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [t(p, { color: "1F2937" })],
          }),
        );
      }

      // Word count footer
      if (item.word_limit) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 80 },
            children: [
              t(`Word count: ${wc} / ${item.word_limit}`, {
                size: 18,
                color: wc > item.word_limit ? "DC2626" : "6B7280",
                italics: true,
              }),
            ],
          }),
        );
      } else if (wc > 0) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 80 },
            children: [
              t(`Word count: ${wc}`, {
                size: 18,
                color: "6B7280",
                italics: true,
              }),
            ],
          }),
        );
      }
    } else {
      // Blank answer area
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

// ── Summary appendix ──────────────────────────────────────────────────────────

function summaryAppendix(
  sections: { label: string; items: ResponseQuestion[] }[],
): (Paragraph | Table)[] {
  const rows: TableRow[] = [
    new TableRow({
      children: [
        "Section",
        "Questions",
        "Requirements",
        "Answered",
        "Unanswered",
      ].map(
        (h) =>
          new TableCell({
            shading: {
              type: ShadingType.SOLID,
              color: BRAND_COLOR,
              fill: BRAND_COLOR,
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: h,
                    font: FONT,
                    bold: true,
                    size: 20,
                    color: "FFFFFF",
                  }),
                ],
              }),
            ],
          }),
      ),
    }),
  ];

  for (const section of sections) {
    const qs = section.items.filter(
      (i) => i.question_class === "question",
    ).length;
    const rs = section.items.filter(
      (i) => i.question_class === "requirement",
    ).length;
    const answered = section.items.filter(
      (i) =>
        i.question_class !== "guidance" &&
        i.ai_draft &&
        i.answer_status !== "unanswered",
    ).length;
    const unanswered = qs + rs - answered;

    rows.push(
      new TableRow({
        children: [
          section.label,
          String(qs),
          String(rs),
          String(answered),
          String(unanswered),
        ].map(
          (val, ci) =>
            new TableCell({
              shading:
                ci === 0
                  ? undefined
                  : {
                      type: ShadingType.SOLID,
                      color: "F9FAFB",
                      fill: "F9FAFB",
                    },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: val,
                      font: FONT,
                      size: 20,
                      color: ci === 4 && unanswered > 0 ? "DC2626" : "1F2937",
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
    );
  }

  const totalAnswered = sections
    .flatMap((s) => s.items)
    .filter(
      (i) =>
        i.question_class !== "guidance" &&
        i.ai_draft &&
        i.answer_status !== "unanswered",
    ).length;

  const allAnswerable = sections
    .flatMap((s) => s.items)
    .filter((i) => i.question_class !== "guidance").length;

  const totalWords = sections
    .flatMap((s) => s.items)
    .filter((i) => i.ai_draft)
    .reduce((sum, i) => sum + wordCount(i.ai_draft!), 0);

  return [
    new Paragraph({ children: [new PageBreak()] }),
    heading1("Appendix: Response Summary"),
    gap(80),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
    gap(160),
    para(
      [
        t(`Total answered: `, { bold: true, color: "374151" }),
        t(`${totalAnswered} of ${allAnswerable}`, { color: "374151" }),
        t(`   ·   Total words: `, { bold: true, color: "374151" }),
        t(`${totalWords.toLocaleString()}`, { color: "374151" }),
      ],
      80,
    ),
  ];
}

// ── Evidence gap report appendix ─────────────────────────────────────────────

const COVERAGE_COLORS: Record<string, string> = {
  covered: "059669",
  partial: "D97706",
  missing: "6B7280",
  expired: "DC2626",
};

const COVERAGE_LABELS: Record<string, string> = {
  covered: "Covered",
  partial: "Expiring",
  missing: "Missing",
  expired: "Expired",
};

function gapReportSection(report: ExportGapReport): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(new Paragraph({ children: [new PageBreak()] }));
  out.push(heading1("Appendix: Evidence Gap Report"));
  out.push(gap(80));

  // Summary line
  out.push(
    para(
      [
        t(`Client: `, { bold: true, color: "374151" }),
        t(`${report.client_name}   `, { color: "374151" }),
        t(`Evidence coverage: `, { bold: true, color: "374151" }),
        t(
          `${report.coverage_score}%   (${report.covered} covered · ${report.partial} expiring · ${report.missing} missing · ${report.expired} expired)`,
          { color: "374151" },
        ),
      ],
      160,
    ),
  );

  // Table of gaps
  const headerCells = ["Requirement", "Section", "Status", "Gap / Action"].map(
    (h) =>
      new TableCell({
        shading: {
          type: ShadingType.SOLID,
          color: BRAND_COLOR,
          fill: BRAND_COLOR,
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: h,
                font: FONT,
                bold: true,
                size: 20,
                color: "FFFFFF",
              }),
            ],
          }),
        ],
      }),
  );

  const rows: TableRow[] = [new TableRow({ children: headerCells })];

  for (const r of report.results) {
    const color = COVERAGE_COLORS[r.coverage] ?? "6B7280";
    const label = COVERAGE_LABELS[r.coverage] ?? r.coverage;

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [t(r.question_text, { size: 18, color: "111827" })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  t(r.section_ref ?? "General", { size: 18, color: "6B7280" }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 12, type: WidthType.PERCENTAGE },
            shading: {
              type: ShadingType.SOLID,
              color: "F9FAFB",
              fill: "F9FAFB",
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: label,
                    font: FONT,
                    bold: true,
                    size: 18,
                    color,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [t(r.gap_note, { size: 18, color: "374151" })],
              }),
            ],
          }),
        ],
      }),
    );
  }

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
  );

  return out;
}

// ── Main export function ───────────────────────────────────────────────────────

export async function generateResponseDocx(
  opportunity: ResponseOpportunity,
  orgName: string,
  questions: ResponseQuestion[],
  gapReport?: ExportGapReport | null,
): Promise<ArrayBuffer> {
  // Sort by sort_order
  const sorted = questions.slice().sort((a, b) => {
    if (a.sort_order !== null && b.sort_order !== null)
      return a.sort_order - b.sort_order;
    if (a.sort_order !== null) return -1;
    if (b.sort_order !== null) return 1;
    return 0;
  });

  // Group into sections
  const sectionMap = new Map<string, ResponseQuestion[]>();
  for (const q of sorted) {
    const key = q.section_ref ?? "General";
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key)!.push(q);
  }
  const sections = Array.from(sectionMap.entries()).map(([label, items]) => ({
    label,
    items,
  }));

  const children: (Paragraph | Table)[] = [...coverPage(orgName, opportunity)];

  const showSectionHeadings = sections.length > 1;
  for (const section of sections) {
    children.push(
      ...renderSection(section.label, section.items, showSectionHeadings),
    );
  }

  children.push(...summaryAppendix(sections));

  if (gapReport && gapReport.results.length > 0) {
    children.push(...gapReportSection(gapReport));
  }

  const doc = new Document({
    creator: orgName,
    title: `Response — ${opportunity.title}`,
    description: `Tender response prepared by ${orgName}`,
    sections: [{ children }],
  });

  return Packer.toArrayBuffer(doc);
}
