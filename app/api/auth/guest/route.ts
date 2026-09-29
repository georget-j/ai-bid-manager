import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateOrgForUser } from "@/lib/org";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, "guest");
  if (limited) return limited;

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

  // Reuse an existing session if this route is hit directly while signed in.
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  let user = existingUser;

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error || !data.user) {
      console.error("[auth/guest] anonymous sign-in failed:", error?.message);
      return NextResponse.json(
        {
          error:
            "Guest access is not enabled yet. Enable Anonymous Sign-Ins in Supabase Auth settings.",
        },
        { status: 503 },
      );
    }

    user = data.user;
  }

  try {
    await getOrCreateOrgForUser(user.id, user.email ?? null);
  } catch (error) {
    console.error("[auth/guest] org provisioning failed:", error);
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json(
      { error: "Could not create your private guest workspace." },
      { status: 500 },
    );
  }

  const redirectTo = safeRedirect(request.nextUrl.searchParams.get("redirectTo"));
  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
