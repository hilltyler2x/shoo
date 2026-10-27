import { formatDuration, minutesLateIfLeavingAt, type LeavePlan, type Phase } from '../core';
import { MODE_LABEL, clock, dayLabel } from './format';
import type { ShooState } from './useShoo';

const TIER_LABEL = { gentle: 'Gentle', serious: 'Getting serious', panic: 'Panic mode', celebrate: 'Made it' };

export function Today({ shoo, goTo }: { shoo: ShooState; goTo: (tab: 'shifts' | 'setup') => void }) {
  const { settings, active, plan, phase, estimate, now, trip, nags } = shoo;

  if (!settings.job) {
    return (
      <div className="stack">
        <section className="card hero hero-chill">
          <p className="eyebrow">Welcome to Shoo</p>
          <h1>Never be late again.</h1>
          <p>Tell Shoo where work is and when your shifts are. It works out when you have to leave, then nags you (nicely, then not nicely) until you do.</p>
          <button className="btn btn-big" onClick={() => goTo('setup')}>
            Set up my job
          </button>
        </section>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="stack">
        <section className="card hero hero-chill">
          <p className="eyebrow">No shifts this week</p>
          <h1>Nothing to be late for 😎</h1>
          <p>Add your work schedule or connect your calendar and Shoo will take it from here.</p>
          <button className="btn btn-big" onClick={() => goTo('shifts')}>
            Add shifts
          </button>
        </section>
      </div>
    );
  }

  const shiftLine = `${active.title} · ${dayLabel(active.start, now)} at ${clock(active.start)}`;

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

  const { headline, sub } = describe(phase, plan, now, trip.arrivedAt);
  const travelLine = estimate
    ? `${estimate.minutes} min ${MODE_LABEL[settings.travelMode]} from ${shoo.originIsLive ? 'where you are' : trip.origin ? 'where you started' : 'home'}${estimate.trafficAware ? ' · live traffic' : ' · no live traffic'}`
    : '';
  const todaysNags = nags.filter((n) => n.shiftId === active.id);

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
            <dt>Shift starts</dt>
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

function describe(phase: Phase, plan: LeavePlan, now: number, arrivedAt?: number) {
  switch (phase) {
    case 'chill':
      return { headline: `Leave by ${clock(plan.leaveAt)}`, sub: `That's ${formatDuration(plan.leaveAt - now)} from now. Relax for a bit.` };
    case 'get-ready':
      return { headline: `Leave in ${formatDuration(plan.leaveAt - now)}`, sub: 'Shoes on. Keys. Phone. Go time is close. 👟' };
    case 'leave-now':
      return { headline: 'SHOO! Leave now.', sub: `Go now and you're there right on time.` };
    case 'running-late': {
      const late = minutesLateIfLeavingAt(now, plan);
      return { headline: `${late} min late if you leave now`, sub: "Run to the car. Maybe text your manager. 🏃" };
    }
    case 'on-the-way':
      return { headline: 'On the way 🚗', sub: `Shift starts at ${clock(plan.shiftStart)}. Eyes on the road.` };
    case 'arrived':
      return arrivedAt !== undefined && arrivedAt <= plan.shiftStart
        ? { headline: 'Made it! 🏆', sub: 'Look at you, on time like a responsible adult.' }
        : { headline: 'Made it 🫠', sub: 'Not on time, but you made it. Tomorrow we try again.' };
  }
}
