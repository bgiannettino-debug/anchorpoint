import Image from "next/image";

const MEDIA_HOST = "https://media.openbeta.io";

export type GalleryMedia = {
  mediaUrl: string;
  width: number;
  height: number;
  username?: string | null;
};

/**
 * Read-only gallery of OpenBeta-hosted photos for a climb or area. The
 * originals are multi-MB, so thumbnails go through next/image (optimized,
 * lazy-loaded, correct aspect ratio from the API's width/height); tapping
 * one opens the full-res image in a new tab. Each photo credits its
 * uploader — these are community contributions to the open database.
 */
// Cap how many we render: popular crags can carry dozens of photos, and
// each thumbnail is a separate image-optimizer transform. 12 fills a
// 2-column grid generously; the rest are noted, not silently dropped.
const MAX_PHOTOS = 12;

export function PhotoGallery({
  media,
  label,
}: {
  media: GalleryMedia[];
  label: string;
}) {
  if (media.length === 0) return null;
  const shown = media.slice(0, MAX_PHOTOS);
  return (
    <section aria-label="Photos" className="mt-8">
      <h2 className="text-2xl font-semibold text-stone-800 dark:text-stone-200 mb-4">
        Photos
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shown.map((m) => (
          <a
            key={m.mediaUrl}
            href={`${MEDIA_HOST}${m.mediaUrl}`}
            target="_blank"
            rel="noreferrer"
            className="relative block overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900"
          >
            <Image
              src={`${MEDIA_HOST}${m.mediaUrl}`}
              alt={`Photo of ${label}`}
              width={m.width}
              height={m.height}
              sizes="(max-width: 640px) 100vw, 50vw"
              className="w-full h-auto"
            />
            {m.username && (
              <span className="absolute bottom-0 right-0 m-1 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white/90">
                📷 {m.username}
              </span>
            )}
          </a>
        ))}
      </div>
      {media.length > MAX_PHOTOS && (
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Showing {MAX_PHOTOS} of {media.length} photos.
        </p>
      )}
    </section>
  );
}
