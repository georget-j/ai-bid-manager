// Validates required environment variables at module load time.
// Import this in any server-only file to ensure misconfigured deployments fail loudly.
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
] as const

const missing = REQUIRED.filter((key) => !process.env[key])
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
}

export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? 'rfp-agent@noreply.com',
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '',
  DEMO_MODE: process.env.DEMO_MODE === 'true',
  // Comma-separated list of emails allowed to access /api/admin/* in non-demo mode.
  // If empty, any authenticated user may access admin routes.
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
}

export const isDemoMode = env.DEMO_MODE
