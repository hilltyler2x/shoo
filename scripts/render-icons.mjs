// Renders public/icon.svg into the PNG sizes the web app and phones need.
// Run with: node scripts/render-icons.mjs  (needs Playwright's Chromium)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright is installed globally on the dev machine, not as a project dependency.
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;
const sizes = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-512-maskable.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1],
  ['icon-1024.png', 1024, 1],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, scale] of sizes) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(
    `<body style="margin:0;background:#ff6b35;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body>',
  );
  await page.screenshot({ path: out(name), omitBackground: false });
  console.log('wrote', name);
}
await browser.close();
