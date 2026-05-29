"use client";

import { useState } from "react";
import { NearMap } from "@/components/near-map";

type Props = {
  lat: number;
  lng: number;
  areaUuid: string;
  areaName: string;
  areaClimbs: number;
};

/**
 * A "Show map" button on the climb page that reveals a small map
 * pinned to the climb's area. Reuses NearMap (single pin, no user
 * origin marker) so all the map container fixes + the live "locate me"
 * control come along for free. NearMap's own click-to-expand still
 * works once the map is shown.
 */
export function ClimbMapToggle({
  lat,
  lng,
  areaUuid,
  areaName,
  areaClimbs,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
      >
        Show map
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
        userLat={null}
        userLng={null}
        crags={[{ uuid: areaUuid, name: areaName, lat, lng, climbs: areaClimbs }]}
      />
    </div>
  );
}
