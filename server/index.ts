import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8787;

if (!process.env.APP_PASSCODE) console.warn('APP_PASSCODE is not set: the API is open to anyone.');
if (!process.env.GOOGLE_MAPS_API_KEY) console.warn('GOOGLE_MAPS_API_KEY is not set: using free routing without live traffic.');

createApp({ env: process.env, staticDir: path.join(root, 'dist') }).listen(port, () => {
  console.log(`Shoo server on http://localhost:${port}`);
});
