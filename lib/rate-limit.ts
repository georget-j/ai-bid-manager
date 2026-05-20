import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

type Config = { windowSeconds: number; maxRequests: number }

const LIMITS: Record<string, Config> = {
  ask:           { windowSeconds: 3600, maxRequests: 20 },
  upload:        { windowSeconds: 3600, maxRequests: 10 },
  seed:          { windowSeconds: 3600, maxRequests: 3  },
  review_action: { windowSeconds: 3600, maxRequests: 30 },
  review_read:   { windowSeconds: 3600, maxRequests: 120 },
  admin_write:   { windowSeconds: 3600, maxRequests: 20 },
  admin_read:    { windowSeconds: 3600, maxRequests: 60 },
  export:        { windowSeconds: 3600, maxRequests: 10 },
}

function clientIP(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
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
  const config = LIMITS[endpoint]
  if (!config) return null

  const ip = clientIP(req)
  const supabase = getServiceSupabase()

  const { data: allowed, error } = await supabase.rpc('check_rate_limit', {
    p_ip: ip,
    p_endpoint: endpoint,
    p_window_seconds: config.windowSeconds,
    p_max_requests: config.maxRequests,
  })

  if (error) {
    // Table / function not yet created — fail open rather than blocking users
    console.warn('[rate-limit] DB error (migration pending?):', error.message)
    return null
  }

  if (!allowed) {
    const retryMinutes = Math.ceil(config.windowSeconds / 60)
    return NextResponse.json(
      {
        error: `Rate limit exceeded. You can make ${config.maxRequests} requests per hour on this endpoint. Try again in up to ${retryMinutes} minutes.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(config.windowSeconds) },
      },
    )
  }

  return null
}
