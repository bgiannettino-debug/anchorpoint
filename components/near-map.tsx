"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type NearMapCrag = {
  uuid: string;
  name: string;
  lat: number;
  lng: number;
};

type Props = {
  userLat: number;
  userLng: number;
  crags: NearMapCrag[];
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (TOKEN) mapboxgl.accessToken = TOKEN;

export function NearMap({ userLat, userLng, crags }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Build the map once on mount and re-fit bounds whenever the input
  // points change. The full crags array is treated as a dependency so
  // re-clicks of "Find climbs near me" from a different location update
  // pins and view correctly without remounting the underlying canvas.
  useEffect(() => {
    if (!containerRef.current || !TOKEN) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [userLng, userLat],
      zoom: 8,
      attributionControl: false,
      cooperativeGestures: false,
      // Start with no interactivity. The collapsed map is a preview;
      // we toggle handlers below when expanded changes.
      interactive: false,
    });
    mapRef.current = map;

    // User location: a blue marker with no popup/click.
    new mapboxgl.Marker({ color: "#1e3a8a" })
      .setLngLat([userLng, userLat])
      .addTo(map);

    // Crag pins: red, click-to-navigate to the area page.
    for (const c of crags) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Open ${c.name}`);
      el.className =
        "block w-3 h-3 rounded-full bg-red-600 border-2 border-white shadow cursor-pointer hover:scale-125 transition-transform";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        router.push(`/area/${c.uuid}`);
      });
      new mapboxgl.Marker({ element: el })
        .setLngLat([c.lng, c.lat])
        .addTo(map);
    }

    // Fit the view to user + every pin so the first frame already
    // shows something useful. maxZoom keeps very tight clusters from
    // zooming in past street level.
    map.on("load", () => {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([userLng, userLat]);
      for (const c of crags) bounds.extend([c.lng, c.lat]);
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 11, duration: 0 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [userLat, userLng, crags, router]);

  // Toggle interactivity when the map expands or collapses, and call
  // resize() so the canvas redraws to fit the new container height.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const action = expanded ? "enable" : "disable";
    map.dragPan[action]();
    map.scrollZoom[action]();
    map.boxZoom[action]();
    map.doubleClickZoom[action]();
    map.touchZoomRotate[action]();
    // The CSS transition is 300ms; resize after it settles so the
    // canvas matches the final size rather than mid-transition.
    const t = window.setTimeout(() => map.resize(), 320);
    return () => window.clearTimeout(t);
  }, [expanded]);

  if (!TOKEN) {
    // No token available — silently render nothing rather than a
    // broken map. The rest of the page (list view) still works.
    return null;
  }

  return (
    <div
      className={`relative mb-8 rounded-lg border border-stone-200 dark:border-stone-800 overflow-hidden transition-[height] duration-300 ${
        expanded ? "h-[500px]" : "h-60"
      }`}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-sm bg-white/90 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 hover:bg-white dark:hover:bg-stone-900 shadow-sm"
        >
          Collapse map
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand map"
          className="absolute inset-0 z-10 cursor-zoom-in"
        />
      )}
    </div>
  );
}
