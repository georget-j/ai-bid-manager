import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { checkRateLimit, checkRateLimitKey } from "@/lib/rate-limit";
import {
  webSearchSummary,
  webResearchDisabled,
  WEB_RESEARCH_DISABLED_MESSAGE,
  type Citation,
} from "@/lib/research/web-search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: Promise<{ name: string }>;
}

interface CachedResearch {
  text: string;
  citations: Citation[];
  generatedAt: string;
}

const CACHE_DAYS = (() => {
  const n = Number.parseInt(process.env.WEB_RESEARCH_CACHE_DAYS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
})();

/**
 * POST — grounded web research on a grant funder (online profile + citations).
 *
 * Web search is paid per call, so results are cached globally for CACHE_DAYS
 * (funders are public information — one search serves every org). ?refresh=true
 * re-runs the search; both paths sit behind an hourly per-caller limit and a
 * daily per-organisation budget.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (webResearchDisabled()) {
    return NextResponse.json(
      { error: WEB_RESEARCH_DISABLED_MESSAGE },
      { status: 503 },
    );
  }

  const { name } = await params;
  const funder = decodeURIComponent(name).slice(0, 200);
  const refresh = new URL(req.url).searchParams.get("refresh") === "true";
  const cacheKey = `funder:${funder.toLowerCase()}`;
  const supabase = getServiceSupabase();

  if (!refresh) {
    const { data: hit } = await supabase
      .from("web_research_cache")
      .select("payload, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (hit?.payload) {
      const ageMs = Date.now() - new Date(hit.created_at).getTime();
      if (ageMs < CACHE_DAYS * 86_400_000) {
        return NextResponse.json({
          ...(hit.payload as CachedResearch),
          cachedAt: hit.created_at,
        });
      }
    }
  }

  // Only uncached/refresh requests cost money — limit them.
  const limited =
    (await checkRateLimit(req, "web_research")) ??
    (await checkRateLimitKey(`org:${orgId}`, "web_research_org_daily"));
  if (limited) return limited;

  const result = await webSearchSummary({
    query: `UK grant funder "${funder}": what they fund, their funding priorities and themes, who is eligible, typical grant sizes, and how to approach them.`,
    instructions:
      "You are briefing a UK applicant on a grant funder. Summarise, in 4-6 short sentences, what this funder funds, their priorities/themes, who is eligible, and any tips for applicants. Be factual and cite official sources where possible. If you cannot find reliable information, say so briefly.",
    maxOutputTokens: 600,
  });

  // Cache only real answers — an empty result (search failure) should not
  // block a retry for 30 days.
  if (result.text) {
    const payload: CachedResearch = {
      ...result,
      generatedAt: new Date().toISOString(),
    };
    const { error: cacheError } = await supabase
      .from("web_research_cache")
      .upsert(
        { cache_key: cacheKey, payload, created_at: payload.generatedAt },
        { onConflict: "cache_key" },
      );
    if (cacheError)
      console.error(
        "[funder-research] cache write failed:",
        cacheError.message,
      );
  }

  return NextResponse.json(result);
}
