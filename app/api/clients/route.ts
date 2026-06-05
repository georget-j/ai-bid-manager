import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

const VERTICALS = [
  "it_cyber",
  "facilities",
  "construction",
  "healthcare",
  "education",
  "professional_services",
  "other",
] as const;

const CreateClientSchema = z.object({
  name: z.string().min(1).max(200),
  vertical: z.enum(VERTICALS).nullable().optional(),
  website: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "active";

  const supabase = getServiceSupabase();
  const query = supabase
    .from("clients")
    .select(
      "id, name, vertical, status, website, notes, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .order("name");

  if (status !== "all") query.eq("status", status);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, org_id: orgId })
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
