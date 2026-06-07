"use client";

import { useState } from "react";
import { NearMap, type NearMapCrag } from "@/components/near-map";

type Props = {
  crags: NearMapCrag[];
  userLat?: number | null;
  userLng?: number | null;
  fitMode?: "radius" | "all";
  frameRadiusMiles?: number;
  label?: string;
  /** Render the map open on first load (with "Hide map" as the toggle). */
  defaultOpen?: boolean;
};

/**
 * A "Show map" button that reveals a NearMap. Used on the climb page
 * (single pin, tight radius) and the area page (sub-area pins, fit
 * all). Reusing NearMap means every container/touch/resize fix and the
 * live "locate me" control come along for free. NearMap's own
 * click-to-expand still works once shown.
 */
export function MapToggle({
  crags,
  userLat = null,
  userLng = null,
  fitMode,
  frameRadiusMiles,
  label = "Show map",
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mb-2 text-sm text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
      >
        Hide map
      </button>
      <NearMap
        userLat={userLat}
        userLng={userLng}
        crags={crags}
        fitMode={fitMode}
        frameRadiusMiles={frameRadiusMiles}
      />
    </div>
  );
}
