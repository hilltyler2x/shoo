import { hasArrived, hasLeft } from './geo';
import type { LeavePlan, TripState } from './leavePlan';
import { MINUTE } from './time';
import type { LatLng } from './types';

/** Only watch for "left" from this long before getting ready. */
const WATCH_BEFORE_MIN = 30;

export type TripEvent = 'left' | 'arrived';

/**
 * Feed in each location fix. Returns the new trip state and what just
 * happened, if anything. `origin` is where you were when the plan was made.
 */
export function updateTrip(
  trip: TripState,
  plan: LeavePlan,
  origin: LatLng | null,
  job: LatLng,
  fix: LatLng,
  now: number,
): { trip: TripState; event?: TripEvent } {
  if (trip.arrivedAt !== undefined) return { trip };
  const watching = now >= plan.getReadyAt - WATCH_BEFORE_MIN * MINUTE;
  if (!watching) return { trip };

  if (hasArrived(job, fix)) {
    // Already at work when watching started means you never had to leave.
    return { trip: { leftAt: trip.leftAt ?? now, arrivedAt: now }, event: 'arrived' };
  }
  if (trip.leftAt === undefined && origin && hasLeft(origin, fix)) {
    return { trip: { ...trip, leftAt: now }, event: 'left' };
  }
  return { trip };
}

export function arrivedOnTime(trip: TripState, plan: LeavePlan): boolean {
  return trip.arrivedAt !== undefined && trip.arrivedAt <= plan.shiftStart;
}
