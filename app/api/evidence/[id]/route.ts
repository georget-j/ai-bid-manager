import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Update / delete one of the organisation's own credentials.
 *
 * Every query filters on org_id AND client_id IS NULL so these routes can
 * never touch another org's rows or a client-scoped evidence item.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const UpdateCredentialSchema = z.object({
  title: z
    .string()
    .min(1, "Please give this credential a name")
    .max(300)
    .optional(),
  evidence_type: z
    .enum([
      "certification",
      "accreditation",
      "insurance",
      "membership",
      "policy",
      "case_study",
      "financial",
      "reference",
      "other",
    ])
    .optional(),
  issuer: z.string().max(200).nullable().optional(),
  reference_number: z.string().max(100).nullable().optional(),
  issued_at: z
    .string()
    .regex(ISO_DATE, "The valid-from date doesn't look right")
    .nullable()
    .optional(),
  expires_at: z
    .string()
    .regex(ISO_DATE, "The expiry date doesn't look right")
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  document_id: z.string().uuid().nullable().optional(),
});

/** PATCH — update a credential (the DB trigger recomputes its status). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateCredentialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("evidence_items")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("client_id", null)
    .select("*")
    .single();

  if (error || !data)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

/** DELETE — remove a credential record (does not delete any linked document). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getServiceSupabase();

  const { error } = await supabase
    .from("evidence_items")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .is("client_id", null);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
