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
  storage_path: string;
  width: number;
  height: number;
  caption: string | null;
};

// Public URL for an object in the photo bucket. Public buckets serve at a
// stable path, so we can build this without a Supabase round-trip.
export function publicPhotoUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;
}

export function uploadedPhoto(row: ClimbPhotoRow): GalleryPhoto {
  const url = publicPhotoUrl(row.storage_path);
  return {
    src: url,
    href: url,
    width: row.width,
    height: row.height,
    // Attribution per uploader needs a profiles table (none yet), so all
    // community uploads share one credit for now.
    credit: "Community",
  };
}

// Fetch a climb's user-uploaded photos as ready-to-render GalleryPhotos.
// Non-fatal and degrades to [] — so the climb page works before
// climb-photos.sql is applied (the table simply doesn't exist yet).
export async function fetchClimbPhotos(
  supabase: SupabaseClient,
  climbUuid: string,
): Promise<GalleryPhoto[]> {
  try {
    const { data, error } = await supabase
      .from("climb_photos")
      .select("storage_path, width, height, caption")
      .eq("climb_uuid", climbUuid)
      .order("created_at", { ascending: false })
      .limit(24);
    if (error) throw error;
    return ((data ?? []) as ClimbPhotoRow[]).map(uploadedPhoto);
  } catch (err) {
    console.error("Climb photos fetch failed (non-fatal):", err);
    return [];
  }
}
