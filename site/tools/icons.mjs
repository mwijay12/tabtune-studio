/** Regenerate the favicon, the share card and the extension icons. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = JSON.parse(fs.readFileSync(path.join(root, 'content', 'site.json'), 'utf8'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

const { writeIcons } = await import('./raster.mjs');
await writeIcons(root, content);
console.log('  icons and share card written');
