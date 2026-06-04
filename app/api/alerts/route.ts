import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

const CreateSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  cpv_codes: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  buyers: z.array(z.string()).default([]),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  stages: z.array(z.string()).default([]),
  channel: z.string().default("in-app"),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) return NextResponse.json({ rules: [] });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("alert_rules")
    .select("*, alert_matches(id, seen)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const rules = (data ?? []).map((r) => {
    const matches = Array.isArray(r.alert_matches) ? r.alert_matches : [];
    return {
      ...r,
      match_count: matches.length,
      unseen_count: matches.filter((m: { seen: boolean }) => !m.seen).length,
      alert_matches: undefined,
    };
  });

  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("alert_rules")
    .insert({
      org_id: orgId,
      ...parsed.data,
      min_value: parsed.data.min_value ?? null,
      max_value: parsed.data.max_value ?? null,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data });
}
