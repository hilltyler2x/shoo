import { describe, expect, it } from 'vitest';
import { computeLeavePlan } from '../src/core/leavePlan';
import { arrivedOnTime, updateTrip } from '../src/core/trip';

const at = (h: number, m: number) => new Date(2026, 9, 26, h, m).getTime();
const plan = computeLeavePlan({ shiftStart: at(9, 0), travelMinutes: 20, prepMinutes: 10, arriveEarlyMinutes: 0 });
const home = { lat: 41.8781, lng: -87.6298 };
const road = { lat: 41.89, lng: -87.64 };
const work = { lat: 41.9484, lng: -87.6553 };

describe('updateTrip', () => {
  it('ignores movement long before the shift', () => {
    expect(updateTrip({}, plan, home, work, road, at(6, 0)).event).toBeUndefined();
  });
  it('notices leaving, then arriving', () => {
    const left = updateTrip({}, plan, home, work, road, at(8, 32));
    expect(left.event).toBe('left');
    const arrived = updateTrip(left.trip, plan, home, work, work, at(8, 55));
    expect(arrived.event).toBe('arrived');
    expect(arrivedOnTime(arrived.trip, plan)).toBe(true);
  });
  it('stays quiet while you are still home', () => {
    expect(updateTrip({}, plan, home, work, home, at(8, 35)).event).toBeUndefined();
  });
});
