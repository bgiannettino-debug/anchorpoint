"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "locating" | "error";

export function NearMeButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setStatus("locating");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        router.push(
          `/?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`,
        );
      },
      (err) => {
        setStatus("error");
        // PERMISSION_DENIED is the common one and deserves a tailored
        // message; the others are rare enough to share generic phrasing.
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Use search instead."
            : "Couldn't get your location. Try again or use search.",
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
