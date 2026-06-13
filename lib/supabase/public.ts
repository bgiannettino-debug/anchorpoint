import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cookieless anon Supabase client for PUBLIC reads in cached (ISR) server
// components. The cookie-based server client (./server) calls cookies(),
// which opts the route into dynamic rendering — using this instead lets
// climb/area pages be statically cached. Only use for data that's the same
// for everyone (RLS still applies via the anon role). Anything user-specific
// must be read client-side.
let cached: SupabaseClient | null = null;

export function publicClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}
