import Image from "next/image";
import type { GalleryPhoto } from "@/lib/photos";

/**
 * Photo galleries for climb + area pages. Originals are multi-MB, so
 * thumbnails go through next/image (optimized, lazy, correct aspect ratio
 * from width/height); tapping one opens the full-res image in a new tab.
 * Each photo credits its source — OpenBeta uploader name, or "Community"
 * for user uploads.
 *
 * `PhotoGrid` is the bare grid (caller guards the empty case);
 * `PhotoGallery` wraps it with the "Photos" heading and renders nothing
 * when empty (used by the area page). The climb page composes its own
 * heading + an upload action, so it uses PhotoGrid directly.
 */

// Cap how many we render: popular crags can carry dozens, and each
// thumbnail is a separate image-optimizer transform. 12 fills the
// 2-column grid generously; the rest are noted, not silently dropped.
const MAX_PHOTOS = 12;

export function PhotoGrid({
  photos,
  label,
}: {
  photos: GalleryPhoto[];
  label: string;
}) {
  const shown = photos.slice(0, MAX_PHOTOS);
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shown.map((p) => (
          <a
            key={p.src}
            href={p.href ?? p.src}
            target="_blank"
            rel="noreferrer"
            className="relative block overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900"
          >
            <Image
              src={p.src}
              alt={`Photo of ${label}`}
              width={p.width}
              height={p.height}
              sizes="(max-width: 640px) 100vw, 50vw"
              className="w-full h-auto"
            />
            {p.credit && (
              <span className="absolute bottom-0 right-0 m-1 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white/90">
                📷 {p.credit}
              </span>
            )}
          </a>
        ))}
      </div>
      {photos.length > MAX_PHOTOS && (
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Showing {MAX_PHOTOS} of {photos.length} photos.
        </p>
      )}
    </>
  );
}

export function PhotoGallery({
  photos,
  label,
}: {
  photos: GalleryPhoto[];
  label: string;
}) {
  if (photos.length === 0) return null;
  return (
    <section aria-label="Photos" className="mt-8">
      <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
        Photos
      </h2>
      <PhotoGrid photos={photos} label={label} />
    </section>
  );
}
