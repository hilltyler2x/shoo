import { describe, expect, it } from 'vitest';
import { addressesToLookUp, destinationFor, isVirtual, matchPlace, migrateSettings } from '../src/core/places';
import { DEFAULT_SETTINGS, type SavedPlace, type Shift } from '../src/core/types';

const work: SavedPlace = { id: 'w', name: 'Work', kind: 'work', label: 'Joe’s Diner, 12 Main St, Austin', location: { lat: 1, lng: 1 } };
const gym: SavedPlace = { id: 'g', name: 'Planet Fitness', kind: 'gym', label: 'Planet Fitness, 9 Oak Ave', location: { lat: 2, lng: 2 } };
const airport: SavedPlace = { id: 'a', name: 'AUS', kind: 'airport', label: 'Austin Airport', location: { lat: 3, lng: 3 } };
const settings = { ...DEFAULT_SETTINGS, places: [work, gym, airport] };
const shift = (over: Partial<Shift>): Shift => ({ id: 's', title: 'Thing', start: 0, source: 'calendar', ...over });

describe('places', () => {
  it('matches calendar locations to saved places', () => {
    expect(matchPlace('Planet Fitness - Oak Ave', settings.places)?.id).toBe('g');
    expect(matchPlace('Work', settings.places)?.id).toBe('w');
    expect(matchPlace('Joe’s Diner, Austin TX', settings.places)?.id).toBe('w');
    expect(matchPlace('Workshop on Tuesday', settings.places)).toBeUndefined();
  });

  it('works out where a plan is', () => {
    expect(destinationFor(shift({ placeId: 'w' }), settings, {})?.name).toBe('Work');
    expect(destinationFor(shift({ title: 'Gym' }), settings, {})).toBeNull();
    expect(destinationFor(shift({ title: 'planet fitness legs day' }), settings, {})?.placeId).toBe('g');
    const geo = { '500 elm st, austin': { label: '500 Elm St', location: { lat: 5, lng: 5 } } };
    const d = destinationFor(shift({ address: '500 Elm St, Austin' }), settings, geo);
    expect(d).toMatchObject({ name: '500 Elm St', kind: 'other', location: { lat: 5, lng: 5 } });
    expect(destinationFor(shift({ location: { lat: 7, lng: 7 }, address: 'Dentist' }), settings, {})?.location.lat).toBe(7);
    // Picking a place by hand wins.
    expect(destinationFor(shift({ placeId: 'w' }), { ...settings, placeFor: { s: 'g' } }, {})?.placeId).toBe('g');
  });

  it('gives airports a long head start', () => {
    expect(destinationFor(shift({ placeId: 'a' }), settings, {})?.arriveEarlyMinutes).toBe(90);
    expect(destinationFor(shift({ placeId: 'w' }), settings, {})?.arriveEarlyMinutes).toBe(5);
  });

  it('only looks up real addresses once', () => {
    const shifts = [
      shift({ id: '1', address: 'https://zoom.us/j/123' }),
      shift({ id: '2', address: '500 Elm St' }),
      shift({ id: '3', address: '500 Elm St' }),
      shift({ id: '4', address: 'Planet Fitness' }),
      shift({ id: '5', address: '9 Pine Rd' }),
    ];
    expect(addressesToLookUp(shifts, settings, { '9 pine rd': null })).toEqual(['500 Elm St']);
    expect(isVirtual('Microsoft Teams Meeting')).toBe(true);
    expect(isVirtual('+1 (512) 555-0100')).toBe(true);
    expect(isVirtual('Dr. Patel, 1 Health Way')).toBe(false);
  });

  it('upgrades settings from the one-job version', () => {
    const s = migrateSettings({
      job: { label: 'Diner', location: { lat: 1, lng: 1 } },
      weekly: [{ id: 'x', days: [1], start: '09:00' }],
      manualShifts: [{ id: 'm', title: 'Cover', start: 1, source: 'manual' }],
      calendarUrl: 'https://cal/x.ics',
      calendarKeyword: 'shift',
      prepMinutes: 20,
    });
    expect(s.places).toEqual([{ id: 'work', name: 'Work', kind: 'work', label: 'Diner', location: { lat: 1, lng: 1 } }]);
    expect(s.weekly[0]).toMatchObject({ placeId: 'work', title: 'Work' });
    expect(s.manualShifts[0].placeId).toBe('work');
    expect(s.calendars[0]).toMatchObject({ url: 'https://cal/x.ics', placeId: 'work', keyword: 'shift' });
    expect(s.prepMinutes).toBe(20);
    expect('job' in s).toBe(false);
    expect(migrateSettings({}).places).toEqual([]);
  });
});
