// Renders the Dashing Clock (resources/) into every icon size the iPhone and
// Android projects need. Web icons already live in public/icons/.
// Run with: npm run icons  (uses the Playwright Chromium installed on the machine)
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is installed globally on the dev machine, not as a project dependency.
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const root = new URL('../', import.meta.url).pathname;
const read = (name) => readFileSync(`${root}resources/${name}`, 'utf8');
const full = read('icon.svg');
const foreground = read('icon-foreground.svg');
const background = read('icon-background.svg');

// App Store: 1024, no transparency, square corners (Apple rounds them).
copyFileSync(`${root}resources/icon.png`, `${root}ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`);

const res = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const jobs = [];
for (const [name, k] of Object.entries(densities)) {
  jobs.push([`${res}/mipmap-${name}/ic_launcher.png`, 48 * k, full, false]);
  jobs.push([`${res}/mipmap-${name}/ic_launcher_round.png`, 48 * k, full, true]);
  // Adaptive icon layers are 108dp; the art already sits inside the safe zone.
  jobs.push([`${res}/mipmap-${name}/ic_launcher_foreground.png`, 108 * k, foreground, false]);
  jobs.push([`${res}/mipmap-${name}/ic_launcher_background.png`, 108 * k, background, false]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, size, art, round] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const clip = round ? 'border-radius:50%;overflow:hidden;' : '';
  const sized = art.replace(/<svg([^>]*?)\swidth="\d+"\sheight="\d+"/, '<svg$1').replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;${clip}">${sized}</div></body>`,
  );
  await page.screenshot({ path: `${root}${path}`, omitBackground: true });
}
// Splash screens: the clock on the orange gradient, with the name under it.
// Each existing splash file keeps its size (read from the PNG header).
const pngSize = (path) => {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const splashes = [
  ...readdirSync(`${root}${res}`)
    .filter((d) => d.startsWith('drawable'))
    .map((d) => `${res}/${d}/splash.png`)
    .filter((p) => {
      try {
        readFileSync(`${root}${p}`);
        return true;
      } catch {
        return false;
      }
    }),
  ...readdirSync(`${root}ios/App/App/Assets.xcassets/Splash.imageset`)
    .filter((f) => f.endsWith('.png'))
    .map((f) => `ios/App/App/Assets.xcassets/Splash.imageset/${f}`),
];
for (const path of splashes) {
  const [w, h] = pngSize(`${root}${path}`);
  const art = Math.round(Math.min(w, h) * 0.42);
  const font = Math.round(art * 0.26);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<body style="margin:0;width:${w}px;height:${h}px;background:linear-gradient(135deg,#ff8a3d,#ff4d2e);` +
      `display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif">` +
      foreground.replace(/<svg([^>]*?)\swidth="\d+"\sheight="\d+"/, '<svg$1').replace('<svg ', `<svg width="${art}" height="${art}" `) +
      `<div style="color:#fff;font-weight:900;font-size:${font}px;letter-spacing:-1px;margin-top:${Math.round(font * -0.2)}px">Shoo</div>` +
      '</body>',
  );
  await page.screenshot({ path: `${root}${path}` });
}

console.log(`wrote ${jobs.length + 1} icons and ${splashes.length} splash screens`);
await browser.close();
