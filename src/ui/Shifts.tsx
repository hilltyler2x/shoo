import { useState } from 'react';
import type { Shift, WeeklyShift } from '../core';
import { clock, dayLabel } from './format';
import type { ShooState } from './useShoo';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const newId = () => Math.random().toString(36).slice(2, 10);

export function Shifts({ shoo }: { shoo: ShooState }) {
  const { settings, update, shifts, now } = shoo;

  return (
    <div className="stack">
      <section className="card">
        <h2>Coming up</h2>
        {shifts.length === 0 ? (
          <p className="hint">No shifts in the next 7 days yet. Add them below.</p>
        ) : (
          <ul className="shift-list">
            {shifts.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{dayLabel(s.start, now)}</strong> · {clock(s.start)}
                  {s.end ? `–${clock(s.end)}` : ''}
                  <div className="hint">
                    {s.title} · {SOURCE_LABEL[s.source]}
                  </div>
                </div>
                {s.source === 'manual' && (
                  <button
                    className="link danger"
                    onClick={() => update({ manualShifts: settings.manualShifts.filter((m) => m.id !== s.id) })}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <WeeklyEditor weekly={settings.weekly} onChange={(weekly) => update({ weekly })} />
      <OneOff onAdd={(s) => update({ manualShifts: [...settings.manualShifts, s] })} />
      <CalendarLink shoo={shoo} />
    </div>
  );
}

const SOURCE_LABEL: Record<Shift['source'], string> = { manual: 'one-off', weekly: 'weekly', calendar: 'calendar' };

function WeeklyEditor({ weekly, onChange }: { weekly: WeeklyShift[]; onChange: (w: WeeklyShift[]) => void }) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');

  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  return (
    <section className="card">
      <h2>Weekly schedule</h2>
      {weekly.map((w) => (
        <div key={w.id} className="row spread">
          <span>
            {w.days.map((d) => DAYS[d]).join(', ')} · {w.start}
            {w.end ? `–${w.end}` : ''}
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
      <button
        className="btn"
        disabled={days.length === 0 || !start}
        onClick={() => onChange([...weekly, { id: newId(), days, start, end: end || undefined }])}
      >
        Add weekly shift
      </button>
    </section>
  );
}

function OneOff({ onAdd }: { onAdd: (s: Shift) => void }) {
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [time, setTime] = useState('09:00');
  const [title, setTitle] = useState('');

  const add = () => {
    const start = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(start)) return;
    onAdd({ id: `manual:${newId()}`, title: title.trim() || 'Work', start, source: 'manual' });
    setTitle('');
  };

  return (
    <section className="card">
      <h2>One-off shift</h2>
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
        <span className="field-label">Name (optional)</span>
        <input value={title} placeholder="Covering for Sam" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <button className="btn" onClick={add}>
        Add shift
      </button>
    </section>
  );
}

function CalendarLink({ shoo }: { shoo: ShooState }) {
  const { settings, update, calendar } = shoo;
  const [url, setUrl] = useState(settings.calendarUrl);

  return (
    <section className="card">
      <h2>Connect a calendar</h2>
      <p className="hint">
        Paste your calendar's secret iCal address and Shoo picks up shifts from it automatically.
      </p>
      <details className="help">
        <summary>Where do I find that?</summary>
        <p>
          <strong>Google Calendar</strong> (on a computer): Settings → click your calendar on the left → Integrate
          calendar → copy <em>Secret address in iCal format</em>.
        </p>
        <p>
          <strong>Outlook</strong>: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.
        </p>
        <p>
          <strong>iPhone / iCloud</strong>: Calendar app → Calendars → (i) next to the calendar → turn on Public
          Calendar → Share Link.
        </p>
      </details>
      <label className="field">
        <span className="field-label">iCal address</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://… or webcal://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Only events containing (optional)</span>
        <input
          value={settings.calendarKeyword}
          placeholder="e.g. Shift or Work"
          onChange={(e) => update({ calendarKeyword: e.target.value })}
        />
      </label>
      <div className="row">
        <button
          className="btn"
          disabled={calendar.syncing}
          onClick={() => {
            if (url.trim() !== settings.calendarUrl) update({ calendarUrl: url.trim() });
            else shoo.syncCalendar();
          }}
        >
          {calendar.syncing ? 'Syncing…' : settings.calendarUrl && url.trim() === settings.calendarUrl ? 'Sync now' : 'Save'}
        </button>
        {settings.calendarUrl && (
          <button
            className="link danger"
            onClick={() => {
              setUrl('');
              update({ calendarUrl: '' });
            }}
          >
            Disconnect
          </button>
        )}
      </div>
      {calendar.fetchedAt && (
        <p className="hint">
          {calendar.count} event{calendar.count === 1 ? '' : 's'} in the next two weeks · synced {clock(calendar.fetchedAt)}
        </p>
      )}
      {calendar.error && <p className="error">{calendar.error}</p>}
    </section>
  );
}
