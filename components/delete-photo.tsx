"use client";

import { useState, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/photos";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";

type Props = {
  ownerId: string;
  photoId: string;
  storagePath: string;
};

/**
 * Delete control overlaid on a photo the current user owns. Two-step
 * (✕ → confirm) to avoid accidental deletes. Removes the climb_photos row
 * then the storage object (RLS limits both to the owner, so this is the
 * real gate — the control only shows for owned photos as a courtesy), then
 * refreshes so the gallery drops it.
 */
export function DeletePhoto({ ownerId, photoId, storagePath }: Props) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // Only the owner sees the control; RLS enforces the actual permission.
  const isOwner = auth.status === "signed-in" && auth.userId === ownerId;
  if (!isOwner) return null;

  function remove() {
    startTransition(async () => {
      const supabase = createClient();
      // Row first: once it's gone the photo leaves the gallery even if the
      // object lingers. RLS scopes the delete to this user's own row.
      const { error } = await supabase
        .from("climb_photos")
        .delete()
        .eq("id", photoId);
      if (error) {
        console.error("Photo delete failed:", error);
        setConfirming(false);
        return;
      }
      // Best-effort object cleanup; a leftover object is harmless.
      await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([storagePath])
        .catch(() => {});
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="absolute top-0 right-0 m-1 flex items-center gap-1">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded bg-red-600/90 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded bg-black/55 px-2 py-0.5 text-[11px] text-white/90 hover:bg-black/70 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label="Delete photo"
      className="absolute top-0 right-0 m-1 h-6 w-6 rounded-full bg-black/55 text-sm leading-none text-white/90 hover:bg-black/75"
    >
      ✕
    </button>
  );
}
