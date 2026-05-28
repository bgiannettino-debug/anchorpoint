"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * On the home page, auto-loads the near-me map IF the user has already
 * granted geolocation permission. First-time visitors (permission
 * "prompt" or "denied") see no change — they still get the default
 * view and the "Find climbs near me" button. This avoids ambushing
 * new visitors with a location prompt the moment the page loads.
 *
 * `active` is true when we're already in near mode (lat/lng in the
 * URL); in that case there's nothing to do.
 */
export function AutoLocate({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (active) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (!navigator.permissions?.query) return;

    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled || result.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            const { latitude, longitude } = pos.coords;
            // replace (not push) so the back button doesn't bounce
            // the user to the empty pre-location home page.
            router.replace(
              `/?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`,
            );
          },
          () => {
            // Granted-but-failed (GPS off, timeout) — leave the default
            // view in place; the button is still there as a fallback.
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      })
      .catch(() => {
        // Permissions API unsupported — do nothing, button still works.
      });

    return () => {
      cancelled = true;
    };
  }, [active, router]);

  return null;
}
