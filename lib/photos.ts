// Shared photo helpers for the climb/area galleries and the upload flow.
// Pure + isomorphic: no DOM, no server-only APIs, so both the server pages
// (fetch + render) and the client upload component can import from here.

import type { SupabaseClient } from "@supabase/supabase-js";

// OpenBeta serves its community media from here; mediaUrl values are paths
// relative to it.
export const MEDIA_HOST = "https://media.openbeta.io";

// Public Storage bucket for user uploads (see supabase/climb-photos.sql).
export const PHOTO_BUCKET = "climb-photos";
// License the uploader consents to — kept in sync with the SQL default and
// shown in the consent checkbox. CC BY-SA 4.0 matches OpenBeta's media
// license, so these stay upstream-ready.
export const PHOTO_LICENSE = "CC BY-SA 4.0";

// Upload limits / processing knobs (used client-side before upload).
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // pre-resize guard
export const MAX_IMAGE_DIM = 2048; // longest edge after downscale
export const JPEG_QUALITY = 0.85;
export const MAX_CAPTION = 280;

// A photo ready to render in the gallery. `src` and `href` are absolute
// URLs (next/image needs the host allow-listed in next.config).
export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  credit?: string | null;
  href?: string;
  // Uploaded photos only: shown beneath the image when present.
  caption?: string | null;
  // Uploaded photos only: who owns it + what the delete control needs.
  // The page is cached, so ownership is decided client-side (compare
  // ownerId to the signed-in user); RLS is the real gate.
  owned?: { ownerId: string; photoId: string; storagePath: string };
};

export type OpenBetaMedia = {
  mediaUrl: string;
  width: number;
  height: number;
  username?: string | null;
};

export function openBetaPhoto(m: OpenBetaMedia): GalleryPhoto {
  const url = `${MEDIA_HOST}${m.mediaUrl}`;
  return {
    src: url,
    href: url,
    width: m.width,
    height: m.height,
    credit: m.username ?? null,
  };
}

export type ClimbPhotoRow = {
  id: string;
  user_id: string;
  storage_path: string;
  width: number;
  height: number;
  caption: string | null;
  // Joined from profiles (when set); the uploader's public display name.
  display_name?: string | null;
};

// Public URL for an object in the photo bucket. Public buckets serve at a
// stable path, so we can build this without a Supabase round-trip.
export function publicPhotoUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;
}

// Map an uploaded row to a GalleryPhoto. Ownership (for the delete control)
// is resolved client-side from `owned.ownerId`, so this stays pure and the
// page can be cached.
export function uploadedPhoto(row: ClimbPhotoRow): GalleryPhoto {
  const url = publicPhotoUrl(row.storage_path);
  return {
    src: url,
    href: url,
    width: row.width,
    height: row.height,
    // The uploader's display name when they've set one; otherwise a
    // generic credit.
    credit: row.display_name?.trim() || "Community",
    caption: row.caption,
    owned: {
      ownerId: row.user_id,
      photoId: row.id,
      storagePath: row.storage_path,
    },
  };
}

// Fetch a climb's user-uploaded photo rows (newest first). Non-fatal and
// degrades to [] — so the climb page works before climb-photos.sql is
// applied (the table simply doesn't exist yet). The page maps these to
// GalleryPhotos once it knows the viewer (for the delete control).
export async function fetchClimbPhotoRows(
  supabase: SupabaseClient,
  climbUuid: string,
): Promise<ClimbPhotoRow[]> {
  try {
    const { data, error } = await supabase
      .from("climb_photos")
      .select("id, user_id, storage_path, width, height, caption")
      .eq("climb_uuid", climbUuid)
      .order("created_at", { ascending: false })
      .limit(24);
    if (error) throw error;
    const rows = (data ?? []) as ClimbPhotoRow[];
    await attachDisplayNames(supabase, rows);
    return rows;
  } catch (err) {
    console.error("Climb photos fetch failed (non-fatal):", err);
    return [];
  }
}

// Look up uploaders' display names in one query and attach them to the
// rows. No FK between climb_photos and profiles (both point at auth.users),
// so this is a separate lookup rather than an embedded join. Non-fatal:
// before profiles.sql is applied this errors and credits fall back to
// "Community".
async function attachDisplayNames(
  supabase: SupabaseClient,
  rows: ClimbPhotoRow[],
): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (ids.length === 0) return;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", ids);
    if (error) throw error;
    const byId = new Map(
      (data ?? []).map((p: { user_id: string; display_name: string | null }) => [
        p.user_id,
        p.display_name,
      ]),
    );
    for (const r of rows) r.display_name = byId.get(r.user_id) ?? null;
  } catch (err) {
    console.error("Profile name lookup failed (non-fatal):", err);
  }
}
