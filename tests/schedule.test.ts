import { describe, expect, it } from 'vitest';
import { parsePlan, parseSchedule } from '../src/core/schedule';

// Monday Nov 2 2026, 8am Chicago (tests run with TZ=America/Chicago).
const now = new Date(2026, 10, 2, 8).getTime();
const show = (text: string) =>
  parseSchedule(text, now).map(({ start, end }) => {
    const f = (t: number) => {
      const d = new Date(t);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    return `${f(start)}-${f(end)}`;
  });

describe('parseSchedule', () => {
  it('reads a texted schedule with weekdays and dates', () => {
    expect(
      show(`Mon 11/2 9:00am - 5:00pm
Tuesday, Nov 3   2-10pm
Wed  OFF
Thu 11/5 9-5`),
    ).toEqual(['11/2 09:00-11/2 17:00', '11/3 14:00-11/3 22:00', '11/5 09:00-11/5 17:00']);
  });

  it('handles 24 hour times, ISO dates and overnight shifts', () => {
    expect(show('2026-11-06 22:00 – 06:30')).toEqual(['11/6 22:00-11/7 06:30']);
    expect(show('11/07/2026 07:00 to 15:30')).toEqual(['11/7 07:00-11/7 15:30']);
  });

  it('puts a lone weekday on the next one coming up', () => {
    expect(show('Friday 11am-7pm')).toEqual(['11/6 11:00-11/6 19:00']);
    expect(show('Monday 10:30 AM - 2:30 PM')).toEqual(['11/2 10:30-11/2 14:30']);
  });

  it('uses the date on the line above, like a screenshot list', () => {
    expect(
      show(`Saturday, November 7
Server · Main St
4:00 PM - 11:00 PM`),
    ).toEqual(['11/7 16:00-11/7 23:00']);
  });

  it('pairs a row of dates with a row of times (weekly grid)', () => {
    expect(
      show(`Mon 11/2   Tue 11/3   Wed 11/4
9a-5p   12p-8p   6a-2p`),
    ).toEqual(['11/2 09:00-11/2 17:00', '11/3 12:00-11/3 20:00', '11/4 06:00-11/4 14:00']);
  });

  it('rolls a date that already passed into next year, and ignores lines with no date', () => {
    expect(show('Jan 4 8am-4pm')).toEqual(['1/4 08:00-1/4 16:00']);
    expect(new Date(parseSchedule('Jan 4 8am-4pm', now)[0].start).getFullYear()).toBe(2027);
    expect(show('Call 555-1234 between 9 and 5')).toEqual([]);
    expect(show('9am-5pm')).toEqual([]);
  });
});

describe('parsePlan', () => {
  it('pulls the time and address out of a confirmation email', () => {
    const p = parsePlan(
      `Hi Tyler,
Your appointment with Dr. Patel is confirmed for Thursday, November 5 at 2:30 PM.
Location: Bright Smiles Dental, 1200 Barton Springs Rd, Austin, TX 78704
Please arrive 10 minutes early.`,
      now,
    );
    expect(new Date(p!.start)).toEqual(new Date(2026, 10, 5, 14, 30));
    expect(p!.address).toBe('1200 Barton Springs Rd, Austin, TX 78704');
  });
  it('reads 24 hour times and the next line', () => {
    const p = parsePlan('Flight AA 1234\nDeparts 11/20/2026\n06:15 from AUS', now);
    expect(new Date(p!.start)).toEqual(new Date(2026, 10, 20, 6, 15));
    expect(p!.address).toBeUndefined();
    expect(parsePlan('no dates here at 5pm', now)).toBeNull();
  });
});
