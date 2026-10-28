import type { LeavePlan } from './leavePlan';
import { TIER_TITLES, usableMessages, type MessageContext } from './messages';
import { MINUTE } from './time';
import type { NagTier, ScheduledNag } from './types';

export interface NagOptions {
  /** Minutes between "Getting serious" nags. */
  seriousEvery: number;
  /** Minutes between "Panic mode" nags. */
  panicEvery: number;
  /** Keep nagging this long after the shift starts. */
  panicAfterStart: number;
  /** iOS keeps at most 64 pending local notifications per app, shared across shifts. */
  maxPerShift: number;
  trafficAware: boolean;
}

export const DEFAULT_NAG_OPTIONS: NagOptions = {
  seriousEvery: 3,
  panicEvery: 2,
  panicAfterStart: 10,
  maxPerShift: 15,
  trafficAware: false,
};

/**
 * Every reminder for one shift, from "put your shoes on" to "LEAVE.", as if
 * you never get up. The app cancels whatever is left the moment you leave.
 *
 *   gentle   getting ready, before the leave time
 *   serious  past the leave time, but leaving now still gets you there by the start
 *   panic    leaving now means walking in late
 */
export function buildNagSchedule(
  shiftId: string,
  plan: LeavePlan,
  options: Partial<NagOptions> = {},
): ScheduledNag[] {
  const opts = { ...DEFAULT_NAG_OPTIONS, ...options };
  const { leaveAt, getReadyAt, shiftStart } = plan;

  const gentleTimes = unique([getReadyAt, leaveAt - 10 * MINUTE, leaveAt - 5 * MINUTE])
    .filter((t) => t >= getReadyAt && t < leaveAt)
    .sort((a, b) => a - b);

  // The last moment you can leave and still make the start is where panic begins.
  const lastOnTimeLeave = shiftStart - plan.travelMinutes * MINUTE;
  const panicStart = Math.max(leaveAt + opts.seriousEvery * MINUTE, lastOnTimeLeave);
  const seriousTimes = steps(leaveAt, panicStart, opts.seriousEvery);
  const panicTimes = steps(panicStart, shiftStart + opts.panicAfterStart * MINUTE + 1, opts.panicEvery);

  const nags: ScheduledNag[] = [];
  const add = (tier: NagTier, times: number[], lastLine?: 'last') => {
    times.forEach((at, i) => {
      const ctx = contextAt(at, plan, opts.trafficAware);
      const lines = usableMessages(tier, ctx);
      const isLast = lastLine && i === times.length - 1;
      // Panic always ends on the final line, so cycle through the others first.
      const pool = lastLine && lines.length > 1 ? lines.slice(0, -1) : lines;
      const body = isLast ? lines[lines.length - 1] : pool[i % pool.length];
      nags.push({ id: `${shiftId}:${tier}:${i}`, shiftId, at, tier, title: TIER_TITLES[tier], body });
    });
  };

  add('gentle', gentleTimes);
  add('serious', capTimes(seriousTimes, 6));
  add('panic', capTimes(panicTimes, 6), 'last');
  return nags.slice(0, opts.maxPerShift);
}

export function contextAt(at: number, plan: LeavePlan, trafficAware: boolean): MessageContext {
  return {
    travel: plan.travelMinutes,
    untilStart: Math.max(0, Math.round((plan.shiftStart - at) / MINUTE)),
    leaveIn: Math.max(0, Math.round((plan.leaveAt - at) / MINUTE)),
    trafficAware,
  };
}

/** Only the nags still in the future. */
export function pendingNags(nags: ScheduledNag[], now: number): ScheduledNag[] {
  return nags.filter((n) => n.at > now);
}

function steps(from: number, until: number, everyMinutes: number): number[] {
  const out: number[] = [];
  for (let t = from; t < until; t += everyMinutes * MINUTE) out.push(t);
  return out;
}

/** Keep the first few and the very last, so the final line always lands. */
function capTimes(times: number[], max: number): number[] {
  if (times.length <= max) return times;
  return [...times.slice(0, max - 1), times[times.length - 1]];
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}
