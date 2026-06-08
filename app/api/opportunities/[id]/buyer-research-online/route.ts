export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getOpportunityTenderTexts } from "@/lib/tender-docs";
import { webSearchSummary, type Citation } from "@/lib/research/web-search";
import { openai } from "@/lib/openai";

interface Params {
  params: Promise<{ id: string }>;
}

interface PersonResearch {
  name: string;
  role: string | null;
  summary: string;
  citations: Citation[];
}

interface BuyerWebResearch {
  buyer: { name: string; summary: string; citations: Citation[] } | null;
  people: PersonResearch[];
  generatedAt: string;
}

const MAX_PEOPLE = 5;

// Public-sources-only, cite-everything guidance shared by every search so the output
// stays evidence-grounded and reviewable.
const GROUNDING_RULES =
  "Use only public web sources. Support every factual claim with a cited source. " +
  "If you cannot find reliable public information, say so plainly rather than guessing. " +
  "Keep it factual, concise, and professional — UK public-sector procurement context.";

/** Extract real person names + roles mentioned in the tender text (best-effort). */
async function extractNamedPeople(
  text: string,
): Promise<Array<{ name: string; role: string | null }>> {
  if (!text.trim()) return [];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `From the UK tender text below, extract individual PEOPLE who are named (a real first and last name), with their role/title if stated. Exclude organisations, teams, and generic role mentions with no name. Return JSON { "people": [{ "name": string, "role": string | null }] } with at most ${MAX_PEOPLE} entries, most relevant first.\n\nTENDER TEXT:\n${text.slice(0, 6000)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? "{}",
    ) as { people?: Array<{ name?: string; role?: string | null }> };
    return (parsed.people ?? [])
      .filter((p) => typeof p.name === "string" && p.name.trim().length > 2)
      .slice(0, MAX_PEOPLE)
      .map((p) => ({ name: p.name!.trim(), role: p.role?.trim() || null }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const refresh = new URL(req.url).searchParams.get("refresh") === "true";
  const supabase = getServiceSupabase();

  const { data: opp } = await supabase
    .from("opportunities")
    .select(
      "title, description, buyer_name, buyer_region, buyer_identifier, buyer_web_research",
    )
    .eq("id", id)
    .maybeSingle();

  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (opp.buyer_web_research && !refresh) {
    return NextResponse.json(opp.buyer_web_research as BuyerWebResearch);
  }

  if (!opp.buyer_name) {
    const empty: BuyerWebResearch = {
      buyer: null,
      people: [],
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(empty);
  }

  // Gather text to mine for named people: description + any extracted document text.
  const docTexts = await getOpportunityTenderTexts(id);
  const peopleSource = [
    opp.description ?? "",
    ...docTexts.map((d) => d.extractedText),
  ]
    .join("\n\n")
    .slice(0, 12000);
  const namedPeople = await extractNamedPeople(peopleSource);

  // Run the buyer search and each person search in parallel.
  const buyerPromise = webSearchSummary({
    instructions: GROUNDING_RULES,
    query: `Research the UK public-sector buyer "${opp.buyer_name}"${
      opp.buyer_region ? ` (${opp.buyer_region})` : ""
    }. Summarise who they are, what they do, how they are structured, and any recent strategic or procurement priorities a supplier bidding for "${opp.title}" should know.`,
    maxOutputTokens: 550,
  });

  const peoplePromises = namedPeople.map((p) =>
    webSearchSummary({
      instructions: GROUNDING_RULES,
      query: `Research the person "${p.name}"${
        p.role ? `, ${p.role}` : ""
      } connected to the UK public-sector buyer "${opp.buyer_name}". Summarise their public professional profile and anything relevant to a supplier engaging with this buyer. If you cannot confidently identify this specific person, say so.`,
      maxOutputTokens: 350,
    }).then((res) => ({
      name: p.name,
      role: p.role,
      summary: res.text,
      citations: res.citations,
    })),
  );

  const [buyerRes, peopleResSettled] = await Promise.all([
    buyerPromise.catch(() => ({ text: "", citations: [] as Citation[] })),
    Promise.allSettled(peoplePromises),
  ]);

  const people: PersonResearch[] = peopleResSettled
    .filter(
      (r): r is PromiseFulfilledResult<PersonResearch> =>
        r.status === "fulfilled" && Boolean(r.value.summary),
    )
    .map((r) => r.value);

  const result: BuyerWebResearch = {
    buyer: buyerRes.text
      ? {
          name: opp.buyer_name,
          summary: buyerRes.text,
          citations: buyerRes.citations,
        }
      : null,
    people,
    generatedAt: new Date().toISOString(),
  };

  await supabase
    .from("opportunities")
    .update({ buyer_web_research: result })
    .eq("id", id);

  return NextResponse.json(result);
}
