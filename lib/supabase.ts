import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (anon key) — safe to use in client components.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Re-export for backward compatibility.
// Prefer importing directly from @/lib/supabase-service in server-only code.
export { getServiceSupabase } from "./supabase-service";
