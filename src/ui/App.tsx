import { useEffect, useState } from 'react';
import { platform } from '../platform';
import { Plans } from './Plans';
import { Setup } from './Setup';
import { Today } from './Today';
import { useShoo } from './useShoo';

type Tab = 'today' | 'plans' | 'setup';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '⏰' },
  { id: 'plans', label: 'Plans', icon: '📅' },
  { id: 'setup', label: 'Setup', icon: '⚙️' },
];

export function App() {
  const shoo = useShoo();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = platform.storage.load<string>('tab', 'today');
    return saved === 'shifts' ? 'plans' : (saved as Tab);
  });
  useEffect(() => platform.storage.save('tab', tab), [tab]);

  const locked = shoo.passcodeRequired && !shoo.passcodeOk;
  const shown = locked ? 'setup' : tab;

  return (
    <div className="shell">
      <header className="topbar">
        <img className="logo-mark" src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" width="34" height="34" />
        <span className="logo">Shoo</span>
        <span className="tagline">Never be late.</span>
      </header>
      {shoo.serverWaking && <div className="banner">Shoo's server is starting up… hang tight, this takes about a minute.</div>}
      {locked && <div className="banner">Enter the passcode to unlock Shoo.</div>}
      <main className="content">
        {shown === 'today' && <Today shoo={shoo} goTo={setTab} />}
        {shown === 'plans' && <Plans shoo={shoo} />}
        {shown === 'setup' && <Setup shoo={shoo} />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={shown === t.id ? 'on' : ''}
            aria-current={shown === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            disabled={locked && t.id !== 'setup'}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
