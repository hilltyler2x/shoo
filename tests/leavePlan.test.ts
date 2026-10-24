import { describe, expect, it } from 'vitest';
import { computeLeavePlan, minutesLateIfLeavingAt, phaseAt } from '../src/core/leavePlan';
import { MINUTE } from '../src/core/time';

const nine = new Date(2026, 9, 26, 9, 0).getTime();
const plan = computeLeavePlan({ shiftStart: nine, travelMinutes: 22, prepMinutes: 10, arriveEarlyMinutes: 5 });
const at = (h: number, m: number) => new Date(2026, 9, 26, h, m).getTime();

describe('computeLeavePlan', () => {
  it('works backwards from the shift start', () => {
    expect(plan.arriveBy).toBe(at(8, 55));
    expect(plan.leaveAt).toBe(at(8, 33));
    expect(plan.getReadyAt).toBe(at(8, 23));
  });
});

describe('phaseAt', () => {
  it('moves from chill to running late as time passes', () => {
    expect(phaseAt(at(8, 0), plan)).toBe('chill');
    expect(phaseAt(at(8, 25), plan)).toBe('get-ready');
    expect(phaseAt(at(8, 35), plan)).toBe('leave-now');
    expect(phaseAt(at(8, 38), plan)).toBe('leave-now'); // 8:38 + 22 = 9:00 exactly
    expect(phaseAt(at(8, 39), plan)).toBe('running-late');
  });

  it('trip state wins over the clock', () => {
    expect(phaseAt(at(8, 50), plan, { leftAt: at(8, 40) })).toBe('on-the-way');
    expect(phaseAt(at(9, 5), plan, { leftAt: at(8, 40), arrivedAt: at(9, 2) })).toBe('arrived');
  });
});

describe('minutesLateIfLeavingAt', () => {
  it('is zero when there is still time', () => {
    expect(minutesLateIfLeavingAt(at(8, 30), plan)).toBe(0);
  });
  it('counts the minutes past the start', () => {
    expect(minutesLateIfLeavingAt(at(8, 45), plan)).toBe(7);
    expect(minutesLateIfLeavingAt(at(8, 45) + 30 * 1000, plan)).toBe(8);
    expect(minutesLateIfLeavingAt(at(8, 38) + MINUTE, plan)).toBe(1);
  });
});
