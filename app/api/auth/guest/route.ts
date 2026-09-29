import { randomBytes, randomUUID } from "crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateOrgForUser } from "@/lib/org";
import { checkRateLimit } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function isGuest(user: { user_metadata?: Record<string, unknown> | null }) {
  return user.user_metadata?.is_guest === true;
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
    // Create a hidden email/password identity with the service role, then sign it
    // in through the normal browser-session client. This avoids a visible login
    // and does not require Supabase Anonymous Sign-Ins to be enabled.
    const token = randomUUID();
    const email = `guest-${token}@guest.invalid`;
    const password = randomBytes(32).toString("base64url");
    const admin = getServiceSupabase();

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { is_guest: true },
      });

    if (createError || !created.user) {
      console.error("[auth/guest] guest user creation failed:", createError?.message);
      return NextResponse.json(
        { error: "Could not create your private guest session." },
        { status: 503 },
      );
    }

    const { data: signedIn, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signedIn.user) {
      console.error("[auth/guest] guest sign-in failed:", signInError?.message);
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      return NextResponse.json(
        { error: "Could not start your private guest session." },
        { status: 503 },
      );
    }

    user = signedIn.user;
  }

  try {
    // Guest auth emails are implementation details and must never drive invite
    // matching or org naming. Real signed-in users keep their normal email path.
    await getOrCreateOrgForUser(
      user.id,
      isGuest(user) ? null : (user.email ?? null),
    );
  } catch (error) {
    console.error("[auth/guest] org provisioning failed:", error);
    const admin = getServiceSupabase();
    if (isGuest(user)) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json(
      { error: "Could not create your private guest workspace." },
      { status: 500 },
    );
  }

  const redirectTo = safeRedirect(request.nextUrl.searchParams.get("redirectTo"));
  return NextResponse.redirect(new URL(redirectTo, request.url), 303);
}
