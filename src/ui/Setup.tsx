import { useState } from 'react';
import type { TravelMode } from '../core';
import { PlaceSearch } from './PlaceSearch';
import type { ShooState } from './useShoo';

const MODES: { value: TravelMode; icon: string; label: string }[] = [
  { value: 'drive', icon: '🚗', label: 'Drive' },
  { value: 'transit', icon: '🚌', label: 'Transit' },
  { value: 'bike', icon: '🚲', label: 'Bike' },
  { value: 'walk', icon: '🚶', label: 'Walk' },
];

export function Setup({ shoo }: { shoo: ShooState }) {
  const { settings, update } = shoo;

  return (
    <div className="stack">
      <section className="card">
        <h2>Where's work?</h2>
        <PlaceSearch
          label="Job location"
          value={settings.job}
          onChange={(job) => update({ job })}
          hereLabel="I'm at work right now"
        />
        <PlaceSearch
          label="Home (used when location is off)"
          value={settings.home}
          onChange={(home) => update({ home })}
          hereLabel="I'm at home right now"
        />
      </section>

      <section className="card">
        <h2>How do you get there?</h2>
        <div className="segmented" role="radiogroup" aria-label="Travel mode">
          {MODES.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={settings.travelMode === m.value}
              className={settings.travelMode === m.value ? 'on' : ''}
              onClick={() => update({ travelMode: m.value })}
            >
              <span aria-hidden="true">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <Stepper
          label="Time to get out the door"
          hint="Shoes, keys, the coffee you'll forget anyway"
          value={settings.prepMinutes}
          onChange={(prepMinutes) => update({ prepMinutes })}
        />
        <Stepper
          label="Get there early by"
          hint="Parking, clocking in, saying hi"
          value={settings.arriveEarlyMinutes}
          onChange={(arriveEarlyMinutes) => update({ arriveEarlyMinutes })}
        />
      </section>

      <section className="card">
        <h2>Nags</h2>
        {shoo.notificationPermission === 'granted' ? (
          <>
            <p className="hint">Notifications are on. Brace yourself.</p>
            <button className="btn" onClick={shoo.testNag}>
              Send me a test nag
            </button>
          </>
        ) : shoo.notificationPermission === 'denied' ? (
          <p className="error">Notifications are blocked. Turn them on for Shoo in your browser or phone settings.</p>
        ) : shoo.notificationPermission === 'unsupported' ? (
          <p className="hint">
            This browser can't show notifications. On iPhone, tap Share → Add to Home Screen, then open Shoo from the
            icon.
          </p>
        ) : (
          <button className="btn" onClick={shoo.enableNotifications}>
            Turn on notifications
          </button>
        )}
      </section>

      {shoo.backgroundLocation !== 'unsupported' && <BackgroundLocation shoo={shoo} />}

      {shoo.passcodeRequired && <Passcode shoo={shoo} />}

      {shoo.storeUrl && (
        <section className="card">
          <h2>Shoo keeping you on time?</h2>
          <p className="hint">A quick review helps other chronically late people find it.</p>
          <a className="btn" href={shoo.storeUrl}>
            Rate Shoo ⭐
          </a>
        </section>
      )}
    </div>
  );
}

function BackgroundLocation({ shoo }: { shoo: ShooState }) {
  const state = shoo.backgroundLocation;
  return (
    <section className="card">
      <h2>Notice when I leave</h2>
      {state === 'granted' ? (
        <p className="hint">
          ✅ Location is set to Always. Shoo stops nagging the moment you head out, even when the app is closed.
        </p>
      ) : (
        <>
          <p className="hint">
            Set location to <strong>Always</strong> so Shoo can tell you've left and stop nagging, even when it's closed.
            It only watches the areas around where you are and your job. Without it, tap "I've left" on a nag.
          </p>
          {state === 'prompt' ? (
            <button className="btn" onClick={shoo.requestBackgroundLocation}>
              Allow location
            </button>
          ) : (
            <button className="btn" onClick={shoo.openSettings}>
              Open Settings → Location → Always
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Stepper({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(180, v)));
  return (
    <div className="stepper">
      <div>
        <div className="field-label">{label}</div>
        <div className="hint">{hint}</div>
      </div>
      <div className="stepper-controls">
        <button aria-label={`Less ${label}`} onClick={() => set(value - 5)}>
          −
        </button>
        <span>{value} min</span>
        <button aria-label={`More ${label}`} onClick={() => set(value + 5)}>
          +
        </button>
      </div>
    </div>
  );
}

function Passcode({ shoo }: { shoo: ShooState }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  if (shoo.passcodeOk) return null;
  return (
    <section className="card">
      <h2>Passcode</h2>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          setError((await shoo.submitPasscode(value)) ?? '');
        }}
      >
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Passcode" />
        <button className="btn">Unlock</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
