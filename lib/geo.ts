type LatLng = { lat: number; lng: number };

/**
 * Great-circle distance in kilometers between two lat/lng points.
 * Standard haversine — accurate to ~0.5% over typical climbing-area
 * distances (under a few hundred km).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
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
 * Human-readable distance — sub-kilometer in meters, single-decimal km
 * up to ten, otherwise rounded km. Matches how guidebooks usually phrase
 * "20 m" / "3.4 km" / "47 km".
 */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
