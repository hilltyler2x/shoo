// The map services Shoo talks to. The server uses these with its keys; the app
// also calls the free ones directly when the server can't be reached.

import { estimateTravel } from './core/geo';
import type { LatLng, Place, TravelEstimate, TravelMode } from './core/types';

export type Fetch = typeof fetch;

export interface ProviderEnv {
  GOOGLE_MAPS_API_KEY?: string;
  /** Contact address sent to OpenStreetMap's free geocoder, as its usage policy asks. */
  CONTACT_EMAIL?: string;
  /** False when calling from a browser, where a custom User-Agent forces a CORS preflight. */
  sendUserAgent?: boolean;
}

const GOOGLE_MODES: Record<TravelMode, string> = { drive: 'DRIVE', transit: 'TRANSIT', walk: 'WALK', bike: 'BICYCLE' };

export async function route(
  env: ProviderEnv,
  fetchFn: Fetch,
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  departAt?: number,
): Promise<TravelEstimate> {
  try {
    if (env.GOOGLE_MAPS_API_KEY) return await googleRoute(env.GOOGLE_MAPS_API_KEY, fetchFn, from, to, mode, departAt);
    if (mode === 'drive') return await osrmRoute(fetchFn, from, to);
  } catch (err) {
    console.warn('routing failed, using estimate:', (err as Error).message);
  }
  return estimateTravel(from, to, mode);
}

async function googleRoute(
  key: string,
  fetchFn: Fetch,
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  departAt?: number,
): Promise<TravelEstimate> {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const body: Record<string, unknown> = { origin: point(from), destination: point(to), travelMode: GOOGLE_MODES[mode] };
  if (mode === 'drive') body.routingPreference = 'TRAFFIC_AWARE';
  // Google rejects departure times in the past.
  if (departAt && departAt > Date.now() + 60_000) body.departureTime = new Date(departAt).toISOString();

  const res = await fetchFn('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google Routes ${res.status}`);
  const data = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const r = data.routes?.[0];
  if (!r?.duration) throw new Error('Google Routes returned no route');
  return {
    minutes: Math.max(1, Math.ceil(parseFloat(r.duration) / 60)),
    distanceMeters: r.distanceMeters ?? 0,
    trafficAware: mode === 'drive',
    provider: 'google',
  };
}

async function osrmRoute(fetchFn: Fetch, from: LatLng, to: LatLng): Promise<TravelEstimate> {
  // OSRM's public demo server: free, no key, no live traffic, car only.
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as { routes?: { duration: number; distance: number }[] };
  const r = data.routes?.[0];
  if (!r) throw new Error('OSRM returned no route');
  // No traffic data, so pad by 15% to stay on the safe side.
  return {
    minutes: Math.max(1, Math.ceil((r.duration * 1.15) / 60)),
    distanceMeters: Math.round(r.distance),
    trafficAware: false,
    provider: 'osrm',
  };
}

export async function geocode(env: ProviderEnv, fetchFn: Fetch, query: string): Promise<Place[]> {
  if (env.GOOGLE_MAPS_API_KEY) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${env.GOOGLE_MAPS_API_KEY}`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Google Geocoding ${res.status}`);
    const data = (await res.json()) as {
      results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
    };
    return (data.results ?? []).slice(0, 5).map((r) => ({ label: r.formatted_address, location: r.geometry.location }));
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const headers: Record<string, string> =
    env.sendUserAgent === false ? {} : { 'User-Agent': `Shoo/0.1 (${env.CONTACT_EMAIL || 'never-be-late app'})` };
  const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return data.map((r) => ({ label: r.display_name, location: { lat: Number(r.lat), lng: Number(r.lon) } }));
}
