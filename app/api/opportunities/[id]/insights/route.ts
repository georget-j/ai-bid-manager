export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getOpportunity, getOrgProfile } from "@/lib/procurement/data";
import { getOpportunityTenderTexts } from "@/lib/tender-docs";
import { openai, CHAT_MODEL } from "@/lib/openai";
import type { NormalizedLot } from "@/lib/procurement/types";

interface Params {
  params: Promise<{ id: string }>;
}

interface Insight {
  summary: string;
  key_points: string[];
  feasibility: string | null;
  gaps: string[];
  created_at: string;
}

// GET — most recent stored insight (or null).
export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("opportunity_insights")
    .select("summary, key_points, feasibility, gaps, created_at")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ insight: data ?? null });
}

// POST — generate an AI executive summary + feasibility + key gaps and store it.
export async function POST(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const opp = await getOpportunity(opportunityId);
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tender context: description + lots + linked documents' extracted text.
  const lots = (opp.lots ?? []) as NormalizedLot[];
  const lotText = lots
    .map((l, i) => `Lot ${i + 1}: ${l.title ?? ""}\n${l.description ?? ""}`)
    .join("\n\n");
  const linked = await getOpportunityTenderTexts(opportunityId);
  const docText = linked
    .map((d) => `### ${d.title}\n${d.extractedText.slice(0, 5000)}`)
    .join("\n\n");

  const valueStr = opp.value_amount
    ? `£${Number(opp.value_amount).toLocaleString()}`
    : "not stated";

  const tenderContext = [
    `Title: ${opp.title}`,
    opp.buyer_name ? `Buyer: ${opp.buyer_name}` : "",
    `Value: ${valueStr}`,
    opp.deadline_at ? `Deadline: ${opp.deadline_at}` : "",
    opp.description ? `\nDescription:\n${opp.description}` : "",
    lotText ? `\nLots:\n${lotText}` : "",
    docText ? `\nTender documents:\n${docText}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 16000);

  // Org capability context (optional) so feasibility is supplier-aware.
  const profile = await getOrgProfile(orgId);
  const capability = profile
    ? [
        profile.services?.length
          ? `Services: ${profile.services.join(", ")}`
          : "",
        profile.keywords?.length
          ? `Keywords: ${profile.keywords.join(", ")}`
          : "",
        profile.certifications?.length
          ? `Certifications: ${profile.certifications.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const prompt = `You are a senior UK public-sector bid analyst. Read the tender below and produce a concise, decision-useful brief for a supplier considering whether to bid.

TENDER:
${tenderContext}
${capability ? `\nSUPPLIER CAPABILITY (assess fit against this):\n${capability}` : ""}

Return ONLY JSON:
{
  "summary": "2-4 sentence plain-English executive summary of what the buyer wants and why",
  "key_points": ["4-6 short bullets: scope, value, deadline, contract length, key requirements"],
  "feasibility": "2-3 sentences on how feasible/competitive this is${capability ? " for the supplier above" : ""} — complexity, what it takes to win, any disqualifiers",
  "gaps": ["3-5 short bullets: the most important things a bidder must evidence or address to be competitive"]
}`;

  let insight: Omit<Insight, "created_at">;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1200,
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as Partial<Insight>;
    insight = {
      summary: (parsed.summary ?? "").trim() || "No summary generated.",
      key_points: Array.isArray(parsed.key_points)
        ? parsed.key_points.slice(0, 8)
        : [],
      feasibility:
        typeof parsed.feasibility === "string" ? parsed.feasibility : null,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 8) : [],
    };
  } catch {
    return NextResponse.json(
      { error: "Could not generate insights — please try again." },
      { status: 500 },
    );
  }

  const supabase = getServiceSupabase();
  await supabase.from("opportunity_insights").insert({
    opportunity_id: opportunityId,
    org_id: orgId,
    summary: insight.summary,
    key_points: insight.key_points,
    feasibility: insight.feasibility,
    gaps: insight.gaps,
  });

  return NextResponse.json({
    insight: { ...insight, created_at: new Date().toISOString() },
  });
}
