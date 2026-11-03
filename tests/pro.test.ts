import { describe, expect, it } from 'vitest';
import { applyFreeLimits, freeOccasion } from '../src/core/pro';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/types';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  places: [
    { id: 'w', name: 'Work', kind: 'work', label: 'Diner', location: { lat: 1, lng: 1 } },
    { id: 'g', name: 'Gym', kind: 'gym', label: 'Gym', location: { lat: 2, lng: 2 } },
  ],
  weekly: [
    { id: 'a', days: [1], start: '09:00', placeId: 'w' },
    { id: 'b', days: [2], start: '18:00', placeId: 'g' },
  ],
  manualShifts: [
    { id: 'm1', title: 'Cover', start: 1, source: 'manual', placeId: 'w' },
    { id: 'm2', title: 'Dentist', start: 2, source: 'manual', address: '1 Elm', location: { lat: 3, lng: 3 } },
  ],
  calendars: [{ id: 'c', name: 'Homebase', url: 'x', placeId: 'w', keyword: '' }],
  deviceCalendar: true,
  placeFor: { x: 'w', y: 'g' },
};

describe('free limits', () => {
  it('keep one place and the plans typed in for it', () => {
    const free = applyFreeLimits(settings);
    expect(free.places.map((p) => p.id)).toEqual(['w']);
    expect(free.weekly.map((w) => w.id)).toEqual(['a']);
    expect(free.manualShifts.map((s) => s.id)).toEqual(['m1']);
    expect(free.calendars).toEqual([]);
    expect(free.deviceCalendar).toBe(false);
    expect(free.placeFor).toEqual({ x: 'w' });
    // Nothing saved is touched.
    expect(settings.places).toHaveLength(2);
  });
  it('gives work jokes at work and the general set elsewhere', () => {
    expect(freeOccasion('work')).toBe('work');
    expect(freeOccasion('gym')).toBe('other');
  });
});
