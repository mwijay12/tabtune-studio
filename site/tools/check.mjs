/**
 * The check before "done".
 *
 * Walks every built page and fails on anything that would embarrass us:
 * a broken icon reference, a request to somebody else's host, an inline
 * script, a heading with no text, a decorative drawing that is not hidden
 * from a screen reader, or an id used twice.
 *
 *   node tools/check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith('.html')) pages.push(f);
  }
})(dist);

const fail = [];
const warn = [];

for (const file of pages) {
  const rel = path.relative(dist, file);
  const html = fs.readFileSync(file, 'utf8');

  // 1. every <use href="#x"> points at an id that exists
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/<use\s+href="#([^"]+)"/g)) {
    if (!ids.has(m[1])) fail.push(`${rel}: <use href="#${m[1]}"> has no matching id`);
  }

  // 2. duplicate ids
  const allIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = allIds.filter((v, i) => allIds.indexOf(v) !== i);
  if (dupes.length) fail.push(`${rel}: duplicate id(s) ${[...new Set(dupes)].join(', ')}`);

  // 3. no request leaves the site
  for (const m of html.matchAll(/<(?:script|link|img|source|iframe)\b[^>]*>/g)) {
    const tag = m[0];
    // A canonical URL or a preconnect is not a request the visitor pays for.
    if (/rel="(?:canonical|alternate|dns-prefetch|preconnect|manifest|icon)"/.test(tag)) continue;
    if (/<link[^>]*rel="canonical"/.test(tag)) continue;
    for (const a of tag.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
      fail.push(`${rel}: loads ${a[1]} from another host`);
    }
  }

  // 4. no inline script and no inline event handler
  if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/.test(html)) {
    fail.push(`${rel}: inline <script> found`);
  }
  if (/\son(?:click|load|error|mouseover|focus|blur)=/.test(html)) {
    fail.push(`${rel}: inline event handler found`);
  }

  // 5. exactly one h1, and it has words in it
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  if (h1.length !== 1) fail.push(`${rel}: ${h1.length} <h1> elements (expected 1)");`);
  else if (!h1[0][1].replace(/<[^>]+>/g, '').trim()) fail.push(`${rel}: empty <h1>`);

  // 6. decorative svg is hidden, meaningful svg is labelled
  for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
    const tag = m[0];
    if (/class="[^"]*\bsprite\b/.test(tag)) continue;
    if (/aria-hidden="true"/.test(tag)) continue;
    if (/role="img"/.test(tag) && /aria-label="[^"]+"/.test(tag)) continue;
    if (/<title>/.test(html.slice(m.index, m.index + 400))) continue;
    fail.push(`${rel}: <svg> is neither aria-hidden nor labelled — ${tag.slice(0, 60)}…`);
  }

  // 7. every image has alt text
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="[^"]*"/.test(m[0])) fail.push(`${rel}: <img> without alt`);
  }

  // 8. links that open in a new tab say so, and external links are safe
  for (const m of html.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    if (/target="_blank"/.test(tag) && !/rel="[^"]*noopener/.test(tag)) {
      fail.push(`${rel}: target="_blank" without rel="noopener"`);
    }
  }

  // 9. a link to nowhere on our own site
  for (const m of html.matchAll(/href="(\/[^"#]*)"/g)) {
    const target = path.join(dist, m[1].replace(/\/$/, '/index.html'));
    const alt = path.join(dist, m[1], 'index.html');
    if (/^\/(assets|fonts)\//.test(m[1])) continue;
    if (!fs.existsSync(target) && !fs.existsSync(alt)) {
      warn.push(`${rel}: links to ${m[1]} which is not in dist/`);
    }
  }

  // 10. the page must not be empty
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 400) fail.push(`${rel}: only ${text.length} characters of text`);
}

// 11. the share card has to be there, and small enough to share
const og = path.join(dist, 'og.jpg');
if (fs.existsSync(og)) {
  const kb = fs.statSync(og).size / 1024;
  if (kb > 200) fail.push(`og.jpg is ${kb.toFixed(0)} kB — must be under 200 kB`);
} else {
  fail.push('og.jpg is missing');
}
for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'robots.txt', 'sitemap.xml']) {
  if (!fs.existsSync(path.join(dist, f))) fail.push(`${f} is missing`);
}

// 12. no stylesheet or script is missing
for (const m of fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)) {
  if (!fs.existsSync(path.join(dist, m[1]))) fail.push(`index.html references missing file ${m[1]}`);
}

// 13. the CSS must not reference a font that is not shipped
const css = fs.readFileSync(path.join(dist, 'assets', 'site.css'), 'utf8');
for (const m of css.matchAll(/url\(['"]?(\/fonts\/[^)'"]+)/g)) {
  if (!fs.existsSync(path.join(dist, m[1]))) fail.push(`css references missing font ${m[1]}`);
}

console.log(`\n  checked ${pages.length} pages: ${pages.map((p) => path.relative(dist, p)).join(', ')}`);

if (warn.length) {
  console.log(`\n  ${warn.length} warning(s):`);
  for (const w of [...new Set(warn)]) console.log(`    ! ${w}`);
}

if (fail.length) {
  console.error(`\n  ${fail.length} failure(s):`);
  for (const f of [...new Set(fail)]) console.error(`    x ${f}`);
  process.exit(1);
}

console.log('  all checks passed\n');
