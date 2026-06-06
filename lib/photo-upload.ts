// Client-only: downscale + re-encode an image in the browser, then upload
// it to Supabase Storage and record a climb_photos row. Resizing caps
// storage/bandwidth (phone photos are often 5–12 MB) and re-encoding to
// JPEG via canvas strips EXIF — including GPS — for free. Runs entirely in
// the browser (uses canvas), so only import from client components.

import { createClient } from "@/lib/supabase/client";
import {
  PHOTO_BUCKET,
  PHOTO_LICENSE,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_DIM,
  JPEG_QUALITY,
  MAX_CAPTION,
} from "@/lib/photos";

export type UploadResult = { ok: true } | { ok: false; error: string };

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honors EXIF orientation and handles HEIC where the
  // browser can decode it (Safari). Fall back to an <img> element.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to the <img> path
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

async function processImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  const source = await loadBitmap(file);
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("encode failed");
  return { blob, width, height };
}

export async function uploadClimbPhoto(
  climbUuid: string,
  file: File,
  caption: string,
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That image is too large (max 15 MB)." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to add a photo." };

  let processed;
  try {
    processed = await processImage(file);
  } catch {
    return { ok: false, error: "Couldn't read that image — try a JPG or PNG." };
  }

  // Top folder = uploader id, matching the Storage RLS policy.
  const path = `${user.id}/${climbUuid}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, processed.blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    console.error("Photo upload failed:", upErr);
    return { ok: false, error: "Upload failed. Please try again." };
  }

  const trimmed = caption.trim().slice(0, MAX_CAPTION);
  const { error: rowErr } = await supabase.from("climb_photos").insert({
    // user_id defaults to auth.uid() in SQL; RLS enforces it.
    climb_uuid: climbUuid,
    storage_path: path,
    width: processed.width,
    height: processed.height,
    caption: trimmed || null,
    license: PHOTO_LICENSE,
  });
  if (rowErr) {
    console.error("Photo row insert failed:", rowErr);
    // Best-effort cleanup so we don't orphan the uploaded object.
    await supabase.storage
      .from(PHOTO_BUCKET)
      .remove([path])
      .catch(() => {});
    return { ok: false, error: "Couldn't save the photo. Please try again." };
  }

  return { ok: true };
}
