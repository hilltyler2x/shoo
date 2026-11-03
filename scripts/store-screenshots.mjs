// Renders the App Store and Google Play screenshots straight into the folders
// the store upload (fastlane) reads: fastlane/screenshots/en-US/ for Apple and
// fastlane/metadata/android/en-US/images/ for Google Play.
// Runs the real app (vite dev server, no Shoo server) in Chromium with demo
// plans, a frozen clock and a faked route, then frames each screen with a caption.
//   npm run screenshots
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { tmpdir } from 'node:os';
const IOS = resolve('fastlane/screenshots/en-US');
const PLAY = resolve('fastlane/metadata/android/en-US/images');
const RAW = resolve(tmpdir(), 'shoo-raw-shots');
for (const d of [IOS, `${PLAY}/phoneScreenshots`, RAW]) mkdirSync(d, { recursive: true });

// Wednesday 2026-11-04, Chicago time.
const at = (h, m, day = 4) => new Date(`2026-11-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-06:00`).getTime();
const HOME = { lat: 41.8781, lng: -87.6298 };
const places = [
  { id: 'work', name: 'Work', kind: 'work', label: 'Lakeview Diner, 3200 N Broadway, Chicago', location: { lat: 41.9399, lng: -87.6443 } },
  { id: 'gym', name: 'Planet Fitness', kind: 'gym', label: 'Planet Fitness, 2 N State St, Chicago', location: { lat: 41.8820, lng: -87.6278 } },
  { id: 'school', name: 'Campus', kind: 'school', label: 'UIC, 1200 W Harrison St, Chicago', location: { lat: 41.8708, lng: -87.6505 } },
  { id: 'dentist', name: 'Dentist', kind: 'doctor', label: 'Smile Dental, 1050 N State St, Chicago', location: { lat: 41.9010, lng: -87.6283 } },
];
const settings = {
  places,
  home: { label: 'Home', location: HOME },
  travelMode: 'drive',
  prepMinutes: 10,
  arriveEarlyMinutes: 5,
  weekly: [
    { id: 'w1', days: [1, 3, 5], start: '09:00', end: '17:00', title: 'Shift at the diner', placeId: 'work' },
    { id: 'w2', days: [2, 4], start: '10:30', end: '12:00', title: 'Bio 101', placeId: 'school' },
    { id: 'w3', days: [1, 3], start: '18:30', title: 'Leg day', placeId: 'gym' },
  ],
  manualShifts: [{ id: 'm1', title: 'Dentist (cleaning)', start: at(15, 0, 6), source: 'manual', placeId: 'dentist' }],
  calendars: [{ id: 'cal1', name: 'Homebase schedule', url: 'https://app.joinhomebase.com/calendar/demo.ics', placeId: 'work', keyword: '' }],
  deviceCalendar: false,
  placeFor: {},
};

const server = await createServer({ server: { port: 5199, strictPort: true }, mode: 'development', define: { 'import.meta.env.VITE_API_URL': '"none"' } });
await server.listen();
const browser = await chromium.launch();

async function appShot(name, { now, tab, viewport, scroll = 0, extra = {} }) {
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    timezoneId: 'America/Chicago', geolocation: { latitude: HOME.lat, longitude: HOME.lng }, permissions: ['geolocation'],
  });
  await ctx.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: 'Ok', routes: [{ duration: 1080, distance: 9800 }] } }));
  await ctx.route(/nominatim|\.ics/, (r) => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  await page.clock.install({ time: now });
  await page.addInitScript(([s, tab, extra]) => {
    if (localStorage.getItem('shoo:seeded')) return;
    localStorage.setItem('shoo:seeded', '1');
    localStorage.setItem('shoo:settings', JSON.stringify(s));
    localStorage.setItem('shoo:tab', JSON.stringify(tab));
    localStorage.setItem('shoo:reviews', JSON.stringify({ firstOpenAt: 0, launches: 99, asks: 9, lastAskAt: Date.now() }));
    localStorage.setItem('shoo:paywallAt', JSON.stringify(Date.now()));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(`shoo:${k}`, JSON.stringify(v));
  }, [settings, tab, extra]);
  await page.goto('http://localhost:5199/');
  await page.clock.runFor(4000);
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '.banner{display:none!important}' });
  if (scroll) await page.evaluate((y) => (document.querySelector('.content') ?? document.scrollingElement).scrollTo(0, y), scroll);
  await page.waitForTimeout(300);
  const file = `${RAW}/${name}.png`;
  await page.screenshot({ path: file });
  await ctx.close();
  return file;
}

const SCREENS = [
  { name: '1-leave-by', caption: 'Know exactly when\nto walk out the door', now: at(8, 2), tab: 'today' },
  { name: '2-nags', caption: 'Nags that get less\npolite the longer you sit', now: at(8, 34), tab: 'today' },
  { name: '3-plans', caption: 'Work, class, the gym,\nthe dentist. All of it.', now: at(8, 2), tab: 'plans' },
  { name: '4-setup', caption: 'Save your spots once.\nShoo does the math.', now: at(8, 2), tab: 'setup' },
];

const DEVICES = [
  { id: 'iphone-6.9', dir: IOS, width: 440, height: 956, app: { width: 390, height: 780 } },
  { id: 'android-phone', dir: `${PLAY}/phoneScreenshots`, width: 360, height: 640, app: { width: 360, height: 700 } },
  // Play wants the long side at most twice the short one: 1080x1920.
];

const css = readFileSync(new URL('./store-frame.css', import.meta.url), 'utf8');
const dataUrl = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;

for (const d of DEVICES) {
  for (const s of SCREENS) {
    const raw = await appShot(`${d.id}-${s.name}`, { ...s, viewport: d.app });
    const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body class="${d.id}">
      <h1>${s.caption.replace(/\n/g, '<br>')}</h1>
      <div class="phone"><img src="${dataUrl(raw)}"></div></body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${d.dir}/${s.name}.png` });
    await ctx.close();
  }
}

// Google Play feature graphic, 1024x500.
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const icon = dataUrl('resources/icon.png');
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body class="feature">
    <img class="icon" src="${icon}"><div><h1>Shoo</h1><p>Never be late.<br>It nags until you leave.</p></div></body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${PLAY}/featureGraphic.png` });
  // Play's 512x512 store icon.
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<img src="${icon}" style="width:512px;height:512px;display:block">`);
  await page.screenshot({ path: `${PLAY}/icon.png` });
  await ctx.close();
}

await browser.close();
await server.close();
console.log('Screenshots in', IOS, 'and', PLAY);
