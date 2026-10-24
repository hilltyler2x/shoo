// Renders public/icon.svg into every icon size the website, iPhone and Android need.
// Run with: node scripts/render-icons.mjs  (uses the Playwright Chromium installed on the machine)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is installed globally on the dev machine, not as a project dependency.
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const root = new URL('../', import.meta.url).pathname;
const svg = readFileSync(`${root}public/icon.svg`, 'utf8');
// The clock alone, for Android's adaptive icon foreground (the orange comes from the background layer).
const foreground = svg.replace(/<rect[^>]*fill="#ff6b35"\/>/, '');

const BRAND = '#ff6b35';
const res = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const jobs = [
  // [path, size, art, scale, shape]
  ['public/icon-192.png', 192, svg, 1, 'square'],
  ['public/icon-512.png', 512, svg, 1, 'square'],
  ['public/icon-512-maskable.png', 512, svg, 0.8, 'square'],
  ['public/apple-touch-icon.png', 180, svg, 1, 'square'],
  // App Store: 1024, no transparency, no rounded corners (Apple rounds them).
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, svg, 1, 'square'],
];
for (const [name, k] of Object.entries(densities)) {
  jobs.push([`${res}/mipmap-${name}/ic_launcher.png`, 48 * k, svg, 1, 'square']);
  jobs.push([`${res}/mipmap-${name}/ic_launcher_round.png`, 48 * k, svg, 1, 'round']);
  jobs.push([`${res}/mipmap-${name}/ic_launcher_foreground.png`, 108 * k, foreground, 0.62, 'clear']);
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, size, art, scale, shape] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  const bg = shape === 'clear' ? 'transparent' : shape === 'round' ? 'transparent' : BRAND;
  const clip = shape === 'round' ? `border-radius:50%;overflow:hidden;background:${BRAND};` : '';
  await page.setContent(
    `<body style="margin:0;background:${bg};width:${size}px;height:${size}px">` +
      `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;${clip}">` +
      art.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</div></body>',
  );
  await page.screenshot({ path: `${root}${path}`, omitBackground: shape !== 'square' });
}
console.log(`wrote ${jobs.length} icons`);
await browser.close();
