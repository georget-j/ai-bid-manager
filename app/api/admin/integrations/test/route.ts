import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { sendSlackTestNotification } from "@/lib/notifications";
import { requireAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const DEMO_PREVIEW = {
  topic: "Security & Compliance",
  question:
    "Can you describe your SOC 2 Type II certification status and audit scope?",
  summary:
    "We hold SOC 2 Type II certification covering Security, Availability, and Confidentiality trust service criteria, renewed annually with zero critical findings in the last audit cycle.",
  confidence: "High (84%)",
  risk: "High",
  reviewLink: "#",
};

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "admin_write");
  if (limited) return limited;
  const denied = await requireAdmin();
  if (denied) return denied;

  const { platform } = await req.json().catch(() => ({ platform: null }));

  if (platform === "slack") {
    if (process.env.DEMO_MODE === "true") {
      return NextResponse.json({ ok: true, demo: true, preview: DEMO_PREVIEW });
    }

    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("platform", "slack")
      .maybeSingle();

    if (!data?.is_active) {
      return NextResponse.json(
        { error: "Slack integration is not active" },
        { status: 400 },
      );
    }

    const webhookUrl = (data.settings as Record<string, string>)?.webhook_url;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "No webhook URL configured" },
        { status: 400 },
      );
    }

    try {
      await sendSlackTestNotification(webhookUrl);
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Slack test failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (platform === "resend") {
    if (process.env.DEMO_MODE === "true") {
      return NextResponse.json({ ok: true, demo: true });
    }
    return NextResponse.json({ error: "Not implemented" }, { status: 501 });
  }

  return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
}
