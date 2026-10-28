import { DAY, HOUR } from './time';

// When to ask for an App Store / Play Store review. Ask often, but only right
// after something good happened, and never in the first days of using the app.
// Apple shows its review prompt at most 3 times a year and Google has its own
// quota, so asking more often than this would just be ignored.

export interface ReviewState {
  /** First time the app was opened (epoch ms). */
  firstOpenAt: number;
  /** Number of separate launches. */
  sessions: number;
  onTimeArrivals: number;
  asks: number;
  lastAskAt?: number;
}

export const REVIEW_RULES = {
  minDaysSinceFirstOpen: 2,
  minSessions: 3,
  minOnTimeArrivals: 2,
  /** Wait this long between asks, for the first few asks. */
  cooldownDays: 30,
  /** After this many asks, back off to the long cooldown. */
  asksBeforeBackoff: 3,
  longCooldownDays: 120,
  /** A happy moment older than this is too stale to ask about. */
  freshFor: 2 * HOUR,
};

export function newReviewState(now: number): ReviewState {
  return { firstOpenAt: now, sessions: 0, onTimeArrivals: 0, asks: 0 };
}

/** Call after an on-time arrival (already counted) to decide whether to show the review prompt now. */
export function shouldAskForReview(state: ReviewState, now: number, happyMomentAt: number): boolean {
  const r = REVIEW_RULES;
  if (now - happyMomentAt > r.freshFor) return false;
  if (now - state.firstOpenAt < r.minDaysSinceFirstOpen * DAY) return false;
  if (state.sessions < r.minSessions) return false;
  if (state.onTimeArrivals < r.minOnTimeArrivals) return false;
  if (state.lastAskAt !== undefined) {
    const cooldown = state.asks >= r.asksBeforeBackoff ? r.longCooldownDays : r.cooldownDays;
    if (now - state.lastAskAt < cooldown * DAY) return false;
  }
  return true;
}

export function recordAsk(state: ReviewState, now: number): ReviewState {
  return { ...state, asks: state.asks + 1, lastAskAt: now };
}
