import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/review";

  if (code) {
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

    const { data: sessionData, error } =
      await supabase.auth.exchangeCodeForSession(code);
    if (!error && sessionData.user) {
      // Provision org membership on first login (no-op if already a member)
      const { getOrCreateOrgForUser } = await import("@/lib/org");
      await getOrCreateOrgForUser(
        sessionData.user.id,
        sessionData.user.email ?? "",
      ).catch((err) =>
        console.error("[auth/callback] org provision failed:", err),
      );
      return NextResponse.redirect(new URL(redirectTo, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", origin));
}
