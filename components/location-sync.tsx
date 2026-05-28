"use client";

import { useEffect } from "react";
import {
  LOCATION_COOKIE,
  LOCATION_COOKIE_MAX_AGE,
} from "@/lib/geo-consent";

/**
 * Writes the current location to a cookie whenever the home page has
 * one (from the URL or a previous cookie read). The server reads this
 * cookie on the next visit so the near-me map renders immediately —
 * even when the user navigates back to "/" from a climb page, where
 * the location isn't in the URL. Re-writing refreshes the 30-day TTL.
 */
export function LocationSync({ lat, lng }: { lat: number; lng: number }) {
  useEffect(() => {
    try {
      document.cookie =
        `${LOCATION_COOKIE}=${lat.toFixed(5)},${lng.toFixed(5)}` +
        `;path=/;max-age=${LOCATION_COOKIE_MAX_AGE};samesite=lax`;
    } catch {
      // Cookies disabled — the URL-param flow still works, we just
      // can't persist across navigations.
    }
  }, [lat, lng]);

  return null;
}
