import { redirect } from "next/navigation";
import { PageNav } from "@/components/page-nav";
import { ProfileForm } from "@/components/profile-form";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Current display name, if any. Non-fatal: before profiles.sql is
  // applied this errors, so fall back to empty (form still works once the
  // table exists).
  let displayName = "";
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name")
      .maybeSingle();
    if (error) throw error;
    displayName = data?.display_name ?? "";
  } catch (err) {
    console.error("Profile fetch failed (non-fatal):", err);
  }

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-xl mx-auto">
        <PageNav />
        <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mt-6 mb-1">
          Account
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">
          {user.email}
        </p>
        <ProfileForm initialName={displayName} />
      </div>
    </main>
  );
}
