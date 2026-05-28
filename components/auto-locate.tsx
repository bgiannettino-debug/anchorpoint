"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GEO_GRANTED_KEY } from "@/lib/geo-consent";

/**
 * On the home page, auto-loads the near-me map IF the user has granted
 * geolocation before (tracked via a localStorage flag set by the
 * "Find climbs near me" button on first successful use). First-time
 * visitors have no flag, so nothing happens — they still get the
 * default view + button, never an ambush prompt on load.
 *
 * We use a localStorage flag rather than the Permissions API because
 * Safari reports geolocation permission state unreliably, which is why
 * the earlier Permissions-API version never auto-loaded on iOS.
 *
 * `active` is true when lat/lng are already in the URL; nothing to do.
 */
export function AutoLocate({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (active) return;
    if (typeof window === "undefined" || !navigator.geolocation) return;
    if (window.localStorage.getItem(GEO_GRANTED_KEY) !== "1") return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        // Merge lat/lng into the current URL (preserving an existing
        // ?q=) and replace so Back doesn't bounce to the empty home.
        const url = new URL(window.location.href);
        url.searchParams.set("lat", latitude.toFixed(5));
        url.searchParams.set("lng", longitude.toFixed(5));
        router.replace(url.pathname + url.search);
      },
      () => {
        // Flag was stale — permission since revoked. Clear it so we
        // don't retry (and risk an unexpected prompt) every load.
        if (!cancelled) {
          window.localStorage.removeItem(GEO_GRANTED_KEY);
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );

    return () => {
      cancelled = true;
    };
  }, [active, router]);

  return null;
}
