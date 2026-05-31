/**
 * "Get directions" link to a lat/lng. Uses Google Maps' universal URL
 * (`/maps/dir/?api=1&...`), which is the only one that works cleanly on
 * every platform:
 *   - iOS: opens Google Maps app if installed, otherwise Safari (which
 *     can hand off to Apple Maps).
 *   - Android: opens Google Maps app directly.
 *   - Desktop: opens maps.google.com in a new tab.
 *
 * Apple Maps' `maps.apple.com` URL only resolves on Apple devices, so
 * it's not viable as a single cross-platform link. Renders nothing if
 * the caller passes null/missing coords.
 */
export function DirectionsButton({
  lat,
  lng,
  label = "Directions",
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  label?: string;
}) {
  if (lat == null || lng == null) return null;
  const href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label} (opens Google Maps)`}
      className="shrink-0 inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
    >
      <span aria-hidden>→</span>
      {label}
    </a>
  );
}
