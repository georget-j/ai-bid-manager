import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  // client_id is set when an agency admin sends a client invite link
  const clientId = searchParams.get("client_id");

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
      const orgId = await getOrCreateOrgForUser(
        sessionData.user.id,
        sessionData.user.email ?? "",
      ).catch((err) => {
        console.error("[auth/callback] org provision failed:", err);
        return null;
      });

      // If this login came from a client invite link, link the client record
      // to the new org. The invited_email check prevents URL-spoofing.
      if (clientId && orgId && sessionData.user.email) {
        const { getServiceSupabase } = await import("@/lib/supabase-service");
        const svc = getServiceSupabase();
        await svc
          .from("clients")
          .update({
            client_org_id: orgId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId)
          .eq("invited_email", sessionData.user.email)
          .is("client_org_id", null); // only link once
      }

      return NextResponse.redirect(new URL(redirectTo, origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", origin));
}
