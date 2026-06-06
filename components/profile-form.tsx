"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_NAME = 40;

/**
 * Set/update the signed-in user's public display name. Upserts the
 * profiles row; user_id defaults to auth.uid() in SQL and RLS enforces it,
 * so the client only sends the name. The name is shown publicly (photo
 * credits, future OpenBeta attribution).
 */
export function ProfileForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    if (pending) return;
    setStatus("idle");
    startTransition(async () => {
      const supabase = createClient();
      const trimmed = name.trim().slice(0, MAX_NAME);
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { display_name: trimmed || null, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      setStatus(error ? "error" : "saved");
      if (error) console.error("Profile save failed:", error);
    });
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="display-name"
        className="block text-sm font-medium text-stone-700 dark:text-stone-200"
      >
        Display name
      </label>
      <input
        id="display-name"
        type="text"
        value={name}
        maxLength={MAX_NAME}
        onChange={(e) => {
          setName(e.target.value);
          setStatus("idle");
        }}
        placeholder="e.g. Alex H."
        className="w-full px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
      />
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Shown publicly as the credit on photos you upload (and on
        contributions). Leave blank to stay anonymous.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-1.5 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="text-sm text-green-700 dark:text-green-400">Saved.</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-700 dark:text-red-400">
            Couldn&apos;t save — try again.
          </span>
        )}
      </div>
    </div>
  );
}
