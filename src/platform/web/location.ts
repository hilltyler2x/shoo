import type { LatLng } from '../../core/types';
import type { LocationPort } from '../ports';

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 };

export class WebLocation implements LocationPort {
  current(): Promise<LatLng | null> {
    if (!('geolocation' in navigator)) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        OPTIONS,
      );
    });
  }

  watch(onFix: (fix: LatLng) => void, onError?: (message: string) => void): () => void {
    if (!('geolocation' in navigator)) {
      onError?.("This browser can't share your location.");
      return () => {};
    }
    const id = navigator.geolocation.watchPosition(
      (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => onError?.(e.code === e.PERMISSION_DENIED ? 'Location is turned off for Shoo.' : 'Location unavailable.'),
      OPTIONS,
    );
    return () => navigator.geolocation.clearWatch(id);
  }
}
