/**
 * Raster step: the share card and the icons, drawn from SVG.
 *
 * The card is generated rather than screenshot, so it cannot go stale, and it
 * carries no font from a CDN: the woff2 files we already ship are unpacked to
 * TTF in .cache/ and handed to resvg.
 *
 * Everything here is optional. If resvg or ImageMagick is missing, the build
 * keeps the SVG favicon and says so.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildContour } from './contour.mjs';

const GOLD = '#eab308';
const VIOLET = '#5b21b6';
const NAVY = '#071022';
const INK = '#eaf0ff';
const SOFT = '#a9b8d6';

function hasMagick() {
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** woff2 -> ttf, cached, because resvg cannot read woff2. */
async function ttf(woff2Path, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, path.basename(woff2Path).replace(/\.woff2$/, '.ttf'));
  if (fs.existsSync(dest)) return dest;
  const { decompress } = await import('wawoff2');
  const buf = await decompress(fs.readFileSync(woff2Path));
  fs.writeFileSync(dest, buf);
  return dest;
}

/* ------------------------------------------------------------------ *
 * The favicon: three bars on navy. Readable at 16 px.
 * ------------------------------------------------------------------ */
export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="TabTune Studio">
  <rect width="32" height="32" rx="8" fill="${NAVY}"/>
  <rect x="8" y="13" width="3.2" height="6" rx="1.6" fill="${GOLD}"/>
  <rect x="14.4" y="9" width="3.2" height="14" rx="1.6" fill="#f4d774"/>
  <rect x="20.8" y="11" width="3.2" height="10" rx="1.6" fill="${GOLD}"/>
</svg>
`;
}

/** Touch icon: full bleed, bigger bars — iOS adds the rounding. */
function touchSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img" aria-label="TabTune Studio">
  <rect width="180" height="180" fill="${NAVY}"/>
  <rect x="42" y="72" width="18" height="36" rx="9" fill="${GOLD}"/>
  <rect x="81" y="48" width="18" height="84" rx="9" fill="#f4d774"/>
  <rect x="120" y="60" width="18" height="60" rx="9" fill="${GOLD}"/>
</svg>
`;
}

/* ------------------------------------------------------------------ *
 * The share card, 1200x630
 * ------------------------------------------------------------------ */
function ogSvg(content) {
  const contour = buildContour()
    .replace(/class="c-gold[^"]*"/g, `stroke="${GOLD}" stroke-opacity="0.5"`)
    .replace(/class="c-violet[^"]*"/g, `stroke="${VIOLET}" stroke-opacity="0.55"`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="right"><rect x="560" y="-200" width="760" height="1030"/></clipPath>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${NAVY}" stop-opacity="1"/>
      <stop offset="0.32" stop-color="${NAVY}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="${NAVY}"/>

  <g clip-path="url(#right)" fill="none" stroke-width="1.1">
    <g transform="translate(120 -60) scale(0.92)">${contour}</g>
  </g>
  <rect x="560" y="0" width="200" height="630" fill="url(#fade)" transform="translate(-200 0)"/>

  <g transform="translate(80 86)">
    <rect width="92" height="92" rx="26" fill="#0b1233"/>
    <rect x="23" y="37" width="9.5" height="18" rx="4.75" fill="${GOLD}"/>
    <rect x="41.5" y="25" width="9.5" height="42" rx="4.75" fill="#f4d774"/>
    <rect x="60" y="31" width="9.5" height="30" rx="4.75" fill="${GOLD}"/>
  </g>

  <text x="80" y="270" font-family="Fraunces" font-size="26" font-weight="600" letter-spacing="5.2" fill="${GOLD}">${content.site.ogKicker}</text>
  <text x="80" y="360" font-family="Fraunces" font-size="82" font-weight="640" fill="${INK}">${content.site.name}</text>
  <text x="80" y="432" font-family="Inter" font-size="35" font-weight="500" fill="${SOFT}">${content.site.ogLine}</text>

  <g transform="translate(80 500)">
    <rect width="300" height="2" rx="1" fill="${GOLD}" opacity="0.7"/>
  </g>
  <text x="80" y="556" font-family="JetBrains" font-size="21" font-weight="500" letter-spacing="1.6" fill="#7a8db4">${content.site.author} · ${content.site.madeIn}</text>
</svg>
`;
}

/* ------------------------------------------------------------------ *
 * Extension icons, from the same mark
 * ------------------------------------------------------------------ */
function extIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b1233"/><stop offset="1" stop-color="${NAVY}"/>
  </linearGradient></defs>
  <rect width="128" height="128" rx="30" fill="url(#g)"/>
  <rect x="30" y="52" width="12" height="24" rx="6" fill="${GOLD}"/>
  <rect x="58" y="36" width="12" height="56" rx="6" fill="#f4d774"/>
  <rect x="86" y="44" width="12" height="40" rx="6" fill="${GOLD}"/>
</svg>
`;
}

/* ------------------------------------------------------------------ */

export async function writeIcons(root, content) {
  const { Resvg } = await import('@resvg/resvg-js');
  const dist = path.join(root, 'dist');
  const fontsDir = path.join(root, 'public', 'fonts');
  const cache = path.join(root, '.cache');

  const fontFiles = await Promise.all([
    ttf(path.join(fontsDir, 'fraunces-latin-wght-normal.woff2'), cache),
    ttf(path.join(fontsDir, 'inter-latin-wght-normal.woff2'), cache),
    ttf(path.join(fontsDir, 'jetbrains-mono-latin-wght-normal.woff2'), cache)
  ]);

  const font = { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Fraunces' };
  const render = (svg, w) =>
    new Resvg(svg, { font, fitTo: { mode: 'width', value: w } }).render().asPng();

  // SVG favicon — no raster needed, browsers take it directly.
  fs.writeFileSync(path.join(dist, 'favicon.svg'), faviconSvg());

  // PNG fallbacks
  fs.writeFileSync(path.join(dist, 'favicon-32.png'), render(faviconSvg(), 32));
  fs.writeFileSync(path.join(dist, 'apple-touch-icon.png'), render(touchSvg(), 180));

  // Share card
  const ogPng = path.join(cache, 'og.png');
  fs.writeFileSync(ogPng, render(ogSvg(content), 1200));
  const ogJpg = path.join(dist, 'og.jpg');
  if (hasMagick()) {
    execFileSync('convert', [ogPng, '-quality', '84', '-strip', ogJpg]);
  } else {
    fs.copyFileSync(ogPng, path.join(dist, 'og.png'));
    throw new Error('ImageMagick missing, wrote og.png instead');
  }

  // Extension icons (chrome-extension needs raster in the manifest)
  const iconsDir = path.join(root, '..', 'icons');
  if (fs.existsSync(iconsDir)) {
    fs.writeFileSync(path.join(iconsDir, 'icon.svg'), extIconSvg());
    for (const size of [16, 32, 48, 128]) {
      fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), render(extIconSvg(), size));
    }
  }

  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(1) + ' kB';
  console.log(`  og.jpg   ${kb(ogJpg)}`);
  if (fs.existsSync(path.join(dist, 'og.jpg')) && fs.statSync(ogJpg).size > 200 * 1024) {
    console.warn('  warning: og.jpg is over 200 kB');
  }
}
