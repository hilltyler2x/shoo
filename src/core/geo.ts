import type { LatLng, TravelEstimate, TravelMode } from './types';

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** How far you have to move before Shoo decides you've left. */
export const LEFT_RADIUS_M = 200;
/** How close to the job counts as "made it". */
export const ARRIVED_RADIUS_M = 150;

export function hasLeft(origin: LatLng, current: LatLng, radius = LEFT_RADIUS_M): boolean {
  return distanceMeters(origin, current) > radius;
}

export function hasArrived(job: LatLng, current: LatLng, radius = ARRIVED_RADIUS_M): boolean {
  return distanceMeters(job, current) <= radius;
}

// Rough door-to-door speeds for when no routing service is reachable.
// Roads aren't straight, so straight-line distance is stretched by DETOUR.
const SPEED_KMH: Record<TravelMode, number> = { drive: 40, transit: 22, bike: 15, walk: 4.8 };
const DETOUR = 1.35;

/** A pessimistic guess from straight-line distance. Better than nothing offline. */
export function estimateTravel(from: LatLng, to: LatLng, mode: TravelMode): TravelEstimate {
  const meters = distanceMeters(from, to) * DETOUR;
  const minutes = Math.max(1, Math.ceil(meters / 1000 / SPEED_KMH[mode] * 60));
  return { minutes, distanceMeters: Math.round(meters), trafficAware: false, provider: 'estimate' };
}
