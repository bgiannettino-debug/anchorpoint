type LatLng = { lat: number; lng: number };

/**
 * Great-circle distance in miles between two lat/lng points.
 * Standard haversine — accurate to ~0.5% over typical climbing-area
 * distances (under a few hundred miles).
 */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Human-readable distance — single-decimal miles up to ten, otherwise
 * rounded miles. "0.5 mi" / "3.4 mi" / "47 mi".
 */
export function formatDistanceMiles(miles: number): string {
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
