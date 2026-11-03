import { OCCASIONS, formatDuration, minutesLateIfLeavingAt, type LeavePlan, type Occasion, type Phase } from '../core';
import { MODE_LABEL, clock, dayLabel } from './format';
import type { ShooState } from './useShoo';

const TIER_LABEL = { gentle: 'Gentle', serious: 'Getting serious', panic: 'Panic mode', celebrate: 'Made it' };

export function Today({ shoo, goTo }: { shoo: ShooState; goTo: (tab: 'plans' | 'setup') => void }) {
  const { settings, active, plan, phase, estimate, now, trip, nags } = shoo;
  const nothingSetUp =
    settings.places.length === 0 && settings.calendars.length === 0 && !settings.deviceCalendar && shoo.plans.length === 0;

  if (nothingSetUp) {
    return (
      <div className="stack">
        <section className="card hero hero-chill">
          <p className="eyebrow">Welcome to Shoo</p>
          <h1>Never be late again.</h1>
          <p>
            Work, class, the gym, the dentist, a flight, dinner with friends. Tell Shoo where you're going and when, and it
            works out when you have to leave, then nags you (nicely, then not nicely) until you do.
          </p>
          <button className="btn btn-big" onClick={() => goTo('setup')}>
            Add my places
          </button>
          <button className="btn btn-ghost" onClick={() => goTo('plans')}>
            Connect my calendar
          </button>
        </section>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="stack">
        <section className="card hero hero-chill">
          <p className="eyebrow">Nothing coming up</p>
          <h1>Nothing to be late for 😎</h1>
          <p>Add plans, a weekly schedule, or connect your calendar and Shoo will take it from here.</p>
          <button className="btn btn-big" onClick={() => goTo('plans')}>
            Add plans
          </button>
        </section>
      </div>
    );
  }

  const where = active.destination ? ` · ${active.destination.name}` : '';
  const shiftLine = `${OCCASIONS[active.occasion].icon} ${active.shift.title} · ${dayLabel(active.shift.start, now)} at ${clock(active.shift.start)}${active.shift.title === active.destination?.name ? '' : where}`;

  if (!plan || !phase) {
    return (
      <div className="stack">
        <section className="card hero hero-chill">
          <p className="eyebrow">{shiftLine}</p>
          <h1>Working out the drive…</h1>
          {!shoo.origin && (
            <p>
              Shoo needs to know where you are. Allow location, or set a home address in{' '}
              <button className="link" onClick={() => goTo('setup')}>
                Setup
              </button>
              .
            </p>
          )}
          {shoo.locationError && <p className="error">{shoo.locationError}</p>}
          {shoo.routeError && <p className="error">{shoo.routeError}</p>}
        </section>
      </div>
    );
  }

  const { headline, sub } = describe(phase, plan, now, active.occasion, trip.arrivedAt);
  const travelLine = estimate
    ? `${estimate.minutes} min ${MODE_LABEL[settings.travelMode]} from ${shoo.originIsLive ? 'where you are' : trip.origin ? 'where you started' : 'home'}${estimate.trafficAware ? ' · live traffic' : ' · no live traffic'}`
    : '';
  const todaysNags = nags.filter((n) => n.shiftId === active.shift.id);

  return (
    <div className="stack">
      <section className={`card hero hero-${phase}`} aria-live="polite">
        <p className="eyebrow">{shiftLine}</p>
        <h1>{headline}</h1>
        <p className="sub">{sub}</p>
        <div className="actions">
          {phase !== 'on-the-way' && phase !== 'arrived' && (
            <button className="btn btn-big" onClick={shoo.markLeft}>
              I've left 🚪
            </button>
          )}
          {phase === 'on-the-way' && (
            <button className="btn btn-big" onClick={shoo.markArrived}>
              I'm here 🏁
            </button>
          )}
          {phase === 'arrived' && shoo.storeUrl && shoo.onTimeArrivals >= 2 && (
            <a className="btn btn-ghost" href={shoo.storeUrl}>
              Love Shoo? Rate it ⭐
            </a>
          )}
          {(phase === 'on-the-way' || phase === 'arrived') && (
            <button className="btn btn-ghost" onClick={shoo.resetTrip}>
              Oops, not yet
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <dl className="facts">
          <div>
            <dt>Get ready</dt>
            <dd>{clock(plan.getReadyAt)}</dd>
          </div>
          <div>
            <dt>Leave by</dt>
            <dd className="strong">{clock(plan.leaveAt)}</dd>
          </div>
          <div>
            <dt>Starts</dt>
            <dd>{clock(plan.shiftStart)}</dd>
          </div>
        </dl>
        <p className="hint">
          {travelLine}{' '}
          <button className="link" onClick={shoo.refreshRoute}>
            Refresh
          </button>
        </p>
        {shoo.routeError && <p className="error">{shoo.routeError}</p>}
      </section>

      {todaysNags.length > 0 && (
        <section className="card">
          <h2>What Shoo will say if you don't move</h2>
          <ol className="nags">
            {todaysNags.map((n) => (
              <li key={n.id} className={`nag nag-${n.tier}`}>
                <span className="nag-time">{clock(n.at)}</span>
                <span className={`chip chip-${n.tier}`}>{TIER_LABEL[n.tier]}</span>
                <span className="nag-body">{n.body}</span>
              </li>
            ))}
          </ol>
          {!shoo.firesWhenClosed && (
            <p className="hint">
              On the website these only pop up while Shoo is open. The phone app sends them even when it's closed.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function describe(phase: Phase, plan: LeavePlan, now: number, occasion: Occasion, arrivedAt?: number) {
  switch (phase) {
    case 'chill':
      return { headline: `Leave by ${clock(plan.leaveAt)}`, sub: `That's ${formatDuration(plan.leaveAt - now)} from now. Relax for a bit.` };
    case 'get-ready':
      return { headline: `Leave in ${formatDuration(plan.leaveAt - now)}`, sub: 'Shoes on. Keys. Phone. Go time is close. 👟' };
    case 'leave-now':
      return { headline: 'SHOO! Leave now.', sub: `Go now and you're there right on time.` };
    case 'running-late': {
      const late = minutesLateIfLeavingAt(now, plan);
      const text = occasion === 'work' ? 'Maybe text your manager.' : "Maybe send a 'running late' text.";
      return { headline: `${late} min late if you leave now`, sub: `Run to the car. ${text} 🏃` };
    }
    case 'on-the-way':
      return { headline: 'On the way 🚗', sub: `Starts at ${clock(plan.shiftStart)}. Eyes on the road.` };
    case 'arrived':
      return arrivedAt !== undefined && arrivedAt <= plan.shiftStart
        ? { headline: 'Made it! 🏆', sub: OCCASIONS[occasion].celebrate }
        : { headline: 'Made it 🫠', sub: OCCASIONS[occasion].late };
  }
}
