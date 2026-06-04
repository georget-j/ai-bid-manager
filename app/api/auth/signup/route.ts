import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 },
      );
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
    });

    if (error) {
      console.error("[auth/signup]", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      const { getOrCreateOrgForUser } = await import("@/lib/org");
      await getOrCreateOrgForUser(data.user.id, data.user.email ?? "").catch(
        (err) => console.error("[auth/signup] org provision failed:", err),
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
