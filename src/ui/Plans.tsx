import { useRef, useState } from 'react';
import {
  PLACE_KINDS,
  OCCASIONS,
  parsePlan,
  parseSchedule,
  type CalendarFeed,
  type Place,
  type SavedPlace,
  type Shift,
  type ProFeature,
  type WeeklyShift,
} from '../core';
import { clock, dayLabel } from './format';
import { readScreenshot } from './ocr';
import { PlaceSearch } from './PlaceSearch';
import type { Planned, ShooState } from './useShoo';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const newId = () => Math.random().toString(36).slice(2, 10);

export function Plans({ shoo }: { shoo: ShooState }) {
  const { settings, update } = shoo;
  const addManual = (shifts: Shift[]) => update({ manualShifts: [...settings.manualShifts, ...shifts] });
  const gate = shoo.pro.gate;
  const locked = !shoo.pro.unlocked;

  return (
    <div className="stack">
      <ComingUp shoo={shoo} />
      <QuickAdd places={settings.places} onAdd={addManual} gate={gate} locked={locked} />
      {shoo.device.available && <PhoneCalendar shoo={shoo} />}
      <Calendars shoo={shoo} />
      <WeeklyEditor places={settings.places} weekly={settings.weekly} onChange={(weekly) => update({ weekly })} />
      <OneOff places={settings.places} onAdd={(s) => addManual([s])} gate={gate} />
    </div>
  );
}

const SOURCE_LABEL: Record<Shift['source'], string> = {
  manual: 'added by you',
  weekly: 'weekly',
  calendar: 'calendar',
  device: 'phone',
};

function ComingUp({ shoo }: { shoo: ShooState }) {
  const { settings, update, plans, now } = shoo;
  const [showAll, setShowAll] = useState(false);
  const withPlace = plans.filter((p) => p.destination);
  const noPlace = plans.filter((p) => !p.destination);

  const setPlace = (id: string, placeId: string) => {
    const placeFor = { ...settings.placeFor };
    if (placeId) placeFor[id] = placeId;
    else delete placeFor[id];
    update({ placeFor });
  };

  return (
    <section className="card">
      <h2>Coming up</h2>
      {plans.length === 0 && <p className="hint">Nothing in the next 7 days yet. Add plans below or connect a calendar.</p>}
      {withPlace.length > 0 && (
        <ul className="shift-list">
          {withPlace.map((p) => (
            <PlanRow key={p.shift.id} p={p} now={now} places={settings.places} onPlace={setPlace} shoo={shoo} />
          ))}
        </ul>
      )}
      {noPlace.length > 0 && (
        <>
          <p className="hint">
            {noPlace.length} {noPlace.length === 1 ? 'plan has' : 'plans have'} no place yet, so Shoo can't time them.
            Pick one if it's somewhere you need to get to.
          </p>
          {showAll ? (
            <ul className="shift-list">
              {noPlace.map((p) => (
                <PlanRow key={p.shift.id} p={p} now={now} places={settings.places} onPlace={setPlace} shoo={shoo} />
              ))}
            </ul>
          ) : (
            <button className="link" onClick={() => setShowAll(true)}>
              Show them
            </button>
          )}
        </>
      )}
    </section>
  );
}

function PlanRow({
  p,
  now,
  places,
  onPlace,
  shoo,
}: {
  p: Planned;
  now: number;
  places: SavedPlace[];
  onPlace: (id: string, placeId: string) => void;
  shoo: ShooState;
}) {
  const { shift, destination, occasion } = p;
  const icon = destination?.placeId ? destination.icon : OCCASIONS[occasion].icon;
  return (
    <li>
      <div>
        <strong>
          {icon} {shift.title}
        </strong>
        <div className="hint">
          {dayLabel(shift.start, now)} · {clock(shift.start)}
          {shift.end ? `–${clock(shift.end)}` : ''} · {SOURCE_LABEL[shift.source]}
        </div>
        <div className="hint">
          {destination ? `📍 ${destination.name}` : shift.address ? `📍 ${shift.address} (can't find it on the map)` : ''}
        </div>
        {places.length > 0 && (
          <select
            className="place-pick"
            aria-label={`Place for ${shift.title}`}
            value={shoo.settings.placeFor[shift.id] ?? ''}
            onChange={(e) => onPlace(shift.id, e.target.value)}
          >
            <option value="">{destination ? 'Change place…' : 'Pick a place…'}</option>
            {places.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {PLACE_KINDS[pl.kind]?.icon} {pl.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {shift.source === 'manual' && (
        <button
          className="link danger"
          onClick={() => shoo.update({ manualShifts: shoo.settings.manualShifts.filter((m) => m.id !== shift.id) })}
        >
          Remove
        </button>
      )}
    </li>
  );
}

function PlaceSelect({
  places,
  value,
  onChange,
  allowOwn,
  ownLabel = "Each event's own address",
}: {
  places: SavedPlace[];
  value: string;
  onChange: (placeId: string) => void;
  allowOwn?: boolean;
  ownLabel?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Place">
      {allowOwn && <option value="">{ownLabel}</option>}
      {!allowOwn && places.length === 0 && <option value="">Add a place in Setup first</option>}
      {places.map((p) => (
        <option key={p.id} value={p.id}>
          {PLACE_KINDS[p.kind]?.icon} {p.name}
        </option>
      ))}
    </select>
  );
}

/** Paste a schedule or a confirmation email, or pick a screenshot, and get plans out of it. */
/** "Pro" next to a card title, when it's locked. */
const ProChip = ({ locked }: { locked: boolean }) => (locked ? <span className="chip chip-pro">Pro</span> : null);

function QuickAdd({
  places,
  onAdd,
  gate,
  locked,
}: {
  places: SavedPlace[];
  onAdd: (shifts: Shift[]) => void;
  gate: (feature: ProFeature) => boolean;
  locked: boolean;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<{ start: number; end?: number; address?: string; keep: boolean }[] | null>(null);
  const [placeId, setPlaceId] = useState(() => places.find((p) => p.kind === 'work')?.id ?? '');
  const [title, setTitle] = useState('');
  const [reading, setReading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const find = (source: string) => {
    setError('');
    const now = Date.now();
    const shifts = parseSchedule(source, now);
    if (shifts.length > 0) {
      setFound(shifts.map((s) => ({ ...s, keep: s.end > now })));
      return;
    }
    const one = parsePlan(source, now);
    if (one) {
      setFound([{ ...one, keep: true }]);
      if (one.address) setPlaceId('');
      return;
    }
    setFound(null);
    setError("Couldn't spot any dates and times in that. Try copying more of it, or add it by hand below.");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setReading(0);
    try {
      const read = await readScreenshot(file, setReading);
      setText(read);
      find(read);
    } catch {
      setError("Couldn't read that picture. Try a sharper screenshot, or paste the text instead.");
    } finally {
      setReading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const kept = found?.filter((f) => f.keep) ?? [];
  const needsPlace = kept.some((f) => !f.address);

  const add = () => {
    const name = title.trim() || places.find((p) => p.id === placeId)?.name || 'Plan';
    onAdd(
      kept.map((f) => ({
        id: `manual:${newId()}`,
        title: name,
        start: f.start,
        end: f.end,
        source: 'manual',
        ...(placeId ? { placeId } : f.address ? { address: f.address } : {}),
      })),
    );
    setFound(null);
    setText('');
    setTitle('');
  };

  return (
    <section className="card">
      <h2>
        Quick add ✨ <ProChip locked={locked} />
      </h2>
      <p className="hint">
        Paste your work schedule, a text from your manager, or a confirmation email (dentist, dinner reservation,
        flight). Or pick a screenshot of your schedule app. Shoo pulls out the dates and times. Screenshots are read on
        your phone and never uploaded.
      </p>
      <textarea
        className="import-box"
        value={text}
        placeholder={'Mon 11/9 9am-5pm\nTue 11/10 2-10pm\n…or paste an email'}
        onChange={(e) => setText(e.target.value)}
        aria-label="Schedule or email text"
      />
      <div className="row">
        <button
          className="btn"
          disabled={!text.trim() || reading !== null}
          onClick={() => gate('quickAdd') && find(text)}
        >
          Find plans
        </button>
        <button
          className="btn btn-ghost"
          disabled={reading !== null}
          onClick={() => gate('quickAdd') && fileInput.current?.click()}
        >
          📷 Screenshot
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {reading !== null && <p className="hint">Reading your screenshot… {Math.round(reading * 100)}%</p>}
      {error && <p className="error">{error}</p>}
      {found && (
        <>
          <ul className="found">
            {found.map((f, i) => (
              <li key={`${f.start}-${i}`}>
                <input
                  type="checkbox"
                  checked={f.keep}
                  onChange={() => setFound(found.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))}
                  aria-label={`Keep ${dayLabel(f.start)} ${clock(f.start)}`}
                />
                <span>
                  <strong>{dayLabel(f.start)}</strong> · {clock(f.start)}
                  {f.end ? `–${clock(f.end)}` : ''}
                  {f.address && <span className="hint"> · 📍 {f.address}</span>}
                </span>
              </li>
            ))}
          </ul>
          <label className="field">
            <span className="field-label">Name</span>
            <input value={title} placeholder="Work" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Where</span>
            <PlaceSelect
              places={places}
              value={placeId}
              onChange={setPlaceId}
              allowOwn={found.some((f) => f.address)}
              ownLabel="The address in the email"
            />
          </label>
          <button className="btn" disabled={kept.length === 0 || (needsPlace && !placeId)} onClick={add}>
            Add {kept.length} plan{kept.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    </section>
  );
}

function PhoneCalendar({ shoo }: { shoo: ShooState }) {
  const { device, settings, update } = shoo;
  const connected = settings.deviceCalendar && (device.calendar === 'granted' || device.remindersPermission === 'granted');
  return (
    <section className="card">
      <h2>
        Phone calendar{device.reminders ? ' & Reminders' : ''} <ProChip locked={!shoo.pro.unlocked} />
      </h2>
      <p className="hint">
        Shoo reads (never changes) your phone's calendar{device.reminders ? ' and Reminders app' : ''}. Anything with
        an address, or that matches one of your places, gets a leave time. That includes the Google, Outlook and
        iCloud accounts already on your phone.
      </p>
      {connected && <p className="hint">✅ Connected · {device.count} upcoming</p>}
      <div className="row">
        {device.calendar !== 'granted' && (
          <button
            className="btn"
            onClick={() => shoo.pro.gate('phoneCalendar') && void device.request('calendar')}
            disabled={device.calendar === 'denied'}
          >
            Connect calendar
          </button>
        )}
        {device.reminders && device.remindersPermission !== 'granted' && (
          <button
            className="btn btn-ghost"
            onClick={() => shoo.pro.gate('phoneCalendar') && void device.request('reminders')}
            disabled={device.remindersPermission === 'denied'}
          >
            Connect Reminders
          </button>
        )}
        {connected && (
          <button className="link danger" onClick={() => update({ deviceCalendar: false })}>
            Stop reading it
          </button>
        )}
        {!settings.deviceCalendar && (device.calendar === 'granted' || device.remindersPermission === 'granted') && (
          <button className="btn" onClick={() => shoo.pro.gate('phoneCalendar') && update({ deviceCalendar: true })}>
            Turn back on
          </button>
        )}
      </div>
      {(device.calendar === 'denied' || device.remindersPermission === 'denied') && (
        <p className="hint">
          Access was turned off.{' '}
          <button className="link" onClick={shoo.openSettings}>
            Open Settings
          </button>{' '}
          and allow Shoo to see your calendar{device.reminders ? ' and Reminders' : ''}.
        </p>
      )}
    </section>
  );
}

interface Source {
  id: string;
  name: string;
  /** Shift apps: events go to Work by default. */
  work: boolean;
  how: string;
}

const SOURCES: Source[] = [
  {
    id: 'homebase',
    name: 'Homebase',
    work: true,
    how: 'In the Homebase app, open your schedule settings and look for "Sync to calendar" or "Calendar sync". Copy the link it gives you.',
  },
  {
    id: 'wheniwork',
    name: 'When I Work',
    work: true,
    how: 'In When I Work, go to your profile or My Schedule and look for "Sync Calendar" / "iCal feed". Copy that link.',
  },
  {
    id: '7shifts',
    name: '7shifts',
    work: true,
    how: 'In 7shifts, open your profile and look for "Calendar sync". Copy the iCal link.',
  },
  {
    id: 'deputy',
    name: 'Deputy',
    work: true,
    how: 'In Deputy on the web, open your profile and look for "Calendar sync" / "iCal". Copy the link.',
  },
  {
    id: 'google',
    name: 'Google',
    work: false,
    how: 'On a computer, open Google Calendar → Settings → click your calendar on the left → Integrate calendar → copy "Secret address in iCal format".',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    work: false,
    how: 'In Outlook on the web: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.',
  },
  {
    id: 'icloud',
    name: 'iCloud',
    work: false,
    how: 'In the iPhone Calendar app: Calendars → (i) next to the calendar → turn on Public Calendar → Share Link.',
  },
  {
    id: 'other',
    name: 'Other',
    work: false,
    how: 'Any app that can share your schedule as a calendar link works. Look for "Calendar sync", "Subscribe", "iCal" or "ICS" and copy the link.',
  },
];

function Calendars({ shoo }: { shoo: ShooState }) {
  const { settings, update } = shoo;
  const [source, setSource] = useState<Source | null>(null);
  const [url, setUrl] = useState('');
  const [placeId, setPlaceId] = useState('');

  const pick = (s: Source) => {
    if (!shoo.pro.gate('calendars')) return;
    setSource(s);
    setPlaceId(s.work ? (settings.places.find((p) => p.kind === 'work')?.id ?? '') : '');
  };
  const save = () => {
    if (!source || !url.trim()) return;
    const feed: CalendarFeed = { id: newId(), name: source.name, url: url.trim(), placeId, keyword: '' };
    update({ calendars: [...settings.calendars, feed] });
    setSource(null);
    setUrl('');
  };
  const change = (id: string, patch: Partial<CalendarFeed>) =>
    update({ calendars: settings.calendars.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  return (
    <section className="card">
      <h2>
        Linked calendars & work schedules <ProChip locked={!shoo.pro.unlocked} />
      </h2>
      <p className="hint">
        Link your work schedule app (Homebase, When I Work, 7shifts, Deputy) or any calendar. Shoo checks it every 30
        minutes for new plans.
      </p>
      {settings.calendars.map((c) => {
        const status = shoo.calendars[c.id];
        return (
          <div key={c.id} className="feed">
            <div className="row spread">
              <strong>📅 {c.name}</strong>
              <button className="link danger" onClick={() => update({ calendars: settings.calendars.filter((x) => x.id !== c.id) })}>
                Remove
              </button>
            </div>
            <label className="field">
              <span className="field-label">Events go to</span>
              <PlaceSelect places={settings.places} value={c.placeId} onChange={(placeId) => change(c.id, { placeId })} allowOwn />
            </label>
            <label className="field">
              <span className="field-label">Only events containing (optional)</span>
              <input value={c.keyword} placeholder="e.g. Shift" onChange={(e) => change(c.id, { keyword: e.target.value })} />
            </label>
            <p className="hint">
              {status?.syncing
                ? 'Syncing…'
                : status?.fetchedAt
                  ? `${status.count} event${status.count === 1 ? '' : 's'} in the next two weeks · synced ${clock(status.fetchedAt)} `
                  : ''}
              <button className="link" onClick={() => shoo.syncCalendar(c.id)} disabled={status?.syncing}>
                Sync now
              </button>
            </p>
            {status?.error && <p className="error">{status.error}</p>}
          </div>
        );
      })}
      <div className="sources" role="group" aria-label="Where's your calendar?">
        {SOURCES.map((s) => (
          <button key={s.id} type="button" className={`kind ${source?.id === s.id ? 'on' : ''}`} onClick={() => pick(s)}>
            {s.name}
          </button>
        ))}
      </div>
      {source && (
        <>
          <p className="hint">{source.how}</p>
          <label className="field">
            <span className="field-label">Calendar link</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://… or webcal://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Events go to</span>
            <PlaceSelect places={settings.places} value={placeId} onChange={setPlaceId} allowOwn />
          </label>
          <button className="btn" disabled={!url.trim()} onClick={save}>
            Link {source.name}
          </button>
        </>
      )}
    </section>
  );
}

function WeeklyEditor({
  places,
  weekly,
  onChange,
}: {
  places: SavedPlace[];
  weekly: WeeklyShift[];
  onChange: (w: WeeklyShift[]) => void;
}) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [title, setTitle] = useState('');
  const [placeId, setPlaceId] = useState(() => places.find((p) => p.kind === 'work')?.id ?? places[0]?.id ?? '');

  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const placeName = (id?: string) => places.find((p) => p.id === id)?.name;

  return (
    <section className="card">
      <h2>Every week</h2>
      <p className="hint">Work shifts, classes, the gym, church: anything on the same days each week.</p>
      {weekly.map((w) => (
        <div key={w.id} className="row spread">
          <span>
            <strong>{w.title || 'Work'}</strong> · {w.days.map((d) => DAYS[d]).join(', ')} · {w.start}
            {w.end ? `–${w.end}` : ''}
            {placeName(w.placeId) ? ` · ${placeName(w.placeId)}` : ''}
          </span>
          <button className="link danger" onClick={() => onChange(weekly.filter((x) => x.id !== w.id))}>
            Remove
          </button>
        </div>
      ))}
      <div className="days" role="group" aria-label="Days">
        {DAYS.map((label, d) => (
          <button
            key={label}
            type="button"
            className={`day ${days.includes(d) ? 'on' : ''}`}
            aria-pressed={days.includes(d)}
            onClick={() => toggle(d)}
          >
            {label[0]}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="field grow">
          <span className="field-label">Starts</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field grow">
          <span className="field-label">Ends</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Name</span>
        <input value={title} placeholder={placeName(placeId) ?? 'Work'} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Where</span>
        <PlaceSelect places={places} value={placeId} onChange={setPlaceId} />
      </label>
      <button
        className="btn"
        disabled={days.length === 0 || !start || !placeId}
        onClick={() =>
          onChange([
            ...weekly,
            { id: newId(), days, start, end: end || undefined, title: title.trim() || placeName(placeId) || 'Work', placeId },
          ])
        }
      >
        Add to every week
      </button>
    </section>
  );
}

function OneOff({
  places,
  onAdd,
  gate,
}: {
  places: SavedPlace[];
  onAdd: (s: Shift) => void;
  gate: (feature: ProFeature) => boolean;
}) {
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [time, setTime] = useState('09:00');
  const [title, setTitle] = useState('');
  const [placeId, setPlaceId] = useState(() => places[0]?.id ?? 'elsewhere');
  const [elsewhere, setElsewhere] = useState<Place | null>(null);
  const somewhereElse = placeId === 'elsewhere';

  const add = () => {
    const start = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(start) || (somewhereElse && !gate('elsewhere'))) return;
    const saved = places.find((p) => p.id === placeId);
    onAdd({
      id: `manual:${newId()}`,
      title: title.trim() || saved?.name || (elsewhere ? elsewhere.label.split(',')[0] : 'Plan'),
      start,
      source: 'manual',
      ...(saved ? { placeId } : elsewhere ? { location: elsewhere.location, address: elsewhere.label } : {}),
    });
    setTitle('');
    setElsewhere(null);
  };

  return (
    <section className="card">
      <h2>One-time plan</h2>
      <label className="field">
        <span className="field-label">What</span>
        <input value={title} placeholder="Dentist, dinner with Sam, covering a shift…" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="row">
        <label className="field grow">
          <span className="field-label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field grow">
          <span className="field-label">Starts</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Where</span>
        <select
          value={placeId}
          onChange={(e) => (e.target.value !== 'elsewhere' || gate('elsewhere')) && setPlaceId(e.target.value)}
          aria-label="Where"
        >
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {PLACE_KINDS[p.kind]?.icon} {p.name}
            </option>
          ))}
          <option value="elsewhere">📍 Somewhere else…</option>
        </select>
      </label>
      {somewhereElse && <PlaceSearch label="Address" value={elsewhere} onChange={setElsewhere} hereLabel="Right here" />}
      <button className="btn" disabled={somewhereElse && !elsewhere} onClick={add}>
        Add plan
      </button>
    </section>
  );
}
