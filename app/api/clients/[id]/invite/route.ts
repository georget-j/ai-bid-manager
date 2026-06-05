import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId } = await params;

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@"))
    return NextResponse.json(
      { error: "Valid email required" },
      { status: 400 },
    );

  const supabase = getServiceSupabase();

  // Verify this client belongs to the caller's org
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectTo = `${appUrl}/auth/callback?client_id=${clientId}`;

  // Send Supabase invite email — creates auth user if they don't exist,
  // sends magic link if they do
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    { redirectTo },
  );

  if (inviteError) {
    console.error("[invite] Supabase invite failed:", inviteError.message);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // Record the invite on the client row
  await supabase
    .from("clients")
    .update({
      invited_email: email,
      invite_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId)
    .eq("org_id", orgId);

  return NextResponse.json({ ok: true, email });
}
