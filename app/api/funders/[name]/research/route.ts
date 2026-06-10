import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { webSearchSummary } from "@/lib/research/web-search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ name: string }>;
}

/** POST — grounded web research on a grant funder (online profile + citations). */
export async function POST(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const funder = decodeURIComponent(name).slice(0, 200);

  const result = await webSearchSummary({
    query: `UK grant funder "${funder}": what they fund, their funding priorities and themes, who is eligible, typical grant sizes, and how to approach them.`,
    instructions:
      "You are briefing a UK applicant on a grant funder. Summarise, in 4-6 short sentences, what this funder funds, their priorities/themes, who is eligible, and any tips for applicants. Be factual and cite official sources where possible. If you cannot find reliable information, say so briefly.",
    contextSize: "medium",
    maxOutputTokens: 600,
  });

  return NextResponse.json(result);
}
