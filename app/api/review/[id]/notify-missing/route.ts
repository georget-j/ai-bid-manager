import { NextResponse } from "next/server";
import * as z from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { getRoutingConfig } from "@/lib/routing";
import { logReviewAction } from "@/lib/audit";
import { escapeHtml } from "@/lib/html";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  item: z.string().min(1),
  why_it_matters: z.string().optional(),
  owner_topic: z.string().min(1),
});

function buildInfoRequestEmail(params: {
  questionText: string;
  item: string;
  whyItMatters?: string;
  rfpTitle: string;
}): string {
  const { questionText, item, whyItMatters, rfpTitle } = params;
  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;color:#111827;">
  <div style="border-left:4px solid #F59E0B;padding:16px 20px;background:#FFFBEB;margin-bottom:24px;">
    <p style="margin:0;font-size:13px;color:#78350F;font-weight:600;">Information Requested</p>
    <p style="margin:4px 0 0;font-size:12px;color:#374151;">${rfpTitle}</p>
  </div>

  <p style="font-size:13px;color:#374151;margin-bottom:4px;font-weight:600;">RFP Question</p>
  <p style="font-size:13px;color:#111827;margin-bottom:20px;">${questionText}</p>

  <p style="font-size:13px;color:#374151;margin-bottom:4px;font-weight:600;">Information needed from you</p>
  <p style="font-size:13px;color:#111827;margin-bottom:12px;">${item}</p>

  ${whyItMatters ? `<p style="font-size:12px;color:#6B7280;margin-bottom:20px;font-style:italic;">${whyItMatters}</p>` : ""}

  <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">
    Please reply to this email or contact the RFP team with the requested information.
  </p>
</body>
</html>`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let item: string, whyItMatters: string | undefined, ownerTopic: string;
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    item = parsed.data.item;
    whyItMatters = parsed.data.why_it_matters;
    ownerTopic = parsed.data.owner_topic;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: reviewRequest, error: rrError } = await supabase
    .from("review_requests")
    .select("id, query_id, topic, assigned_to")
    .eq("id", id)
    .single();

  if (rrError || !reviewRequest) {
    return NextResponse.json(
      { error: "Review request not found" },
      { status: 404 },
    );
  }

  const { data: queryData } = await supabase
    .from("queries")
    .select("query_text, rfp_context")
    .eq("id", reviewRequest.query_id)
    .single();

  const routingConfig = await getRoutingConfig(ownerTopic);
  if (!routingConfig?.owner_email) {
    return NextResponse.json(
      { error: `No owner configured for topic: ${ownerTopic}` },
      { status: 422 },
    );
  }

  const ownerEmail = routingConfig.owner_email;
  const questionText = queryData?.query_text ?? "";
  const rfpTitle =
    ((queryData?.rfp_context as Record<string, unknown> | null)
      ?.rfp_title as string) ?? "RFP";

  await logReviewAction(id, "system", "info_requested", {
    team: ownerTopic,
    item,
    to: ownerEmail,
  });

  if (process.env.DEMO_MODE !== "true") {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const fromEmail =
          process.env.RESEND_FROM_EMAIL ?? "rfp-agent@noreply.com";
        await resend.emails.send({
          from: fromEmail,
          to: ownerEmail,
          subject: `Information needed for RFP response — ${rfpTitle}`,
          html: buildInfoRequestEmail({
            questionText,
            item,
            whyItMatters,
            rfpTitle,
          }),
        });
      }
    } catch (err) {
      console.error("[notify-missing] email error:", err);
    }
  } else {
    console.log(
      `[notify-missing] DEMO_MODE — would notify ${ownerEmail} about: ${item}`,
    );
  }

  return NextResponse.json({ success: true, notified_email: ownerEmail });
}
