import { useState } from 'react';
import { FREE_PLACES, PLACE_KINDS, type Place, type PlaceKind, type SavedPlace, type TravelMode } from '../core';
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
      <Places
        places={settings.places}
        onChange={(places) => update({ places })}
        canAdd={() => settings.places.length < FREE_PLACES || shoo.pro.gate('places')}
        locked={!shoo.pro.unlocked}
      />

      {shoo.pro.forSale && <ProCard shoo={shoo} />}

      <section className="card">
        <h2>Where do you usually leave from?</h2>
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
          hint="Parking, finding the door, saying hi. Airports get 90 min on their own."
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

const KIND_ORDER = Object.keys(PLACE_KINDS) as PlaceKind[];
const newId = () => Math.random().toString(36).slice(2, 10);

function Places({
  places,
  onChange,
  canAdd,
  locked,
}: {
  places: SavedPlace[];
  onChange: (places: SavedPlace[]) => void;
  /** Opens the paywall instead when the free place is used up. */
  canAdd: () => boolean;
  locked: boolean;
}) {
  const [adding, setAdding] = useState(places.length === 0);
  const [kind, setKind] = useState<PlaceKind>(places.some((p) => p.kind === 'work') ? 'gym' : 'work');
  const [name, setName] = useState('');
  const [where, setWhere] = useState<Place | null>(null);

  const save = () => {
    if (!where) return;
    const label = name.trim() || PLACE_KINDS[kind].label;
    onChange([...places, { ...where, id: newId(), name: label, kind }]);
    setName('');
    setWhere(null);
    setAdding(false);
  };

  return (
    <section className="card">
      <h2>Your places</h2>
      <p className="hint">
        Save the spots you go to a lot. Calendar events at these places get matched automatically, and anything else
        on your calendar with an address works too.
      </p>
      {places.length > 0 && (
        <ul className="shift-list">
          {places.map((p, i) => (
            <li key={p.id}>
              <div>
                <strong>
                  {PLACE_KINDS[p.kind]?.icon ?? '📍'} {p.name}
                  {locked && i >= FREE_PLACES && <span className="chip chip-pro">Pro</span>}
                </strong>
                <div className="hint">{p.label}</div>
              </div>
              <button className="link danger" onClick={() => onChange(places.filter((x) => x.id !== p.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <>
          <div className="kinds" role="radiogroup" aria-label="What kind of place">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={`kind ${kind === k ? 'on' : ''}`}
                onClick={() => setKind(k)}
              >
                <span aria-hidden="true">{PLACE_KINDS[k].icon}</span>
                {PLACE_KINDS[k].label}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={name} placeholder={PLACE_KINDS[kind].label} onChange={(e) => setName(e.target.value)} />
          </label>
          <PlaceSearch label="Where is it?" value={where} onChange={setWhere} hereLabel="I'm here right now" />
          <div className="row">
            <button className="btn" disabled={!where} onClick={save}>
              Save place
            </button>
            {places.length > 0 && (
              <button className="link" onClick={() => setAdding(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <button className="btn" onClick={() => canAdd() && setAdding(true)}>
          Add a place{locked && places.length >= FREE_PLACES ? ' ✨' : ''}
        </button>
      )}
    </section>
  );
}

function ProCard({ shoo }: { shoo: ShooState }) {
  const [note, setNote] = useState('');
  if (shoo.pro.unlocked) {
    return (
      <section className="card">
        <h2>Shoo Pro 🎉</h2>
        <p className="hint">You've got everything. Manage or cancel any time in your phone's subscription settings.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Shoo Pro ✨</h2>
      <p className="hint">
        Free gets you to work on time. Pro does it for everything: more places, calendar and shift app sync, Quick add,
        Panic mode, and jokes for every occasion.
      </p>
      <div className="row">
        <button className="btn" onClick={() => shoo.pro.gate('places')}>
          See Pro
        </button>
        <button
          className="link"
          onClick={async () => setNote((await shoo.pro.restore().catch(() => false)) ? '' : 'No Pro purchase found on this account.')}
        >
          Restore purchases
        </button>
      </div>
      {note && <p className="hint">{note}</p>}
    </section>
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
            It only watches the areas around where you are and where you're headed. Without it, tap "I've left" on a nag.
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
