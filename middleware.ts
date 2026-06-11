import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// DEMO_MODE must never bypass auth in production — guard ensures accidental
// deployment with DEMO_MODE=true cannot expose data.
const DEMO_MODE =
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

// API endpoints that never need auth
const PUBLIC_API = ["/api/auth", "/api/health", "/api/cron"];
// Page routes accessible without a session
const PUBLIC_PAGES = [
  "/login",
  "/auth",
  "/how-it-works",
  "/industries",
  "/resources",
  "/pricing",
  "/services",
  "/contact",
];

// Platform-operator-only page prefixes (global system config) — others redirect to /.
// NOTE: /clients is org-scoped data, NOT operator-only — it's accessible to org members.
const OPERATOR_PAGES = ["/sources", "/admin", "/grant-sources"];

function computeIsOperator(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length === 0) {
    // No list configured: allow in dev/test only, never in production
    return process.env.NODE_ENV !== "production";
  }
  return adminEmails.includes(email);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  // Static assets and Next internals — skip entirely
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return response;
  }

  const isApi = pathname.startsWith("/api/");
  const isPublicApi = PUBLIC_API.some((p) => pathname.startsWith(p));
  const isPublicPage = PUBLIC_PAGES.some((p) => pathname.startsWith(p));

  if (isPublicApi || isPublicPage) return response;

  // CSRF: reject cross-origin state-changing API requests in non-demo mode
  if (
    isApi &&
    !DEMO_MODE &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
  ) {
    const origin = request.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (origin && appUrl) {
      try {
        const originHost = new URL(origin).host;
        const appHost = new URL(appUrl).host;
        if (originHost !== appHost) {
          return NextResponse.json(
            { error: "CSRF check failed" },
            { status: 403 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "CSRF check failed" },
          { status: 403 },
        );
      }
    }
  }

  // Demo mode bypasses auth for both pages and API routes
  if (DEMO_MODE) return response;

  // Verify Supabase session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API: 401; pages: redirect to /login
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Platform-operator enforcement ──────────────────────────────────────────
  const isOperator = computeIsOperator(user.email ?? "");

  // Block non-operators from operator-only page routes
  if (!isOperator && OPERATOR_PAGES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Plain (JS-readable) cookies so the client sidebar can render role-aware nav
  // without a round-trip. UI hints only — the redirect above + server-side
  // requireOrgRole/requireOperator are the real security boundaries.
  const cookieOpts = {
    httpOnly: false,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
  response.cookies.set("x-is-operator", isOperator ? "1" : "0", cookieOpts);

  // Org role drives org-scoped nav (Team, etc.). Look it up for page requests only
  // (the sidebar needs it; API handlers use getRequestOrgRole directly).
  if (!isApi) {
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    response.cookies.set("x-org-role", membership?.role ?? "", cookieOpts);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
