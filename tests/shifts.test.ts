import { describe, expect, it } from 'vitest';
import { expandWeekly, upcomingShifts } from '../src/core/shifts';
import { DEFAULT_SETTINGS } from '../src/core/types';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe('expandWeekly', () => {
  it('turns a weekday pattern into dates', () => {
    // Oct 26 2026 is a Monday.
    const shifts = expandWeekly([{ id: 'w', days: [1, 3, 5], start: '09:00', end: '17:00' }], at(26, 0), at(31, 23));
    expect(shifts.map((s) => new Date(s.start).getDate())).toEqual([26, 28, 30]);
    expect(new Date(shifts[0].start).getHours()).toBe(9);
    expect(shifts[0].end! - shifts[0].start).toBe(8 * 3600_000);
  });
  it('handles overnight shifts', () => {
    const [s] = expandWeekly([{ id: 'n', days: [1], start: '22:00', end: '06:00' }], at(26, 0), at(26, 23));
    expect(new Date(s.end!).getDate()).toBe(27);
  });
  it('keeps the wall clock time across the DST change', () => {
    // US clocks fall back on Nov 1 2026.
    const shifts = expandWeekly([{ id: 'w', days: [0, 1, 2, 3, 4, 5, 6], start: '09:00' }], at(31, 0), at(31, 0) + 4 * 86400_000);
    expect(shifts.map((s) => new Date(s.start).getHours())).toEqual([9, 9, 9, 9]);
  });
});

describe('upcomingShifts', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    weekly: [{ id: 'w', days: [1, 2], start: '09:00' }],
    manualShifts: [{ id: 'm1', title: 'Covering for Sam', start: at(26, 9), source: 'manual' as const }],
    calendarKeyword: 'shift',
  };
  const events = [
    { uid: 'a', title: 'Shift at the shop', location: '', start: at(27, 13) },
    { uid: 'b', title: 'Dentist', location: '', start: at(27, 16) },
  ];

  it('merges sources, prefers manual, filters by keyword', () => {
    const shifts = upcomingShifts(settings, events, at(26, 7));
    expect(shifts.map((s) => [s.title, s.source])).toEqual([
      ['Covering for Sam', 'manual'],
      ['Work', 'weekly'],
      ['Shift at the shop', 'calendar'],
    ]);
  });

  it('keeps a shift that just started so the late nags still apply', () => {
    expect(upcomingShifts(settings, [], at(26, 9, 10))[0].start).toBe(at(26, 9));
    expect(upcomingShifts(settings, [], at(26, 9, 20))[0].start).not.toBe(at(26, 9));
  });
});
