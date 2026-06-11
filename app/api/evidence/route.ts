import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

/**
 * Org-scoped credentials in the Evidence library.
 *
 * These are evidence_items rows with client_id NULL — they belong to the
 * organisation itself (its own certifications, insurance, memberships…),
 * not to an agency client. Client-scoped evidence lives under
 * /api/clients/[id]/evidence and always carries a client_id.
 */

/** Kept in sync with the evidence_items CHECK constraint (migration 070). */
const EVIDENCE_TYPES = [
  "certification",
  "accreditation",
  "insurance",
  "membership",
  "policy",
  "case_study",
  "financial",
  "reference",
  "other",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CreateCredentialSchema = z.object({
  title: z.string().min(1, "Please give this credential a name").max(300),
  evidence_type: z.enum(EVIDENCE_TYPES),
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

/** GET — list the organisation's own credentials (client_id null). */
export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("evidence_items")
    .select(
      "id, title, evidence_type, status, issuer, reference_number, issued_at, expires_at, notes, document_id, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .is("client_id", null)
    .order("evidence_type")
    .order("title");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST — add a credential for the organisation. */
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

  const parsed = CreateCredentialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("evidence_items")
    // client_id null marks this as the org's own credential, not a client's.
    .insert({ ...parsed.data, org_id: orgId, client_id: null })
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
