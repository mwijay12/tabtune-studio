# 🎵 TabTune Studio v1.2 — Audio Capture, Gemini Transcription & Synced Lyrics

A high-performance Manifest V3 browser extension for musicians, lyricists, and producers:
1. **Record Tab Audio** (lossless WAV or high-bitrate WebM Opus) without muting playback.
2. **3-2-1 Countdown** before capture (toggleable) — time to switch to the music tab.
3. **Take Memory 💾** — finished takes auto-save to IndexedDB (up to 10). Close the popup by mistake? Reopen and your song is still there, even after browser restart.
4. **Side Panel mode 📌** — run the full studio as a persistent sidebar that never closes accidentally. Popup header → 📌 button.
5. **Auto-Transcribe with Gemini AI** (tuned for Swahili, English, Sheng, and multilingual songs) into synchronized `.lrc` timestamps (`[mm:ss.xx]`).
6. **Fetch Online Synced Lyrics** instantly via free LRCLIB integration.
7. **Built-in Studio Audio Player** with interactive timeline scrubber and quick jump controls.
8. **Live Karaoke Sync View & Editor** with real-time lyric glow and single-keystroke time stamping (`Ctrl+T`).
9. **Gemini Multi-Key Failover Pool** (keys stored only in YOUR browser — GitHub-safe) that automatically rotates if rate limits occur.
10. **Comprehensive Keyboard Shortcuts** for fast DAW-like workflow.
11. **Export Everything**: Download `.zip` bundles, `.lrc` synced lyrics, or isolated audio files.

---

## 🚀 Quick Install (Chrome / Edge / Brave / Opera)

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the directory: `Desktop\TabTune-Studio`
5. Pin the extension to your browser toolbar (puzzle icon 🧩 → pin **TabTune Studio**)

---

## 🔑 Gemini API Keys Pool & Failover (GitHub-safe 🔒)

TabTune Studio features an automatic key rotation engine.
- Supports both new **`AQ.Ab...` Auth keys** and **`AIza...` Standard keys**.
- **Zero keys ship in the repo.** Keys live ONLY in `chrome.storage.local` (your browser). Pushing to GitHub can never leak them.
- If a key experiences a rate limit (429) or temporary demand spike (503), the extension silently switches to the next healthy key in the pool with zero interruption.
- Click **⚙** in the header to view pool health, add custom keys, or run a live responsiveness test across all keys.

**First-time setup (2 options):**
- **Option A (recommended):** open the extension → **⚙ Settings** → paste keys (one per line) → **Save Configuration**.
- **Option B (bulk import):** `copy config.example.js config.js` (Windows) or `cp config.example.js config.js` (Mac/Linux), paste keys into `LOCAL_GEMINI_KEYS`, reload the extension once — keys auto-import into browser storage. `config.js` is gitignored, so it never gets pushed.

> ⚠️ If you previously had keys hardcoded in `popup.js`, revoke/rotate them in Google AI Studio — git history may still remember them. This version removed all hardcoded keys.

---

## 🎙 How to Record & Sync Lyrics

1. Open any tab playing audio (YouTube, SoundCloud, Spotify Web, Beatstars, local player, etc.).
2. Click the **TabTune Studio** icon.
3. Choose format:
   - **WebM / Opus (320 kbps)** — Highest fidelity streaming format, small file size.
   - **WAV (PCM 16-bit Lossless)** — Universal DAW format (FL Studio, Ableton, Logic).
4. Click **Start Recording** (or press `Alt + Shift + R`).
   - A **3-2-1-GO countdown** gives you time to switch to the music tab (uncheck `⏳ 3-2-1 countdown` to start instantly, or click the button mid-countdown to cancel).
   - The tab audio is routed through an AudioContext so your speakers stay unmuted!
   - You can close the popup or switch tabs — a red **REC** badge remains on the extension icon. **Tip:** use the 📌 button to open the persistent **Side Panel** so the studio never closes by mistake.
   - Closing the popup mid-recording shows a warning; your audio is safe either way.
5. When done, click **Stop & Finish Recording** (or press `Alt + Shift + R`).
6. The **Studio Audio Player** appears immediately, and the take is **auto-saved to Take Memory 💾** (IndexedDB, up to 10 takes — survives popup close + browser restart):
   - Reopen the extension any time → your last take auto-restores with a green `Recovered` banner.
   - Scroll the **Take Memory** list in the recorder card to **Load** older takes or **✕** delete them.
   - Click **▶ Play** (or press `Space`) to listen to your take.
   - Click **🤖 Transcribe Audio (Gemini)** to generate timestamped `.lrc` lyrics.
   - Or click **🔍 Fetch Online (LRCLIB)** to search existing synced lyrics.
7. Switch to the **Karaoke Sync** tab to see your lyrics illuminate and scroll in real time with the audio!

---

## ⌨️ Studio Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + Shift + R` | Global toggle: Start or Stop Tab Audio Recording |
| `Space` | Play / Pause audio preview (when not typing in text areas) |
| `Ctrl + T` | **Stamp current audio timestamp** `[mm:ss.xx]` at the cursor line |
| `Ctrl + [` | Jump back 3 seconds |
| `Ctrl + ]` | Jump forward 3 seconds |
| `Ctrl + Shift + T` | Trigger Gemini Multilingual Audio Transcription |
| `Ctrl + Shift + L` | Trigger LRCLIB Synced Lyrics search |
| `Ctrl + S` | Export full Studio `.zip` bundle |
| `Ctrl + E` | Quick export `.lrc` file only |

> **Pro Tip:** Click the **⤢** icon in the header to open TabTune Studio as a full widescreen browser tab for an expansive lyric editing environment!

---

## 📦 Export Bundle Contents

Clicking **Export Studio ZIP** creates a tidy `.zip` containing:
```
SongTitle.zip
├── audio.wav (or audio.webm)   # Pristine captured tab audio
├── lyrics.lrc                  # Synchronized LRC lyrics with [mm:ss.xx] timestamps
├── lyrics.txt                  # Clean plain-text lyrics
└── info.txt                    # Track metadata, duration, bitrate, and capture timestamp
```

---

## 🛠 File Architecture

| File | Function |
|---|---|
| `manifest.json` | Manifest V3 configuration, permissions, side panel, shortcuts command |
| `background.js` | Service worker managing offscreen recorder lifecycle, downloads, side panel, and global shortcut |
| `offscreen.html` / `offscreen.js` | Offscreen audio engine: `getUserMedia` tab capture, AudioContext passthrough, live frequency analysis, WAV encoder, JSZip engine |
| `popup.html` / `sidepanel.html` | Liquid glass studio interface, audio player, LRC editor, take memory, countdown overlay (sidepanel = persistent sidebar twin) |
| `popup.css` | Glassmorphism design system, karaoke glow animations, countdown + take-memory styles, responsive/sidebar layout |
| `popup.js` | Countdown engine, take-memory (IndexedDB), sidebar opener, Gemini key rotation pool, audio player, LRC parser, LRCLIB API client, shortcuts |
| `lib/store.js` | Shared IndexedDB wrapper: persistent take storage for popup + sidepanel + offscreen |
| `config.example.js` | Template for local bulk key import (`config.js` is gitignored — never committed) |
| `lib/jszip.min.js` | Local JSZip library for MV3-compliant in-browser packaging |
