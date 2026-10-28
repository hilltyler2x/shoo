import { describe, expect, it } from 'vitest';
import { computeLeavePlan } from '../src/core/leavePlan';
import { MESSAGES } from '../src/core/messages';
import { buildNagSchedule, pendingNags } from '../src/core/nags';

const at = (h: number, m: number) => new Date(2026, 9, 26, h, m).getTime();
const clock = (t: number) => {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('buildNagSchedule', () => {
  const plan = computeLeavePlan({ shiftStart: at(9, 0), travelMinutes: 22, prepMinutes: 10, arriveEarlyMinutes: 10 });
  // arrive by 8:50, leave 8:28, get ready 8:18, last on-time leave 8:38
  const nags = buildNagSchedule('s1', plan, { trafficAware: true });

  it('escalates gentle, then serious, then panic, in time order', () => {
    const tiers = nags.map((n) => n.tier);
    expect(tiers.indexOf('serious')).toBeGreaterThan(tiers.lastIndexOf('gentle'));
    expect(tiers.indexOf('panic')).toBeGreaterThan(tiers.lastIndexOf('serious'));
    const times = nags.map((n) => n.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('nags on a sensible timeline', () => {
    expect(nags.map((n) => `${clock(n.at)} ${n.tier}`)).toEqual([
      '8:18 gentle',
      '8:23 gentle',
      '8:28 serious',
      '8:31 serious',
      '8:34 serious',
      '8:37 serious',
      '8:38 panic',
      '8:40 panic',
      '8:42 panic',
      '8:44 panic',
      '8:46 panic',
      '9:10 panic',
    ]);
  });

  it('opens with the shoes line and ends on LEAVE', () => {
    expect(nags[0].body).toBe(MESSAGES.gentle[0].text);
    expect(nags.at(-1)!.body).toMatch(/LEAVE\.$/);
    expect(nags.find((n) => n.tier === 'serious')!.body).toBe('Shoo. Shoo. SHOO. 🚪');
  });

  it('fills in the real numbers', () => {
    const math = nags.find((n) => n.body.includes('Do the math'));
    expect(math?.body).toBe("You're 22 minutes away and you start in 29. Do the math, superstar.");
    const spicy = nags.find((n) => n.body.includes('spicy'));
    expect(spicy?.body).toBe("Traffic's looking a little spicy. Leave in 5 and you're golden.");
  });

  it("doesn't claim spicy traffic without live traffic data", () => {
    const quiet = buildNagSchedule('s1', plan, { trafficAware: false });
    expect(quiet.some((n) => n.body.includes('spicy'))).toBe(false);
    expect(quiet.some((n) => n.body === "Leave in 5 and you're golden.")).toBe(true);
  });

  it('still has a serious nag when there is no early buffer', () => {
    const tight = computeLeavePlan({ shiftStart: at(9, 0), travelMinutes: 20, prepMinutes: 5, arriveEarlyMinutes: 0 });
    const out = buildNagSchedule('s2', tight);
    expect(out.filter((n) => n.tier === 'serious')).toHaveLength(1);
    expect(out.find((n) => n.tier === 'panic')!.at).toBe(at(8, 43));
  });

  it('stays under the iPhone pending notification budget', () => {
    const lazy = computeLeavePlan({ shiftStart: at(9, 0), travelMinutes: 10, prepMinutes: 60, arriveEarlyMinutes: 60 });
    expect(buildNagSchedule('s3', lazy).length).toBeLessThanOrEqual(15);
  });

  it('gives each nag a stable id', () => {
    const again = buildNagSchedule('s1', plan, { trafficAware: true });
    expect(again.map((n) => n.id)).toEqual(nags.map((n) => n.id));
    expect(new Set(nags.map((n) => n.id)).size).toBe(nags.length);
  });

  it('pendingNags drops the ones already sent', () => {
    expect(pendingNags(nags, at(8, 30)).every((n) => n.at > at(8, 30))).toBe(true);
  });
});
