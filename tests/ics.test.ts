import { describe, expect, it } from 'vitest';
import { parseIcs } from '../src/core/ics';

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const from = Date.UTC(2026, 9, 1);
const to = Date.UTC(2026, 11, 31);
const iso = (t: number) => new Date(t).toISOString();

describe('parseIcs', () => {
  it('reads a UTC event with folded lines and escapes', () => {
    const events = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:one',
          'SUMMARY:Shift\\, front des',
          ' k',
          'DTSTART:20261026T140000Z',
          'DTEND:20261026T220000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      from,
      to,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Shift, front desk');
    expect(iso(events[0].start)).toBe('2026-10-26T14:00:00.000Z');
    expect(events[0].end! - events[0].start).toBe(8 * 3600_000);
  });

  it('converts TZID times, including Windows zone names', () => {
    const events = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:a',
          'SUMMARY:NY',
          'DTSTART;TZID=America/New_York:20261026T090000',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:b',
          'SUMMARY:Outlook',
          'DTSTART;TZID="Pacific Standard Time":20261026T090000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      from,
      to,
    );
    expect(iso(events[0].start)).toBe('2026-10-26T13:00:00.000Z');
    expect(iso(events[1].start)).toBe('2026-10-26T16:00:00.000Z');
  });

  it('skips all-day and cancelled events', () => {
    const events = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:a',
          'SUMMARY:Holiday',
          'DTSTART;VALUE=DATE:20261026',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:b',
          'STATUS:CANCELLED',
          'DTSTART:20261026T140000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      from,
      to,
    );
    expect(events).toEqual([]);
  });

  it('expands weekly repeats across DST with exceptions and a moved shift', () => {
    const events = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'UID:shift',
          'SUMMARY:Work',
          'DTSTART;TZID=America/Chicago:20261026T090000',
          'DTEND;TZID=America/Chicago:20261026T170000',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
          'EXDATE;TZID=America/Chicago:20261028T090000',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:shift',
          'RECURRENCE-ID;TZID=America/Chicago:20261102T090000',
          'SUMMARY:Work (late start)',
          'DTSTART;TZID=America/Chicago:20261102T110000',
          'DTEND;TZID=America/Chicago:20261102T190000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      from,
      to,
    );
    expect(events.map((e) => [iso(e.start), e.title])).toEqual([
      ['2026-10-26T14:00:00.000Z', 'Work'], // CDT, UTC-5
      // Oct 28 removed by EXDATE
      ['2026-11-02T17:00:00.000Z', 'Work (late start)'], // moved, now CST
      ['2026-11-04T15:00:00.000Z', 'Work'], // CST, UTC-6
      ['2026-11-09T15:00:00.000Z', 'Work'],
      ['2026-11-11T15:00:00.000Z', 'Work'],
    ]);
  });

  it('only returns occurrences inside the window', () => {
    const events = parseIcs(
      wrap(['BEGIN:VEVENT', 'UID:d', 'DTSTART:20200101T140000Z', 'RRULE:FREQ=DAILY', 'END:VEVENT'].join('\r\n')),
      Date.UTC(2026, 9, 26),
      Date.UTC(2026, 9, 28, 23),
    );
    expect(events.map((e) => iso(e.start))).toEqual([
      '2026-10-26T14:00:00.000Z',
      '2026-10-27T14:00:00.000Z',
      '2026-10-28T14:00:00.000Z',
    ]);
  });
});
