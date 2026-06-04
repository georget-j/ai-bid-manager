import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  // Database connectivity
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("documents").select("id").limit(1);
    checks.database = error ? `error: ${error.message}` : "ok";
  } catch (err) {
    checks.database = `error: ${err instanceof Error ? err.message : "unknown"}`;
  }

  // OpenAI key present
  checks.openai = process.env.OPENAI_API_KEY ? "configured" : "missing";

  // Resend key present
  checks.resend = process.env.RESEND_API_KEY ? "configured" : "not configured";

  const allOk = checks.database === "ok" && checks.openai === "configured";

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 },
  );
}
