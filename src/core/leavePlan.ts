import { MINUTE } from './time';

export interface LeavePlanInput {
  shiftStart: number;
  travelMinutes: number;
  prepMinutes: number;
  arriveEarlyMinutes: number;
}

export interface LeavePlan extends LeavePlanInput {
  /** When you should arrive (shift start minus the early buffer). */
  arriveBy: number;
  /** When you have to walk out the door. */
  leaveAt: number;
  /** When to start getting ready. */
  getReadyAt: number;
}

export function computeLeavePlan(input: LeavePlanInput): LeavePlan {
  const arriveBy = input.shiftStart - input.arriveEarlyMinutes * MINUTE;
  const leaveAt = arriveBy - input.travelMinutes * MINUTE;
  const getReadyAt = leaveAt - input.prepMinutes * MINUTE;
  return { ...input, arriveBy, leaveAt, getReadyAt };
}

export type Phase =
  | 'chill' //       nothing to do yet
  | 'get-ready' //   getting ready window
  | 'leave-now' //   past leave time, leaving now still makes the shift
  | 'running-late' // leaving now means walking in after the shift starts
  | 'on-the-way'
  | 'arrived';

export interface TripState {
  leftAt?: number;
  arrivedAt?: number;
}

export function phaseAt(now: number, plan: LeavePlan, trip: TripState = {}): Phase {
  if (trip.arrivedAt !== undefined) return 'arrived';
  if (trip.leftAt !== undefined) return 'on-the-way';
  if (now < plan.getReadyAt) return 'chill';
  if (now < plan.leaveAt) return 'get-ready';
  if (projectedArrival(now, plan) <= plan.shiftStart) return 'leave-now';
  return 'running-late';
}

/** If you left at `now`, when would you get there? */
export function projectedArrival(now: number, plan: LeavePlan): number {
  return now + plan.travelMinutes * MINUTE;
}

/** Minutes late if you left at `now` (0 if on time). */
export function minutesLateIfLeavingAt(now: number, plan: LeavePlan): number {
  return Math.max(0, Math.ceil((projectedArrival(now, plan) - plan.shiftStart) / MINUTE));
}
