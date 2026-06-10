import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { lookupCompany, lookupCharity } from "@/lib/research/registers";

export const dynamic = "force-dynamic";

/**
 * POST { companyNumber?, charityNumber? } — look up the free UK registers and return
 * suggested grant-eligibility profile fields for the client to merge into the form.
 */
export async function POST(req: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { companyNumber?: string; charityNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const [company, charity] = await Promise.all([
    body.companyNumber ? lookupCompany(body.companyNumber) : null,
    body.charityNumber ? lookupCharity(body.charityNumber) : null,
  ]);

  // Charity details take precedence for legal form (a charity may also be a company).
  const merged = {
    ...(company ?? {}),
    ...(charity ?? {}),
    notes: [...(company?.notes ?? []), ...(charity?.notes ?? [])],
  };

  return NextResponse.json({ enrichment: merged });
}
