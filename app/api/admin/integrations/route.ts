import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getServiceSupabase } from "@/lib/supabase-service";
import { requireAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UpsertIntegrationSchema = z.object({
  platform: z.enum(["resend", "slack"]),
  settings: z.record(z.string(), z.unknown()),
  is_active: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "admin_read");
  if (limited) return limited;
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("integration_settings")
    .select("platform, settings, is_active, updated_at")
    .order("platform");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "admin_write");
  if (limited) return limited;
  const denied = await requireAdmin();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpsertIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("integration_settings")
    .upsert(
      { ...parsed.data, updated_at: new Date().toISOString() },
      { onConflict: "platform" },
    )
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
