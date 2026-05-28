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
  userLat: number | null;
  userLng: number | null;
  crags: NearMapCrag[];
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (TOKEN) mapboxgl.accessToken = TOKEN;

// Continental US fallback view shown before the user clicks "Find
// climbs near me" — wide enough to cover the lower 48 at zoom 3.
const DEFAULT_CENTER: [number, number] = [-98.35, 39.5];
const DEFAULT_ZOOM = 3;
const NEAR_ZOOM = 8;

export function NearMap({ userLat, userLng, crags }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [expanded, setExpanded] = useState(false);

  const hasUserCoords = userLat !== null && userLng !== null;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!TOKEN) {
      console.warn(
        "[near-map] NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set in the build. Map won't render. Add the env var to Vercel and redeploy.",
      );
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: hasUserCoords ? [userLng, userLat] : DEFAULT_CENTER,
      zoom: hasUserCoords ? NEAR_ZOOM : DEFAULT_ZOOM,
      attributionControl: false,
      cooperativeGestures: false,
      // Start with no interactivity; toggled on when the user expands.
      interactive: false,
    });
    mapRef.current = map;

    // Surface anything Mapbox would normally swallow — bad token, tile
    // 401s, style fetch failures, etc. Without this, those usually
    // appear nowhere and the map silently stays blank.
    map.on("error", (e) => {
      console.error("[near-map] mapbox error:", e?.error ?? e);
    });

    if (hasUserCoords) {
      new mapboxgl.Marker({ color: "#1e3a8a" })
        .setLngLat([userLng, userLat])
        .addTo(map);
    }

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

    map.on("load", () => {
      // Force a resize after the style + first frame are ready. This
      // catches the case where Mapbox sampled the container size before
      // CSS finished applying (canvas stuck at the 300px default).
      map.resize();
      if (crags.length === 0) return;
      const bounds = new mapboxgl.LngLatBounds();
      if (hasUserCoords) bounds.extend([userLng, userLat]);
      for (const c of crags) bounds.extend([c.lng, c.lat]);
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 11, duration: 0 });
      }
    });

    // Keep the canvas in sync whenever the container's size changes —
    // expand/collapse animations, viewport rotations, dev-tools open,
    // etc. This is the most reliable way to avoid the "canvas is
    // 300x150 default size" symptom we hit on first try.
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [userLat, userLng, crags, router, hasUserCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const action = expanded ? "enable" : "disable";
    map.dragPan[action]();
    map.scrollZoom[action]();
    map.boxZoom[action]();
    map.doubleClickZoom[action]();
    map.touchZoomRotate[action]();
    const t = window.setTimeout(() => map.resize(), 320);
    return () => window.clearTimeout(t);
  }, [expanded]);

  return (
    <div
      // containerRef goes on the rounded box itself, not an inner
      // <div absolute inset-0>. Mapbox calls _resize() reading
      // container.clientHeight and adds the .mapboxgl-map class to
      // this element, which can override a position:absolute child and
      // collapse it to 0 height. Putting Mapbox on the box that
      // already has an explicit h-60 / h-[500px] avoids that entirely.
      ref={containerRef}
      className={`relative mb-8 rounded-lg border border-stone-200 dark:border-stone-800 overflow-hidden transition-[height] duration-300 ${
        expanded ? "h-[500px]" : "h-60"
      }`}
    >
      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-900 text-sm text-stone-500 dark:text-stone-400 p-4 text-center">
          Map unavailable — set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN and
          redeploy.
        </div>
      )}
      {TOKEN && expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-sm bg-white/90 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 hover:bg-white dark:hover:bg-stone-900 shadow-sm"
        >
          Collapse map
        </button>
      )}
      {TOKEN && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand map"
          // appearance-none + bg-transparent strip Safari's native
          // button chrome. Without these, -webkit-appearance: button
          // gives the overlay an opaque rendering that hides the
          // map canvas underneath even though background-color is
          // transparent.
          className="absolute inset-0 z-10 cursor-zoom-in appearance-none bg-transparent border-0"
        />
      )}
    </div>
  );
}
