import { describe, expect, it } from 'vitest';
import { newReviewState, recordAsk, shouldAskForReview, type ReviewState } from '../src/core/reviews';
import { DAY, HOUR } from '../src/core/time';

const t0 = Date.UTC(2026, 9, 1);
const seasoned: ReviewState = { firstOpenAt: t0, sessions: 6, onTimeArrivals: 2, asks: 0 };
const later = t0 + 5 * DAY;

describe('shouldAskForReview', () => {
  it('never asks on first open', () => {
    const fresh = { ...newReviewState(t0), sessions: 1, onTimeArrivals: 5 };
    expect(shouldAskForReview(fresh, t0 + HOUR, t0 + HOUR)).toBe(false);
  });

  it('waits for a couple of days, a few sessions and two on-time arrivals', () => {
    expect(shouldAskForReview({ ...seasoned }, t0 + DAY, t0 + DAY)).toBe(false);
    expect(shouldAskForReview({ ...seasoned, sessions: 2 }, later, later)).toBe(false);
    expect(shouldAskForReview({ ...seasoned, onTimeArrivals: 1 }, later, later)).toBe(false);
    expect(shouldAskForReview(seasoned, later, later)).toBe(true);
  });

  it('only asks right after the happy moment', () => {
    expect(shouldAskForReview(seasoned, later, later - 3 * HOUR)).toBe(false);
  });

  it('asks again after a month, then backs off', () => {
    let s = recordAsk(seasoned, later);
    expect(shouldAskForReview(s, later + 10 * DAY, later + 10 * DAY)).toBe(false);
    expect(shouldAskForReview(s, later + 31 * DAY, later + 31 * DAY)).toBe(true);
    s = recordAsk(recordAsk(s, later + 31 * DAY), later + 62 * DAY);
    expect(shouldAskForReview(s, later + 93 * DAY, later + 93 * DAY)).toBe(false);
    expect(shouldAskForReview(s, later + 183 * DAY, later + 183 * DAY)).toBe(true);
  });
});
