// Copies the screenshot reader (Tesseract, all on-device) into public/ocr so
// it ships with the site and the apps. Nothing gets uploaded anywhere.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'ocr');
mkdirSync(out, { recursive: true });

const tesseract = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

copyFileSync(join(tesseract, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
// Only the LSTM engine builds are used; the browser picks the fastest it supports.
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(join(core, name), join(out, name));
}
copyFileSync(join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'eng.traineddata.gz'));
