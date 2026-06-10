import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getResponseDraft } from "@/lib/responses/drafts";
import { getGrant } from "@/lib/grants/data";
import { generateBatchDocx, type BatchItem } from "@/lib/export-docx";
import type { RFPResponse } from "@/lib/schema";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

type AnsweredQuestion = {
  section?: string;
  question_text?: string;
  response?: RFPResponse;
};

/** GET — download a grant application as a DOCX of its drafted answers. */
export async function GET(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const draft = await getResponseDraft(id, orgId);
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items: BatchItem[] = Object.values(
    (draft.answers ?? {}) as Record<string, AnsweredQuestion>,
  ).flatMap((a) =>
    a && a.response
      ? [
          {
            section: a.section ?? "General",
            question: a.question_text ?? "",
            response: a.response,
          },
        ]
      : [],
  );

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No drafted answers to export yet." },
      { status: 400 },
    );
  }

  const grant = draft.grant_id ? await getGrant(draft.grant_id) : null;
  const title = grant
    ? `${grant.title} — Application${grant.funder_name ? ` (${grant.funder_name})` : ""}`
    : draft.rfp_title;

  const buffer = await generateBatchDocx(title, items, draft.budget ?? null);
  const safe =
    (grant?.title ?? draft.rfp_title)
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .slice(0, 80) || "grant-application";

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safe}-application.docx"`,
    },
  });
}
