#!/usr/bin/env node
/**
 * TabTune Studio — site build.
 *
 * Every fact lives in content/site.json and is injected here, at build time.
 * A name that does not exist fails the build, so a typo can never ship.
 *
 *   node build.mjs            build into dist/
 *   node build.mjs --strict   also fail on placeholder values
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contourSvg } from './tools/contour.mjs';
import { appMock } from './tools/appmock.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => path.join(root, 'src', ...p);
const out = (...p) => path.join(root, 'dist', ...p);
const read = (f) => fs.readFileSync(f, 'utf8');
const STRICT = process.argv.includes('--strict');

const problems = [];
const notes = [];

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */
const content = JSON.parse(read(path.join(root, 'content', 'site.json')));

const PAGES = ['index', 'shop', 'coming-soon', '404'];

/* ------------------------------------------------------------------ *
 * Tiny template engine
 *
 *   {{path.to.value}}   scalar — fails the build if missing
 *   {{#path}}…{{/path}} loop over an array
 *   {{?path}}…{{/path}} block when truthy
 *   {{^path}}…{{/path}} block when falsy
 *   {{> partial}}       include from src/partials
 *
 * Inside a loop the item's own fields are in scope, plus:
 *   {{this}}        the value itself, for arrays of strings
 *   {{../field}}    a field from the parent scope
 *   {{revealDelay}} 0, 70, 140… for staggering reveals
 * ------------------------------------------------------------------ */

const generators = {
  contour: () => contourSvg(),
  appmock: () => appMock(),
  mark: () => read(src('partials', 'mark.svg')).trim()
};

function get(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function esc(v) {
  return String(v).replace(/&(?![a-z#]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveTokens(str, ctx) {
  return str.replace(/\{\{([^}]+)\}\}/g, (_, raw) => String(get(ctx, raw) ?? ''));
}

function loadInclude(name, ctx, where, depth) {
  if (generators[name]) return generators[name]();
  const parts = name.split('/');
  const htmlFile = src('partials', ...parts) + '.html';
  const svgFile = src('partials', ...parts) + '.svg';
  if (fs.existsSync(htmlFile)) {
    if (depth > 8) {
      problems.push(`${where}: include "${name}" is nested too deep`);
      return '';
    }
    return render(read(htmlFile), ctx, name, depth + 1);
  }
  if (fs.existsSync(svgFile)) return read(svgFile).trim();
  problems.push(`${where}: include "${name}" does not exist`);
  return '';
}

/** Expand {{> name}}, where name may itself contain tokens. */
function expandIncludes(s, ctx, where, depth) {
  const OPEN = '{{>';
  let i = s.indexOf(OPEN);
  while (i !== -1) {
    let d = 1;
    let j = i + OPEN.length;
    while (j < s.length) {
      if (s.startsWith('{{', j)) { d++; j += 2; continue; }
      if (s.startsWith('}}', j)) { d--; j += 2; if (d === 0) break; continue; }
      j++;
    }
    if (d !== 0) break; // unbalanced — leave it for the scalar pass to report
    const name = resolveTokens(s.slice(i + OPEN.length, j - 2), ctx).trim();
    const rep = loadInclude(name, ctx, where, depth);
    s = s.slice(0, i) + rep + s.slice(j);
    i = s.indexOf(OPEN, i + rep.length);
  }
  return s;
}

function render(tpl, ctx, where, depth = 0) {
  let s = tpl;

  // 1. loops first: a body may name an include with one of its own fields
  //    ({{> art/sticker-{{art}}}}), and it must see them.
  s = s.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
    const list = get(ctx, key);
    if (Array.isArray(list)) {
      return list
        .map((item, i) => {
          const scope =
            item && typeof item === 'object'
              ? { ...ctx, ...item, '@parent': ctx, revealDelay: i * 70 }
              : { ...ctx, this: item, '@parent': ctx, revealDelay: i * 70 };
          return render(body, scope, where, depth + 1);
        })
        .join('');
    }
    if (list && typeof list === 'object') {
      return render(body, { ...ctx, ...list, '@parent': ctx, revealDelay: 0 }, where, depth + 1);
    }
    if (list) return render(body, { ...ctx, '@parent': ctx, revealDelay: 0 }, where, depth + 1);
    return '';
  });

  // 2. includes
  s = expandIncludes(s, ctx, where, depth);

  // 3. truthy / falsy blocks
  s = s.replace(/\{\{\?([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    get(ctx, key) ? render(body, ctx, where, depth + 1) : ''
  );
  s = s.replace(/\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    get(ctx, key) ? '' : render(body, ctx, where, depth + 1)
  );

  // 4. scalars — a missing name is a failure, not an empty string
  s = s.replace(/\{\{([\w.$@/-]+)\}\}/g, (_, raw) => {
    const key = raw.startsWith('../') ? raw.slice(3) : raw;
    const scope = raw.startsWith('../') ? ctx['@parent'] || ctx : ctx;
    const v = key === 'this' ? scope.this : get(scope, key);
    if (v === undefined || v === null) {
      problems.push(`${where}: "{{${raw}}}" is not in content/site.json`);
      return '';
    }
    return esc(v);
  });

  return s;
}

/* ------------------------------------------------------------------ *
 * Placeholder audit — say plainly what a human still has to decide
 * ------------------------------------------------------------------ */
const PLACEHOLDER = /^\+?255\s?0{3}|^0{3}|XXXX|xxx|placeholder|PLACEHOLDER|example\.com|TODO/i;
function auditPlaceholders(node, trail = []) {
  if (typeof node === 'string') {
    if (PLACEHOLDER.test(node)) notes.push(`${trail.join('.')} = "${node}"`);
    return;
  }
  if (Array.isArray(node)) return node.forEach((v, i) => auditPlaceholders(v, [...trail, i]));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) auditPlaceholders(v, [...trail, k]);
  }
}
auditPlaceholders(content);

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */
const STYLE_ORDER = [
  'fonts.css',
  'tokens.css',
  'base.css',
  'chrome.css',
  'stickers.css',
  'mock.css',
  'home.css',
  'soon.css',
  'shop.css'
];

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
fs.rmSync(out(), { recursive: true, force: true });
fs.mkdirSync(out('assets', 'js'), { recursive: true });

// CSS
const css = STYLE_ORDER.map((f) => `/* ---- ${f} ---- */\n${read(src('styles', f))}`).join('\n\n');
fs.writeFileSync(out('assets', 'site.css'), css);

// JS (plain ES modules, no bundler)
for (const f of fs.readdirSync(src('lib'))) {
  if (f.endsWith('.js')) fs.copyFileSync(src('lib', f), out('assets', 'js', f));
}

// static files in public/
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}
copyDir(path.join(root, 'public'), out());

// robots.txt + sitemap.xml, so the URLs come from the content file too
fs.writeFileSync(out('robots.txt'), render(read(path.join(root, 'public', 'robots.txt')), content, 'robots.txt'));

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.w3.org/1999/sitemap">',
  ...PAGES.filter((p) => p !== '404').map((p) => {
    const page = content.pages[p];
    const loc = content.site.url + page.path;
    return `  <url><loc>${loc}</loc><changefreq>weekly</changefreq></url>`;
  }),
  '</urlset>',
  ''
].join('\n');
fs.writeFileSync(out('sitemap.xml'), sitemap);

// pages
for (const id of PAGES) {
  const file = src('pages', `${id}.html`);
  if (!fs.existsSync(file)) {
    problems.push(`page src/pages/${id}.html is missing`);
    continue;
  }
  const pageMeta = content.pages?.[id];
  if (!pageMeta) {
    problems.push(`content/site.json has no pages.${id}`);
    continue;
  }
  const ctx = { ...content, page: { ...pageMeta, id } };
  const html = render(read(file), ctx, `pages/${id}.html`);
  const dest =
    id === '404' ? out('404.html')
    : id === 'index' ? out('index.html')
    : (fs.mkdirSync(out(id), { recursive: true }), out(id, 'index.html'));
  fs.writeFileSync(dest, html);
}

// favicon, share card and touch icon
let raster = null;
try {
  raster = await import('./tools/raster.mjs');
  await raster.writeIcons(root, content);
} catch (err) {
  notes.push(`icons: not rasterised — ${err.message}`);
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */
const built = PAGES.filter((p) => fs.existsSync(src('pages', `${p}.html`))).length;
console.log(`\n  built  dist/ — ${built} pages, ${STYLE_ORDER.length} stylesheets`);

for (const [f, label] of [
  ['assets/site.css', 'css'],
  ['favicon.svg', 'favicon']
]) {
  if (fs.existsSync(out(f))) {
    console.log(`  ${label.padEnd(8)} ${(fs.statSync(out(f)).size / 1024).toFixed(1)} kB`);
  }
}

if (notes.length) {
  console.log(`\n  a human still has to decide:`);
  for (const n of [...new Set(notes)]) console.log(`    - ${n}`);
}

if (problems.length) {
  console.error(`\n  ${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.error(`    x ${p}`);
  process.exit(1);
}

if (STRICT && notes.length) {
  console.error('\n  --strict: placeholder values present');
  process.exit(1);
}

console.log('');
