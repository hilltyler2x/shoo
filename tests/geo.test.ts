import { describe, expect, it } from 'vitest';
import { distanceMeters, estimateTravel, hasArrived, hasLeft } from '../src/core/geo';

const home = { lat: 41.8781, lng: -87.6298 };
const nextDoor = { lat: 41.8782, lng: -87.6299 };
const work = { lat: 41.9484, lng: -87.6553 }; // about 8 km north

describe('geo', () => {
  it('measures distance', () => {
    const d = distanceMeters(home, work);
    expect(d).toBeGreaterThan(7500);
    expect(d).toBeLessThan(8500);
  });
  it('knows when you have left and arrived', () => {
    expect(hasLeft(home, nextDoor)).toBe(false);
    expect(hasLeft(home, work)).toBe(true);
    expect(hasArrived(work, { lat: 41.9485, lng: -87.6552 })).toBe(true);
    expect(hasArrived(work, home)).toBe(false);
  });
  it('estimates travel time pessimistically', () => {
    const drive = estimateTravel(home, work, 'drive');
    const walk = estimateTravel(home, work, 'walk');
    expect(drive.minutes).toBeGreaterThan(10);
    expect(walk.minutes).toBeGreaterThan(drive.minutes * 5);
    expect(drive.trafficAware).toBe(false);
  });
});
