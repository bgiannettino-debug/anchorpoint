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
        className="text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
      >
        Sign in
      </Link>
    );
  }

  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <span className="text-stone-600 dark:text-stone-400">{user.email}</span>
      <button
        type="submit"
        className="text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
      >
        Sign out
      </button>
    </form>
  );
}
