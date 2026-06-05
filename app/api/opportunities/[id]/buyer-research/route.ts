import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();

  // Fetch opportunity details
  const { data: opp } = await supabase
    .from("opportunities")
    .select(
      "title, description, buyer_name, buyer_identifier, buyer_region, cpv_codes, value_amount, value_currency, procurement_stage, buyer_briefing",
    )
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opp)
    return NextResponse.json(
      { error: "Opportunity not found" },
      { status: 404 },
    );

  // Return cached briefing if it exists
  if (opp.buyer_briefing) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(opp.buyer_briefing!));
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Pull recent tenders from this buyer for context
  const { data: related } = await supabase
    .from("opportunities")
    .select("title, status, value_amount, value_currency, cpv_codes")
    .eq("buyer_name", opp.buyer_name ?? "")
    .neq("id", opportunityId)
    .order("published_at", { ascending: false })
    .limit(10);

  const recentTenders = (related ?? [])
    .map(
      (r) =>
        `- ${r.title}${r.value_amount ? ` (£${r.value_amount.toLocaleString()})` : ""} — ${r.status}`,
    )
    .join("\n");

  const prompt = `You are a UK public procurement intelligence analyst helping a supplier prepare a bid response.

Buyer: ${opp.buyer_name ?? "Unknown"}
Region: ${opp.buyer_region ?? "Unknown"}
Current tender: ${opp.title}
Value: ${opp.value_amount ? `£${opp.value_amount.toLocaleString()} ${opp.value_currency ?? "GBP"}` : "Not specified"}
Stage: ${opp.procurement_stage}
Description: ${(opp.description ?? "").slice(0, 800)}

Recent tenders from this buyer:
${recentTenders || "No previous tenders found in our database."}

Write a concise 3-paragraph buyer briefing for the bid team. Cover:
1. Who this buyer is and what they typically procure (based on their tender history and description)
2. What this specific tender appears to prioritise (key requirements, evaluation themes, tone)
3. Practical guidance on what to emphasise in the bid response (evidence types, tone, differentiators)

Keep it factual, specific, and actionable. UK public sector context. No fluff.`;

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          stream: true,
          max_tokens: 500,
        });

        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        // Cache the result
        if (fullText) {
          await supabase
            .from("opportunities")
            .update({ buyer_briefing: fullText })
            .eq("id", opportunityId);
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `\n[Error generating briefing: ${err instanceof Error ? err.message : "unknown error"}]`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
