import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// One shared browser client per tab. Each client keeps its own auth
// listener, so if callers got separate instances, a sign-in/out performed
// on one (e.g. the login page or the sign-out button) wouldn't fire
// onAuthStateChange on the others (the auth store) — the UI would stay
// stale until a reload re-read the cookie. Keep it a singleton so every
// caller shares one auth event stream.
let client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
