import { useEffect, useState } from 'react';
import { PRO_PITCH } from '../core';
import type { ProOption } from '../platform';
import type { ShooState } from './useShoo';

const PERKS = [
  '📍 Unlimited places: gym, class, dentist, airport, anywhere',
  '📅 Calendars, Reminders and shift apps sync on their own',
  '✨ Paste or screenshot a schedule and you\'re done',
  '🚨 Panic mode, for the truly couch-bound',
  '😂 Jokes for every occasion: date night, flights, kids pickup…',
];

const LABEL: Record<ProOption['kind'], string> = { annual: 'Yearly', monthly: 'Monthly', lifetime: 'Lifetime' };
const PER: Record<ProOption['kind'], string> = { annual: '/year', monthly: '/month', lifetime: ' once' };
const ORDER: ProOption['kind'][] = ['annual', 'monthly', 'lifetime'];

export function Paywall({ shoo }: { shoo: ShooState }) {
  const { pro } = shoo;
  const reason = pro.paywall;
  const [options, setOptions] = useState<ProOption[] | null>(null);
  const [chosen, setChosen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pro
      .options()
      .then((found) => {
        const sorted = [...found].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
        setOptions(sorted);
        setChosen(sorted[0]?.id ?? '');
      })
      .catch(() => setError("Couldn't reach the store. Check your connection and try again."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!reason) return null;

  const act = async (fn: () => Promise<boolean>, failMessage: string) => {
    setBusy(true);
    setError('');
    try {
      const ok = await fn();
      if (!ok && failMessage) setError(failMessage);
    } catch {
      setError('Something went wrong with the store. You were not charged. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  const pick = options?.find((o) => o.id === chosen);

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <section className="card sheet">
        <button className="sheet-close link" onClick={pro.close} aria-label="Close">
          ✕
        </button>
        <p className="eyebrow">Shoo Pro</p>
        <h2 id="paywall-title">
          {reason === 'arrival' ? 'On time again! Imagine that for everything.' : 'That one\'s a Pro thing'}
        </h2>
        <p className="hint">
          {reason === 'arrival'
            ? 'Free Shoo gets you to work. Pro gets you everywhere else on time too.'
            : PRO_PITCH[reason]}
        </p>
        <ul className="perks">
          {PERKS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {options === null && !error && <p className="hint">Loading prices…</p>}
        {options && options.length === 0 && <p className="hint">Pro isn't on sale in your store yet. Check back soon.</p>}
        <div className="plans-pick" role="radiogroup" aria-label="Choose a plan">
          {options?.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen === o.id}
              className={`plan-option ${chosen === o.id ? 'on' : ''}`}
              onClick={() => setChosen(o.id)}
            >
              <span className="plan-name">
                {LABEL[o.kind]}
                {o.kind === 'annual' && <span className="chip chip-celebrate">Best deal</span>}
              </span>
              <span className="plan-price">
                {o.price}
                {PER[o.kind]}
              </span>
              {o.intro && <span className="hint">{o.intro}</span>}
            </button>
          ))}
        </div>
        <button
          className="btn btn-big"
          disabled={!pick || busy}
          onClick={() => pick && void act(() => pro.buy(pick.id), '')}
        >
          {busy ? 'One sec…' : pick?.intro?.includes('free') ? 'Start free trial' : 'Get Shoo Pro'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="hint small">
          Paid through your {shoo.platformName === 'ios' ? 'Apple ID' : 'Google Play account'}. Subscriptions renew
          until you cancel, anytime, in your {shoo.platformName === 'ios' ? 'App Store' : 'Google Play'} settings.
          Live traffic and getting to work stay free forever.
        </p>
        <button
          className="link"
          disabled={busy}
          onClick={() => void act(pro.restore, "We didn't find a Pro purchase on this account.")}
        >
          Restore purchases
        </button>
      </section>
    </div>
  );
}
