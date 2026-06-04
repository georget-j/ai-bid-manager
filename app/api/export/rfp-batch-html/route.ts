import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { RFPResponseSchema } from "@/lib/schema";
import { generateBatchHtml } from "@/lib/export-html";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/admin-auth";

const BatchExportSchema = z.object({
  rfpTitle: z.string(),
  items: z
    .array(
      z.object({
        section: z.string(),
        question: z.string(),
        response: RFPResponseSchema,
        editedDraft: z.string().optional(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const limited = await checkRateLimit(request, "export");
  if (limited) return limited;
  try {
    const body = await request.json();
    const parsed = BatchExportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { rfpTitle, items } = parsed.data;
    const html = generateBatchHtml(rfpTitle, items);

    const safeTitle = rfpTitle.replace(/[^a-z0-9\-_ ]/gi, "").trim() || "rfp";

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeTitle}-responses.html"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    console.error("[export/rfp-batch-html]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
