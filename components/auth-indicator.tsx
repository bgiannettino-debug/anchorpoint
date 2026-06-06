import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export async function AuthIndicator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="ml-auto text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
      >
        Sign in
      </Link>
    );
  }

  // Prefer the display name; fall back to email. Non-fatal before
  // profiles.sql is applied.
  let displayName: string | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .maybeSingle();
    displayName = data?.display_name ?? null;
  } catch {
    // profiles table not present yet — fall back to email.
  }

  return (
    <>
      <Link
        href="/account"
        className="hidden sm:inline text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 truncate max-w-[24ch]"
      >
        {displayName || user.email}
      </Link>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <Link
          href="/bookmarks"
          className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          Bookmarks
        </Link>
        <Link
          href="/ticks"
          className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          Ticks
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
