import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

type Config = { windowSeconds: number; maxRequests: number };

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const LIMITS: Record<string, Config> = {
  ask: { windowSeconds: 3600, maxRequests: 20 },
  upload: { windowSeconds: 3600, maxRequests: 10 },
  seed: { windowSeconds: 3600, maxRequests: 3 },
  review_action: { windowSeconds: 3600, maxRequests: 30 },
  review_read: { windowSeconds: 3600, maxRequests: 120 },
  admin_write: { windowSeconds: 3600, maxRequests: 20 },
  admin_read: { windowSeconds: 3600, maxRequests: 60 },
  export: { windowSeconds: 3600, maxRequests: 10 },
  // Paid OpenAI web_search calls — see lib/research/web-search.ts. Hourly
  // brake per caller plus a daily budget per organisation (keyed org:<id>
  // via checkRateLimitKey). Both env-tunable.
  web_research: {
    windowSeconds: 3600,
    maxRequests: envInt("WEB_RESEARCH_HOURLY_LIMIT", 10),
  },
  web_research_org_daily: {
    windowSeconds: 86400,
    maxRequests: envInt("WEB_RESEARCH_DAILY_CAP", 25),
  },
};

function clientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Returns a 429 NextResponse if the caller has exceeded their quota,
 * or null if the request is allowed. Fails open on DB errors so a
 * missing rate_limits table never blocks legitimate traffic.
 */
export async function checkRateLimit(
  req: Request,
  endpoint: string,
): Promise<NextResponse | null> {
  return checkRateLimitKey(clientIP(req), endpoint);
}

/**
 * Same as checkRateLimit but with an explicit counter key instead of the
 * caller's IP — used for org-level budgets (key `org:<orgId>`), where the
 * quota must be shared by every member of the organisation.
 */
export async function checkRateLimitKey(
  key: string,
  endpoint: string,
): Promise<NextResponse | null> {
  const config = LIMITS[endpoint];
  if (!config) return null;

  const supabase = getServiceSupabase();

  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_ip: key,
    p_endpoint: endpoint,
    p_window_seconds: config.windowSeconds,
    p_max_requests: config.maxRequests,
  });

  if (error) {
    // Log prominently so the error is visible in production logs.
    // Fail open intentionally — a missing rate_limits table should not
    // block users, but the error must be investigated.
    console.error(
      "[rate-limit] FAIL-OPEN: DB error checking rate limit for",
      endpoint,
      "—",
      error.message,
    );
    return null;
  }

  if (!allowed) {
    const window =
      config.windowSeconds >= 86400
        ? "day"
        : config.windowSeconds >= 3600
          ? "hour"
          : `${Math.ceil(config.windowSeconds / 60)} minutes`;
    return NextResponse.json(
      {
        error: `Rate limit exceeded. You can make ${config.maxRequests} requests per ${window} on this endpoint. Try again later.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(config.windowSeconds) },
      },
    );
  }

  return null;
}
