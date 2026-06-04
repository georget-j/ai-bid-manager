import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getAllRoutingConfigs } from "@/lib/routing";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CreateRoutingSchema = z.object({
  topic: z.string().min(1),
  owner_email: z.email(),
  backup_email: z.email().optional().nullable(),
  slack_webhook_url: z.url().optional().nullable(),
  preferred_channel: z.enum(["email", "slack", "both"]).default("email"),
  escalation_hours: z.number().int().positive().default(48),
});

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "admin_read");
  if (limited) return limited;
  const configs = await getAllRoutingConfigs();
  return NextResponse.json(configs);
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

  const parsed = CreateRoutingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("routing_config")
    .insert(parsed.data)
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
