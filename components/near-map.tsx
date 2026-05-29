"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Escape user-facing names before injecting into popup HTML — OpenBeta
// climb/area names are free text and could contain <, &, quotes.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type NearMapCrag = {
  uuid: string;
  name: string;
  lat: number;
  lng: number;
  // Recursive total (matches the count shown on the area cards).
  climbs: number;
};

type Props = {
  userLat: number | null;
  userLng: number | null;
  crags: NearMapCrag[];
  // How the initial view is framed:
  //  - "radius" (default): a fixed box around the focus point (the
  //    user when known, else the first crag). frameRadiusMiles sets
  //    the size. Used by the home near-me map (20) and climb map (0.5).
  //  - "all": fitBounds to every crag (+ user). Used by the area page
  //    so all sub-areas are visible at once.
  fitMode?: "radius" | "all";
  // Radius (miles) for fitMode "radius". Ignored when fitMode is "all".
  frameRadiusMiles?: number;
};

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (TOKEN) mapboxgl.accessToken = TOKEN;

// Continental US fallback view shown before the user clicks "Find
// climbs near me" — wide enough to cover the lower 48 at zoom 3.
const DEFAULT_CENTER: [number, number] = [-98.35, 39.5];
const DEFAULT_ZOOM = 3;
const NEAR_ZOOM = 8;

export function NearMap({
  userLat,
  userLng,
  crags,
  fitMode = "radius",
  frameRadiusMiles = 20,
}: Props) {
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

    // Built-in "where am I right now" button. Separate from the static
    // blue marker above (which marks the query origin) — tapping this
    // starts continuous watchPosition tracking with an accuracy halo
    // and heading arrow, so a user driving to the trailhead can see
    // their live position relative to the crag pins.
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
        showAccuracyCircle: true,
      }),
      "top-left",
    );

    if (hasUserCoords) {
      new mapboxgl.Marker({ color: "#1e3a8a" })
        .setLngLat([userLng, userLat])
        .addTo(map);
    }

    for (const c of crags) {
      // The button is the tap target (32x32 ≈ Apple HIG's 44pt with
      // some give for the cursor). Visual dot is a smaller span
      // centered inside so the map doesn't look cluttered.
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Show ${c.name}`);
      el.className =
        "group flex items-center justify-center w-8 h-8 bg-transparent p-0 border-0 appearance-none cursor-pointer";
      const dot = document.createElement("span");
      dot.className =
        "block w-3 h-3 rounded-full bg-red-600 border-2 border-white shadow group-hover:scale-125 transition-transform";
      el.appendChild(dot);

      // Tap/click opens a popup with the area name + a link, so the
      // user can see which crag a pin is before navigating. Works on
      // mobile (no hover) and desktop alike. The link is a plain
      // anchor — a full navigation off the map is fine for a
      // deliberate "take me there" action, and it works offline via
      // the service-worker page cache.
      const popup = new mapboxgl.Popup({
        offset: 16,
        closeButton: false,
        closeOnClick: true,
        maxWidth: "220px",
      }).setHTML(
        `<div style="font-size:13px;line-height:1.45">` +
          `<div style="font-weight:600;color:#1c1917">${escapeHtml(c.name)}${
            c.climbs > 0 ? ` (${c.climbs})` : ""
          }</div>` +
          `<a href="/area/${c.uuid}" style="display:inline-block;margin-top:2px;color:#dc2626;font-weight:500;text-decoration:none">View area &rarr;</a>` +
          `</div>`,
      );

      new mapboxgl.Marker({ element: el })
        .setLngLat([c.lng, c.lat])
        .setPopup(popup)
        .addTo(map);
    }

    map.on("load", () => {
      // Force a resize after the style + first frame are ready. This
      // catches the case where Mapbox sampled the container size before
      // CSS finished applying (canvas stuck at the 300px default).
      map.resize();

      // "all" — frame every crag (+ user) so the whole set is visible.
      // maxZoom keeps a single pin from zooming to street level.
      if (fitMode === "all") {
        const bounds = new mapboxgl.LngLatBounds();
        if (hasUserCoords) bounds.extend([userLng, userLat]);
        for (const c of crags) bounds.extend([c.lng, c.lat]);
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: 0 });
        }
        return;
      }

      // "radius" — frame a fixed-radius box around the focus point: the
      // user when known (home near-me map, 20 mi), otherwise the first
      // crag (climb-page map, 0.5 mi). Pins outside still render, so
      // zooming out reveals them. 1° lat ≈ 69 mi; lng scaled by cos lat.
      const focusLat = hasUserCoords ? userLat : (crags[0]?.lat ?? null);
      const focusLng = hasUserCoords ? userLng : (crags[0]?.lng ?? null);
      if (focusLat === null || focusLng === null) return;

      const dLat = frameRadiusMiles / 69;
      const dLng =
        frameRadiusMiles / (69 * Math.cos((focusLat * Math.PI) / 180));
      map.fitBounds(
        [
          [focusLng - dLng, focusLat - dLat],
          [focusLng + dLng, focusLat + dLat],
        ],
        { padding: 20, duration: 0 },
      );
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
  }, [userLat, userLng, crags, hasUserCoords, frameRadiusMiles, fitMode]);

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
      // touch-none keeps the browser out of any pinch/scroll on the
      // map element. Without it, pinching can trigger the browser's
      // own page-zoom in parallel with Mapbox's content zoom, leaving
      // the whole viewport zoomed in with no easy way to recover on
      // mobile. Mapbox manages its own pan/pinch via JS event
      // handlers, so the map still works normally.
      className={`relative mb-8 rounded-lg border border-stone-200 dark:border-stone-800 overflow-hidden touch-none transition-[height] duration-300 ${
        expanded ? "h-[500px]" : "h-60"
      }`}
    >
      {/*
        Mapbox warns ("The map container element should be empty…") if
        the .mapboxgl-map element has unrelated children, because they
        can interfere with its event listeners. So keep Mapbox in its
        own inner div and put the overlay buttons as siblings here.
        Size the inner div with explicit w-full / h-full instead of
        absolute inset-0 — Mapbox sets position:relative inline on its
        container which turns inset-0 into a no-op and collapses the
        element to 0 height.
      */}
      <div ref={containerRef} className="w-full h-full" />
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
