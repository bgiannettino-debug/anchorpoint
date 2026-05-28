// localStorage key set after the user successfully grants geolocation
// (via the "Find climbs near me" button). AutoLocate reads it to decide
// whether to auto-load the near-me map on landing — a Safari-safe
// substitute for the Permissions API, which iOS reports unreliably.
export const GEO_GRANTED_KEY = "anchorpoint:geo-granted";
