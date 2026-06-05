// Server-only Supabase client using the service role key.
// Import only from server components, API routes, and server-side lib files.
// Never import in client components — the service role key bypasses all RLS.
import { createClient } from "@supabase/supabase-js";

export function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
