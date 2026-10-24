import { useState } from 'react';
import { searchPlaces } from '../api';
import type { LatLng, Place } from '../core';
import { platform } from '../platform';

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  hereLabel: string;
}

export function PlaceSearch({ label, value, onChange, hereLabel }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy(true);
    setError('');
    try {
      const places = await searchPlaces(query.trim());
      setResults(places);
      if (places.length === 0) setError('No matches. Try adding the city.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useHere = async () => {
    setBusy(true);
    setError('');
    const here: LatLng | null = await platform.location.current();
    setBusy(false);
    if (!here) {
      setError("Couldn't get your location. Is location allowed for Shoo?");
      return;
    }
    onChange({ label: `${hereLabel} (pinned ${new Date().toLocaleDateString()})`, location: here });
  };

  if (value) {
    return (
      <div className="field">
        <span className="field-label">{label}</span>
        <div className="place-chosen">
          <span>📍 {value.label}</span>
          <button type="button" className="link" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <form className="row" onSubmit={search}>
        <input
          type="search"
          inputMode="search"
          placeholder="Address or place name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={label}
        />
        <button type="submit" className="btn" disabled={busy || query.trim().length < 3}>
          Find
        </button>
      </form>
      {results.length > 0 && (
        <ul className="results">
          {results.map((p) => (
            <li key={`${p.location.lat},${p.location.lng}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setResults([]);
                  setQuery('');
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link" onClick={useHere} disabled={busy}>
        📍 {hereLabel}
      </button>
      {busy && <p className="hint">Looking…</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
