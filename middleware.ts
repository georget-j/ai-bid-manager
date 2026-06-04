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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
