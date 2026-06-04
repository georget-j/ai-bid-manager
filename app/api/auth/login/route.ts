import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, mode } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 },
      );
    }

    // Password sign-in
    if (mode === "password") {
      if (!password || typeof password !== "string") {
        return NextResponse.json(
          { error: "Password required" },
          { status: 400 },
        );
      }

      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (cookiesToSet) => {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            },
          },
        },
      );

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (error) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 },
        );
      }

      // Ensure org exists
      if (data.user) {
        const { getOrCreateOrgForUser } = await import("@/lib/org");
        await getOrCreateOrgForUser(data.user.id, data.user.email ?? "").catch(
          (err) => console.error("[auth/login] org provision failed:", err),
        );
      }

      return NextResponse.json({ ok: true, redirect: "/" });
    }

    // Magic link (default)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const redirectTo = `${appUrl}/auth/callback?redirectTo=/`;

    const supabase = getServiceSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });

    if (error) {
      console.error("[auth/login]", error.message);
      return NextResponse.json(
        { error: "Failed to send magic link" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
