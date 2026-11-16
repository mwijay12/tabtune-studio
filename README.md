# TabTune Studio

Capture tab audio, transcribe it with Gemini into synced `.lrc` lyrics, and export a tidy studio bundle. A Manifest V3 extension for musicians, lyricists and producers, built for Kiswahili, Sheng and English.

Two things live in this repository:

| | |
| --- | --- |
| **the extension** | the files at the root — `popup.html`, `sidepanel.html`, `popup.js`, `offscreen.js`, `background.js`, `lib/`, `icons/` |
| **the website** | everything under `site/` — landing, coming-soon and shop pages, built from one content file |

---

## The extension

1. **Record tab audio** — lossless WAV (PCM 16-bit) or WebM/Opus up to 320 kbps, without muting playback.
2. **Countdown before capture** — 0, 3, 5 or 10 seconds, so the take starts at bar one.
3. **Take memory** — finished takes are written to IndexedDB (ten of them) and survive a closed popup and a browser restart.
4. **Side panel mode** — dock the studio so a stray click cannot dismiss it mid-take.
5. **Gemini transcription** — tuned for Swahili, English, Sheng and code-switched verses, output as `[mm:ss.xx]` timestamps.
6. **LRCLIB search** — fetch existing synced lyrics when someone has already done the work.
7. **Studio player** — a scrubber, three-second jumps, volume, all on the keyboard.
8. **Karaoke view and a one-key stamper** — lines light up as the take plays; `Ctrl + T` stamps the exact time on the line under your cursor.
9. **Multi-key failover pool** — keys live only in your browser, and the pool rotates when one is rate limited.
10. **Export** — a `.zip` with audio, `.lrc`, plain text and an info sheet, or the parts on their own.

### Install

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin TabTune Studio to the toolbar.

Works on Chrome, Edge, Brave and Opera, version 116 or newer.

### Gemini keys

Paste one key per line into the gear menu, or copy `config.example.js` to `config.js` (gitignored) and reload once — the keys import themselves into `chrome.storage.local`.

No key ships in the repository, and nothing you paste is ever written into the source, so `git push` cannot leak one. When a key returns 429 or 503 the pool rotates to the next and carries on.

Recording, editing, karaoke and export all work without a key. It is only needed to transcribe and for the songwriting helpers.

### Shortcuts

| Keys | Action |
| --- | --- |
| `Alt + Shift + R` | Start or stop recording, from any tab |
| `Space` | Play or pause the preview |
| `Ctrl + T` | Stamp the current time on the line under the cursor |
| `Ctrl + [` | Back three seconds |
| `Ctrl + ]` | Forward three seconds |
| `Ctrl + Shift + T` | Transcribe with Gemini |
| `Ctrl + Shift + L` | Search LRCLIB |
| `Ctrl + S` | Export the studio `.zip` |
| `Ctrl + E` | Export the `.lrc` only |

### Interface notes

Every drawing in the interface is an inline SVG: the mark, all the button glyphs, the countdown ring, the empty-state doodle and the contour field behind the glass. There is no emoji, no icon font and no image request. The glyphs are defined once in `lib/icons.js` as a `<symbol>` sprite and referenced with `<use href="#tt-name">`.

The header's sun/moon button switches between a night and a day theme. The choice is remembered in `chrome.storage.local`; with nothing saved, it follows the operating system.

### Files

| File | Job |
| --- | --- |
| `manifest.json` | Manifest V3 configuration, permissions, side panel, shortcut command |
| `background.js` | Service worker: offscreen lifecycle, downloads, side panel, global shortcut |
| `offscreen.html` / `offscreen.js` | Offscreen audio engine: tab capture, AudioContext passthrough, level analysis, WAV encoder, JSZip |
| `popup.html` / `sidepanel.html` | The studio interface; the side panel is the same page, docked |
| `popup.css` | Tokens for both themes, glass panels, karaoke glow, countdown ring |
| `popup.js` | Countdown engine, take memory, key pool, player, LRC parser, LRCLIB client, shortcuts |
| `lib/icons.js` | The one SVG sprite every icon is drawn from |
| `lib/store.js` | Shared IndexedDB wrapper for take memory |
| `lib/jszip.min.js` | Local JSZip, for packaging inside MV3 |
| `config.example.js` | Template for a local, gitignored `config.js` |

---

## The website

`site/` holds three pages — a landing page, a coming-soon page and a shop — plus a favicon, a share card and a hand-drawn sticker set, all SVG.

```bash
cd site
npm install
npm run build      # writes dist/ and prints what a human still has to decide
npm run dev        # build, then serve dist/ on http://0.0.0.0:4173
```

There is no framework and no bundler. Plain HTML pages with shared partials, one content file for every fact that changes, and four small ES modules.

The rules it keeps:

- **Every fact lives in `content/site.json`** and is injected at build time. A name that does not exist fails the build, so a typo cannot ship.
- **Two themes plus a mix mode** where each section shows the theme it was written for. `?theme=dark`, `?theme=light`, `?theme=mix`.
- **Fonts and pictures are self-hosted.** No CDN link, no stock photograph, no third-party request.
- **Animate transform and opacity only.** Nothing animates a layout property.
- **Everything works with `prefers-reduced-motion` on, without WebGL, and at 390 px wide.** With reduced motion, no reveals, no drift, no drawing: the content is simply there.
- **The HTML holds the finished text and the finished drawing.** Effects start from that and return to it.
- **Stickers never sit on words.** Each one switches itself off at the width where its space runs out.

`npm run build` ends by listing every value that is still a placeholder — the WhatsApp number, the email and the shop prices — so nobody has to guess what is real.

### Files

| Path | Job |
| --- | --- |
| `site/content/site.json` | Every fact on every page |
| `site/build.mjs` | Injects the content, concatenates the CSS, rasterises the icons — fails on a missing name |
| `site/src/pages/` | The three pages plus `404.html` |
| `site/src/partials/` | Shared head, header, footer, icon sprite, the contour field, the studio mock |
| `site/src/partials/art/` | The sticker drawings, as SVG paths |
| `site/src/styles/` | Tokens, base, chrome, stickers, mock, home, soon, shop |
| `site/src/lib/` | Theme, scroll-driven motion, stickers, menu — plain ES modules |
| `site/tools/` | The contour generator, the studio mock generator, the raster step, a static server |
| `site/public/fonts/` | Fraunces, Inter and JetBrains Mono, Latin subset, self-hosted |

### Deploying

`site/vercel.json` builds with `npm run build` and serves `dist/`. Any static host does the same thing: run the build, publish `dist/`.

---

## Licence

Proprietary to Altraware Technologies. See `LICENSE`.
