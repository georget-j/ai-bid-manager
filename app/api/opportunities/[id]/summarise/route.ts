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

  const { data: opp } = await supabase
    .from("opportunities")
    .select(
      "title, buyer_name, description, cpv_codes, value_amount, deadline_at",
    )
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const description = (opp.description ?? "").slice(0, 4000);

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content:
          "You are a UK public procurement analyst. Write concise, plain-English summaries for bid managers.",
      },
      {
        role: "user",
        content: `Summarise this UK public sector tender in exactly 3 bullet points (each starting with "• "):
1. What the buyer wants to achieve (the core need or service)
2. The key requirements or conditions the winning supplier must meet
3. What the ideal supplier looks like (size, experience, accreditations)

Tender title: ${opp.title}
Buyer: ${opp.buyer_name ?? "Unknown"}
Description:
${description}

Only output the 3 bullet points. No headings, no intro, no conclusion.`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
