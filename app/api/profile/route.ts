import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getOrgProfile, upsertOrgProfile } from "@/lib/procurement/data";

const InsuranceSchema = z
  .object({
    professional_indemnity: z.number().nullable().optional(),
    public_liability: z.number().nullable().optional(),
    employers_liability: z.number().nullable().optional(),
  })
  .nullable()
  .optional();

const ProfileSchema = z.object({
  name: z.string().min(1),
  organisation_type: z.string().optional(),
  sectors: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  cpv_codes: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  accreditations: z.array(z.string()).default([]),
  insurance: InsuranceSchema,
  min_contract_value: z.number().nullable().optional(),
  max_contract_value: z.number().nullable().optional(),
  preferred_buyers: z.array(z.string()).default([]),
  excluded_buyers: z.array(z.string()).default([]),
  excluded_keywords: z.array(z.string()).default([]),
  // Buildout (migration 053)
  company_size_band: z.string().nullable().optional(),
  annual_turnover: z.number().nullable().optional(),
  year_established: z.number().int().nullable().optional(),
  delivery_models: z.array(z.string()).default([]),
  social_value: z.array(z.string()).default([]),
});

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ profile: null });
  }

  const profile = await getOrgProfile(orgId);
  return NextResponse.json({ profile });
}

export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const parsed = ProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid profile data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const profile = await upsertOrgProfile(orgId, {
      ...parsed.data,
      organisation_type: parsed.data.organisation_type ?? null,
      min_contract_value: parsed.data.min_contract_value ?? null,
      max_contract_value: parsed.data.max_contract_value ?? null,
      insurance: parsed.data.insurance ?? null,
      company_size_band: parsed.data.company_size_band ?? null,
      annual_turnover: parsed.data.annual_turnover ?? null,
      year_established: parsed.data.year_established ?? null,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
