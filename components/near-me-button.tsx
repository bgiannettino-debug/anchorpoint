"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "locating" | "error";

export function NearMeButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const safetyTimer = useRef<number | null>(null);

  // Clear any pending safety timer on unmount so we don't setState on
  // an unmounted component if the user navigates away mid-request.
  useEffect(
    () => () => {
      if (safetyTimer.current != null) clearTimeout(safetyTimer.current);
    },
    [],
  );

  // If the browser remembers a previous denial, the next prompt is often
  // suppressed silently (Safari especially). Check the Permissions API
  // up front so we render a useful message instead of leaving the user
  // staring at an unresponsive button.
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (result.state === "denied") {
          setStatus("error");
          setError(
            "Location permission is blocked for this site. To use this, allow location in your browser's site settings (Safari: Settings → Websites → Location).",
          );
        }
      })
      .catch(() => {
        // Some browsers reject this query — fall through and let the
        // click handler attempt the prompt directly.
      });
  }, []);

  function handleClick() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setStatus("locating");
    setError(null);

    // Safari sometimes never fires the error callback when the user
    // denies the prompt (see WebKit bug history). Without this fallback
    // the button stays disabled forever. 12 s sits just beyond the
    // getCurrentPosition timeout so the native error wins when it fires.
    if (safetyTimer.current != null) clearTimeout(safetyTimer.current);
    safetyTimer.current = window.setTimeout(() => {
      setStatus("error");
      setError(
        "We didn't hear back from your browser. Click again to retry, or reload the page if no prompt appears.",
      );
    }, 12000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (safetyTimer.current != null) clearTimeout(safetyTimer.current);
        const { latitude, longitude } = pos.coords;
        router.push(
          `/?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`,
        );
      },
      (err) => {
        if (safetyTimer.current != null) clearTimeout(safetyTimer.current);
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? // Most browsers (Safari especially) cache the denial and
              // won't re-prompt on this site until the user clears it.
              // Reload won't help — point straight at settings.
              "Location permission was denied. To try again, allow location in your browser's site settings (Safari: Settings → Websites → Location)."
            : "Couldn't get your location. Click again to retry, or reload the page if no prompt appears.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "locating"}
        className="text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60 disabled:cursor-wait"
      >
        {status === "locating" ? "Locating…" : "Find climbs near me"}
      </button>
      {status === "error" && error && (
        <p className="text-sm text-red-700 dark:text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}
