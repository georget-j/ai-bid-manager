import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const DEMO_MODE = process.env.DEMO_MODE === 'true'

const ALWAYS_PUBLIC = ['/api/auth', '/api/health']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next({ request })

  // Skip non-API routes and always-public endpoints
  if (!pathname.startsWith('/api/')) return response
  if (ALWAYS_PUBLIC.some((p) => pathname.startsWith(p))) return response

  // CSRF: reject cross-origin state-changing requests in non-demo mode
  if (!DEMO_MODE && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (origin && appUrl) {
      try {
        const originHost = new URL(origin).host
        const appHost = new URL(appUrl).host
        if (originHost !== appHost) {
          return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 })
        }
      } catch {
        // Malformed URLs — fail safe by blocking
        return NextResponse.json({ error: 'CSRF check failed' }, { status: 403 })
      }
    }
  }

  // Skip auth enforcement in demo mode
  if (DEMO_MODE) return response

  // Verify Supabase session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
