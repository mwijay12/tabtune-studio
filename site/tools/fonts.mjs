/**
 * Pull the self-hosted fonts out of node_modules and into public/fonts.
 * Run once after `npm install`, or again after bumping a font package.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public', 'fonts');

const WANT = [
  ['@fontsource-variable/fraunces', 'fraunces-latin-wght-normal.woff2'],
  ['@fontsource-variable/inter', 'inter-latin-wght-normal.woff2'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2']
];

fs.mkdirSync(dest, { recursive: true });

for (const [pkg, file] of WANT) {
  const from = path.join(root, 'node_modules', pkg, 'files', file);
  if (!fs.existsSync(from)) {
    console.error(`  missing ${pkg} — run npm install first`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(dest, file));
  console.log(`  ${file}  ${(fs.statSync(from).size / 1024).toFixed(0)} kB`);
}
