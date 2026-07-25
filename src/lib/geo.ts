// Geo helpers: lat/lng <-> world coords, Mercator projection centered on Bhavnagar.
// We use a simple equirectangular projection scaled to meters so 1 unit = 1 meter.

export const BHAVNAGAR_CENTER = { lat: 21.7645, lng: 72.1519 };
export const EARTH_RADIUS = 6378137; // meters

// Scale: meters per degree
const METERS_PER_DEG_LAT = 111320;
function metersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

export interface LngLat { lng: number; lat: number; }

// Convert lng/lat to local meters relative to city center.
export function lngLatToLocal(lng: number, lat: number, center = BHAVNAGAR_CENTER) {
  const x = (lng - center.lng) * metersPerDegLng(center.lat);
  const z = (lat - center.lat) * METERS_PER_DEG_LAT;
  return { x, z };
}

export function localToLngLat(x: number, z: number, center = BHAVNAGAR_CENTER) {
  const lng = center.lng + x / metersPerDegLng(center.lat);
  const lat = center.lat + z / METERS_PER_DEG_LAT;
  return { lng, lat };
}

// Haversine distance in meters between two lng/lat points.
export function haversine(a: LngLat, b: LngLat) {
  const R = EARTH_RADIUS;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
