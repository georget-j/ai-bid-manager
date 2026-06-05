import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const EVIDENCE_TYPES = [
  "certification",
  "policy",
  "case_study",
  "financial",
  "accreditation",
  "reference",
  "other",
] as const;

const CreateEvidenceSchema = z.object({
  title: z.string().min(1).max(300),
  evidence_type: z.enum(EVIDENCE_TYPES),
  issuer: z.string().max(200).nullable().optional(),
  reference_number: z.string().max(100).nullable().optional(),
  issued_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  document_id: z.string().uuid().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId } = await params;
  const supabase = getServiceSupabase();

  const { data, error } = await supabase
    .from("evidence_items")
    .select(
      "id, title, evidence_type, status, issuer, reference_number, issued_at, expires_at, notes, document_id, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .eq("client_id", clientId)
    .order("evidence_type")
    .order("title");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId } = await params;

  // Verify client belongs to this org
  const supabase = getServiceSupabase();
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!client)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateEvidenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("evidence_items")
    .insert({ ...parsed.data, org_id: orgId, client_id: clientId })
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
