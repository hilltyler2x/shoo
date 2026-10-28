import type { StoragePort } from '../ports';

export class WebStorage implements StoragePort {
  load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`shoo:${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`shoo:${key}`, JSON.stringify(value));
    } catch {
      // Private mode or full storage: settings just won't stick.
    }
  }
}
