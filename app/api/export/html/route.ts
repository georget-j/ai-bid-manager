import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { RFPResponseSchema } from "@/lib/schema";
import { generateHtml } from "@/lib/export-html";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/admin-auth";

const ExportRequestSchema = z.object({
  query: z.string(),
  response: RFPResponseSchema,
  edited_draft: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;
  const limited = await checkRateLimit(request, "export");
  if (limited) return limited;
  try {
    const body = await request.json();
    const { query, response, edited_draft } = ExportRequestSchema.parse(body);

    const html = generateHtml(query, response, edited_draft);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rfp-response.html"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
