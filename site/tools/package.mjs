/**
 * Packs the extension into dist/download/ so the site can hand it over.
 *
 * Chrome stopped letting a website install an extension, so what we ship
 * is the thing you load yourself: a plain folder in a zip. The visitor
 * unzips it, opens chrome://extensions, and drops the folder on the page.
 *
 * The same zip is what gets uploaded to the Chrome Web Store later, so it
 * has to be exactly the extension and nothing else: no config.js with
 * somebody's API keys in it, no site, no git.
 *
 * No dependencies — the zip is written by hand so this runs on Vercel.
 *
 *   node tools/package.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const FOLDER = 'tabtune-studio';

/** DOS date/time, so two builds of the same source make the same bytes. */
const STAMP = { y: 2026, m: 1, d: 1, h: 0, min: 0, s: 0 };
const dosTime = (t) => (t.h << 11) | (t.min << 5) | (t.s >> 1);
const dosDate = (t) => ((t.y - 1980) << 9) | (t.m << 5) | t.d;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** PNGs and friends are already compressed; deflating them just burns time. */
const ALREADY_PACKED = /\.(png|jpg|jpeg|woff2?|zip|gz|br)$/i;

function entry(name, data) {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const store = ALREADY_PACKED.test(name);
  const body = store ? raw : zlib.deflateRawSync(raw, { level: 9 });
  return {
    name,
    method: store ? 0 : 8,
    crc: crc32(raw),
    size: raw.length,
    csize: body.length,
    body,
    offset: 0,
  };
}

function writeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); // local file header
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0, 6); // flags
    head.writeUInt16LE(e.method, 8);
    head.writeUInt16LE(dosTime(STAMP), 10);
    head.writeUInt16LE(dosDate(STAMP), 12);
    head.writeUInt32LE(e.crc, 14);
    head.writeUInt32LE(e.csize, 18);
    head.writeUInt32LE(e.size, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28); // extra

    e.offset = offset;
    chunks.push(head, name, e.body);
    offset += head.length + name.length + e.body.length;

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(e.method, 10);
    cd.writeUInt16LE(dosTime(STAMP), 12);
    cd.writeUInt16LE(dosDate(STAMP), 14);
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.csize, 20);
    cd.writeUInt32LE(e.size, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(e.offset, 42);
    central.push(Buffer.concat([cd, name]));
  }

  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, dir, end]);
}

/**
 * Everything the extension needs, worked out from the manifest and then
 * from what those files themselves point at — so a new script cannot be
 * quietly left out of the download.
 */
function collect(repoRoot) {
  const manifestPath = path.join(repoRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest.json at ${repoRoot}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const seeds = ['manifest.json'];
  for (const iconSet of [manifest.icons, manifest.action?.default_icon]) {
    for (const f of Object.values(iconSet || {})) seeds.push(f);
  }
  for (const f of [manifest.action?.default_popup, manifest.side_panel?.default_path, manifest.background?.service_worker]) {
    if (f) seeds.push(f);
  }

  // Extra files the code itself loads. Only code is walked: a name like
  // "lyrics.txt" in popup.js is a file the export writes inside the user's
  // zip at runtime, not something the extension ships — and it does not
  // exist on disk, so the existsSync guard below drops it anyway.
  const found = new Set();
  const queue = [...seeds];
  const CODE = /['"(]([A-Za-z0-9_./-]+\.(?:js|mjs|css|html))['")]/g;
  const ASSET = /['"(]([A-Za-z0-9_./-]+\.(?:png|svg|json|txt|md|woff2?))['")]/g;

  while (queue.length) {
    const rel = queue.shift().replace(/^\.?\//, '');
    if (found.has(rel)) continue;
    found.add(rel);

    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue; // reported by verify() below
    if (!/\.(html|js|mjs|css)$/i.test(rel)) continue;

    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(CODE)) {
      const ref = m[1].replace(/^\.?\//, '');
      if (ref.startsWith('http')) continue;
      if (!found.has(ref)) queue.push(ref);
    }
    for (const m of src.matchAll(ASSET)) {
      const ref = m[1].replace(/^\.?\//, '');
      if (ref.startsWith('http')) continue;
      if (fs.existsSync(path.join(repoRoot, ref))) found.add(ref);
    }
  }

  // Files that travel with the extension but are not referenced by it.
  for (const extra of ['README.md', 'LICENSE']) {
    if (fs.existsSync(path.join(repoRoot, extra))) found.add(extra);
  }

  // Never ship somebody's keys.
  for (const banned of ['config.js', 'config.example.js']) found.delete(banned);

  return { manifest, files: [...found].sort() };
}

function installTxt(manifest, host, files) {
  return `${manifest.name} — v${manifest.version}
${'='.repeat(manifest.name.length + 6 + manifest.version.length)}

Install it in Chrome, Edge, Brave or Opera (Chromium 116 or newer).

1. Unzip this file. You get one folder, "${FOLDER}".
   Keep the folder where it lands — Chrome reads it from there every time
   it starts. If you delete the folder, the extension stops working.

2. Open a new tab and go to:  chrome://extensions

3. Turn on "Developer mode" — the switch in the top right corner.

4. Drag the "${FOLDER}" folder onto that page and let go.
   Chrome installs it immediately. No dialog, no "Load unpacked" click.

5. Click the puzzle piece in the toolbar and pin TabTune Studio.

Optional — transcription needs a Gemini API key:
  - Make one free at https://aistudio.google.com/apikey
  - Open the extension, click the gear icon, paste one key per line, save.
  - Recording, editing, karaoke and export all work without a key.

Press Alt+Shift+R in any tab to start and stop a take.

Built from ${host}
${files.length} files.

Full notes: https://github.com/mwijay12/tabtune-studio
`;
}

/**
 * Writes dist/download/tabtune-studio.zip and a versioned copy beside it.
 * Returns what the build needs to report.
 */
export async function writePackage(siteRoot, content) {
  const repoRoot = path.resolve(siteRoot, '..');
  const { manifest, files } = collect(repoRoot);

  const missing = files.filter((f) => !fs.existsSync(path.join(repoRoot, f)));
  if (missing.length) {
    throw new Error(`the extension is missing ${missing.join(', ')}`);
  }

  const version = manifest.version;
  if (content?.site?.version && content.site.version !== version) {
    throw new Error(
      `manifest.json says v${version} but site.json says v${content.site.version}`
    );
  }

  const entries = files.map((f) =>
    entry(`${FOLDER}/${f}`, fs.readFileSync(path.join(repoRoot, f)))
  );
  entries.push(
    entry(`${FOLDER}/INSTALL.txt`, installTxt(manifest, content?.site?.url || '', files))
  );

  const zip = writeZip(entries);
  const outDir = path.join(siteRoot, 'dist', 'download');
  fs.mkdirSync(outDir, { recursive: true });

  const stable = path.join(outDir, `${FOLDER}.zip`);
  const versioned = path.join(outDir, `${FOLDER}-${version}.zip`);
  fs.writeFileSync(stable, zip);
  fs.writeFileSync(versioned, zip);

  return { version, files: entries.length, bytes: zip.length, stable, versioned };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const info = await writePackage(siteRoot, null);
  console.log(
    `\n  packed  dist/download/tabtune-studio.zip — v${info.version}, ` +
      `${info.files} files, ${(info.bytes / 1024).toFixed(1)} kB\n`
  );
}
