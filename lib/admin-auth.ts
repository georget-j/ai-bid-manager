import { NextResponse } from 'next/server'
import { getAuthUser } from './supabase-server'
import { isDemoMode, env } from './env'

/**
 * Returns null if the caller is allowed to perform an admin action.
 * Returns a 401/403 NextResponse if not.
 * Always returns null in DEMO_MODE.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (isDemoMode) return null

  const user = await getAuthUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (env.ADMIN_EMAILS.length > 0 && !env.ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
  }

  return null
}
