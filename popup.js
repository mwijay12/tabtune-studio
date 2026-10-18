/**
 * TabTune Studio — popup.js
 * --------------------------
 * Core Studio Logic:
 *  1. Multi-key Gemini API pool with automatic failover rotation.
 *  2. Tab audio capture + lossless/Opus recording.
 *  3. In-popup Studio Audio Player with timeline scrubber & quick seek.
 *  4. Native Gemini Multilingual Audio Transcription with exact .LRC timestamps (Swahili & English tuned).
 *  5. Direct LRCLIB online synced lyrics fetcher.
 *  6. Synced lyrics editor with Karaoke Live Sync & [Ctrl+T] time stamper.
 *  7. Multi-format export (.zip, .lrc, audio).
 *  8. Comprehensive keyboard shortcut suite.
 */

'use strict';

// ---------- Context Detection ----------
// Detect whether we are running inside the persistent side panel
// or the regular popup. NEVER call window.close() in sidepanel context —
// that would shut down the entire side panel, not just a popup.
const IS_SIDEPANEL = location.pathname.endsWith('sidepanel.html');

// ---------- Gemini keys: NEVER hardcode here (GitHub-safe) ----------
// Keys live ONLY in chrome.storage.local (your browser) or in a local
// gitignored `config.js` (LOCAL_GEMINI_KEYS) for first-run import.
// The repo ships with ZERO keys so `git push` can never leak them.
const DEFAULT_KEYS = [];
const Store = () => window.TabTuneStore || null;

// ---------- DOM Elements ----------
const $ = (id) => document.getElementById(id);

const recBtn = $('recBtn'), recLabel = $('recLabel'), cancelBtn = $('cancelBtn');
const viz = $('viz'), timerEl = $('timer'), tabNameEl = $('tabName');
const formatEl = $('format'), bitrateEl = $('bitrate');

// Player elements
const playerCard = $('playerCard'), playerTitle = $('playerTitle'), playerDuration = $('playerDuration');
const audioSeek = $('audioSeek'), btnPlayPause = $('btnPlayPause'), btnSkipBack = $('btnSkipBack'), btnSkipFwd = $('btnSkipFwd');
const volumeSlider = $('volumeSlider'), playerAudio = $('playerAudio');

// Studio / Lyrics elements
const titleEl = $('title'), transcribeLang = $('transcribeLang');
const btnTranscribe = $('btnTranscribe'), btnFetchLrclib = $('btnFetchLrclib');
const tabLrc = $('tabLrc'), tabKaraoke = $('tabKaraoke'), tabPlain = $('tabPlain');
const btnStampTime = $('btnStampTime'), lyricsCount = $('lyricsCount');
const editorWrap = $('editorWrap'), lyricsEl = $('lyrics');
const karaokeWrap = $('karaokeWrap'), karaokeList = $('karaokeList');

// AI Studio elements
const aiOut = $('aiOut'), aiText = $('aiText'), aiOutLabel = $('aiOutLabel');
const aiApply = $('aiApply'), aiCopy = $('aiCopy'), aiClose = $('aiClose');

// Export elements
const btnExportZip = $('btnExportZip'), btnExportLrc = $('btnExportLrc'), btnExportAudio = $('btnExportAudio');

// Drawers & Modals
const expandBtn = $('expandBtn'), shortcutsBtn = $('shortcutsBtn'), settingsBtn = $('settingsBtn');
const sideBtn = $('sideBtn');
const shortcutsModal = $('shortcutsModal'), closeShortcutsBtn = $('closeShortcutsBtn');
const settingsModal = $('settings'), closeSettingsBtn = $('closeSettingsBtn');
const apiKeysArea = $('apiKeysArea'), poolCountBadge = $('poolCountBadge');
const btnTestPool = $('btnTestPool'), poolTestStatus = $('poolTestStatus'), modelEl = $('model'), saveSettings = $('saveSettings');
const sidePanelStatus = $('sidePanelStatus');
let lastSidePanelError = '';

// Countdown + memory elements
const countdownOverlay = $('countdownOverlay'), countdownNum = $('countdownNum'), countdownCancel = $('countdownCancel');
const countdownToggle = $('countdownToggle'), countdownSecs = $('countdownSecs');
const recoverBar = $('recoverBar'), recoverText = $('recoverText'), recoverDismiss = $('recoverDismiss');
const takesList = $('takesList'), takesCount = $('takesCount');

// ---------- Application State ----------
const BARS = 28;
let isRecording = false;
let isCountingDown = false;
let countdownTimers = [];
let timerInterval = null;
let recStartedAt = 0;
let currentAudio = null; // { id?, audioDataUrl, audioBase64, mimeType, ext, durationSec, title }
let currentTakeId = null;
let currentPool = [...DEFAULT_KEYS];
let currentKeyIndex = 0;
let currentMode = 'lrc'; // 'lrc' | 'karaoke' | 'plain'
let parsedLrcLines = []; // [{ time: number, text: string, raw: string }]
let isSeeking = false;

// Build visualizer bars
for (let i = 0; i < BARS; i++) {
  const b = document.createElement('div');
  b.className = 'bar';
  viz.appendChild(b);
}
const barEls = [...viz.querySelectorAll('.bar')];
viz.classList.add('idle');

// ---------- Toast Helper ----------
let toastTimer = null;
function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (type === 'err' ? ' err' : type === 'success' ? ' success' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

// ---------- Time Formatting Helpers ----------
function fmtTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtSec(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

function fmtLrcTimestamp(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`;
}

// ---------- Gemini Multi-Key Pool Engine with Instant Failover ----------
// NOTE: pool comes from chrome.storage.local only. Empty pool = user must
// add keys in ⚙ Settings (stored in browser, never in git).

async function getHealthyKeyPool() {
  const { storedKeys } = await chrome.storage.local.get('storedKeys');
  if (storedKeys && Array.isArray(storedKeys) && storedKeys.length > 0) {
    currentPool = storedKeys.filter(k => k && k.trim().length > 10);
  } else {
    currentPool = [...DEFAULT_KEYS];
  }
  // One-time import from local gitignored config.js (LOCAL_GEMINI_KEYS)
  try {
    if ((!currentPool || !currentPool.length) && typeof LOCAL_GEMINI_KEYS !== 'undefined' && Array.isArray(LOCAL_GEMINI_KEYS)) {
      const local = LOCAL_GEMINI_KEYS.filter(k => k && k.trim().length > 10);
      if (local.length) {
        currentPool = local;
        await chrome.storage.local.set({ storedKeys: local });
        console.info('[TabTune] Imported keys from local config.js into storage.');
      }
    }
  } catch (e) { /* config.js absent = normal after git clone */ }
  return currentPool;
}

function requireKeys() {
  if (!currentPool || !currentPool.length) {
    toast('No Gemini API keys yet! Click ⚙ Settings and paste at least 1 key. 🔒 Keys stay in your browser only.', 'err');
    return false;
  }
  return true;
}

async function callGemini(payloadBuilder) {
  const pool = await getHealthyKeyPool();
  if (!pool.length) throw new Error('No Gemini API keys configured. Open ⚙ Settings and add at least one key.');
  const { settings } = await chrome.storage.local.get('settings');
  const chosenModel = settings?.model || 'gemini-flash-latest';

  let attempts = 0;
  const maxAttempts = Math.min(pool.length, 6);
  let lastError = null;

  while (attempts < maxAttempts) {
    const key = pool[currentKeyIndex % pool.length];
    currentKeyIndex = (currentKeyIndex + 1) % pool.length;
    attempts++;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent`;
      const payload = typeof payloadBuilder === 'function' ? payloadBuilder() : payloadBuilder;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        return text.trim();
      }

      const errText = await res.text();
      let msg = errText;
      try { msg = JSON.parse(errText).error?.message || errText; } catch(e) {}

      // If rate limited (429), temporary service spike (503), or key denied (403), silently rotate to next key!
      if (res.status === 429 || res.status === 503 || res.status === 403) {
        console.warn(`[TabTune Key Pool] Key #${currentKeyIndex} hit ${res.status} (${msg.slice(0, 80)}). Auto-switching to next key...`);
        lastError = new Error(`Key ${res.status}: ${msg}`);
        continue;
      }

      throw new Error(msg || `Gemini API error ${res.status}`);
    } catch (err) {
      if (attempts >= maxAttempts) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini keys in the pool failed.');
}

// ---------- Visualizer Timer ----------
function startTimer(startedAt) {
  recStartedAt = startedAt;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerEl.textContent = fmtTime(Date.now() - recStartedAt);
  }, 250);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ---------- Recording UI Control ----------
function setRecordingUI(on, startedAt = Date.now()) {
  isRecording = on;
  recBtn.classList.toggle('recording', on);
  recLabel.textContent = on ? 'Stop & Finish Recording' : 'Start Recording';
  cancelBtn.hidden = !on;
  formatEl.disabled = on;
  bitrateEl.disabled = on;
  viz.classList.toggle('idle', !on);
  if (on) startTimer(startedAt);
  else {
    stopTimer();
    timerEl.textContent = '00:00';
    barEls.forEach(b => b.style.height = '4px');
  }
}

// Live levels broadcast from offscreen
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LEVELS' && isRecording) {
    msg.levels.forEach((v, i) => {
      if (barEls[i]) barEls[i].style.height = `${Math.max(4, (v / 255) * 60)}px`;
    });
  }
});

// ---------- Recorder Actions (with 3-2-1 countdown + persistent memory) ----------

// Warn before accidental close while capturing — the #1 "gone forever" killer.
window.addEventListener('beforeunload', (e) => {
  if (isRecording || isCountingDown) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function cancelCountdown() {
  countdownTimers.forEach(t => clearTimeout(t));
  countdownTimers = [];
  isCountingDown = false;
  if (countdownOverlay) countdownOverlay.hidden = true;
  recBtn.disabled = false;
  if (!isRecording) recLabel.textContent = 'Start Recording';
}

function beep(freq = 880, ms = 140) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { try { o.stop(); ctx.close(); } catch (e) {} }, ms);
  } catch (e) {}
}

function runCountdownThenStart() {
  if (isCountingDown) return; // ignore stray/double triggers
  // Countdown OFF (or 0s) = start instantly.
  if (!countdownToggle || !countdownToggle.checked) {
    doStartRecording();
    return;
  }
  // Countdown ON: count N...1, GO! — time to switch tabs & press Play
  // so the take starts at the beginning of the song, not mid-playback.
  // 0s behaves like instant start (no overlay at all).
  const totalSecs = Math.min(Math.max(parseInt(countdownSecs?.value || '5', 10) || 0, 0), 30);
  if (totalSecs <= 0) {
    doStartRecording();
    return;
  }
  isCountingDown = true;
  recBtn.disabled = true;
  recLabel.textContent = 'Get ready…';
  countdownOverlay.hidden = false;
  const steps = [];
  for (let s = totalSecs; s >= 1; s--) steps.push(String(s));
  steps.push('GO!');

  steps.forEach((label, i) => {
    countdownTimers.push(setTimeout(() => {
      countdownNum.textContent = label;
      countdownNum.classList.toggle('go', label === 'GO!');
      // restart pop animation
      countdownNum.style.animation = 'none';
      void countdownNum.offsetWidth;
      countdownNum.style.animation = '';
      beep(label === 'GO!' ? 880 : 440, label === 'GO!' ? 320 : 150);
      if (label === 'GO!') {
        countdownTimers.push(setTimeout(() => {
          countdownOverlay.hidden = true;
          isCountingDown = false;
          doStartRecording();
        }, 450));
      }
    }, i * 900));
  });
}

async function doStartRecording() {
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'BG_START_RECORDING',
      format: formatEl.value,
      bitrate: Number(bitrateEl.value)
    });
    if (!res?.ok) throw new Error(res?.error || 'Could not start recording.');
    setRecordingUI(true);
    if (res.tabTitle) {
      tabNameEl.textContent = `● Recording: ${res.tabTitle}`;
      if (!titleEl.value.trim()) titleEl.value = res.tabTitle.slice(0, 100);
    }
    toast('Tab audio capture started 🎙 (popup can close — REC badge keeps it alive)', 'success');
  } catch (err) {
    setRecordingUI(false);
    toast(err.message, 'err');
  } finally {
    recBtn.disabled = false;
  }
}

async function persistTake(audioRes) {
  // Save finished take into IndexedDB so it survives popup close / restart.
  // Offscreen already saved the same take — reuse its id to avoid duplicates.
  const store = Store();
  if (!store) return null;
  try {
    const entry = await store.save({
      id: audioRes.id || ('take-' + Date.now()),
      audioDataUrl: audioRes.audioDataUrl,
      audioBase64: audioRes.audioBase64,
      mimeType: audioRes.mimeType,
      ext: audioRes.ext,
      durationSec: audioRes.durationSec,
      title: titleEl.value.trim() || audioRes.title || 'Untitled take'
    });
    currentTakeId = entry.id;
    await refreshTakesList();
    return entry;
  } catch (e) {
    console.warn('[TabTune] persistTake failed:', e);
    return null;
  }
}

recBtn.addEventListener('click', async () => {
  // Click during countdown = abort.
  if (isCountingDown) { cancelCountdown(); toast('Countdown cancelled'); return; }
  recBtn.disabled = true;
  try {
    if (!isRecording) {
      runCountdownThenStart();
      return; // doStartRecording re-enables the button
    } else {
      recLabel.textContent = 'Processing Audio…';
      const res = await chrome.runtime.sendMessage({
        type: 'BG_STOP_RECORDING'
      });
      if (!res?.ok) throw new Error(res?.error || 'Failed to stop recording.');

      setRecordingUI(false);
      tabNameEl.textContent = 'Audio ready in studio player ✓';

      currentAudio = res;
      loadAudioIntoPlayer(res);
      await persistTake(res);
      toast(`Captured ${res.durationSec}s — auto-saved to Take Memory 💾`, 'success');
    }
  } catch (err) {
    setRecordingUI(false);
    toast(err.message, 'err');
  } finally {
    if (!isCountingDown) recBtn.disabled = false;
  }
});

if (countdownCancel) countdownCancel.addEventListener('click', () => {
  cancelCountdown(); toast('Countdown cancelled');
});

cancelBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'BG_CANCEL_RECORDING' }).catch(() => {});
  setRecordingUI(false);
  tabNameEl.textContent = 'Ready to capture tab audio';
  toast('Recording discarded');
});

// ---------- Studio Audio Player Logic ----------

function loadAudioIntoPlayer(audioData) {
  if (!audioData || !audioData.audioDataUrl) return;
  playerAudio.src = audioData.audioDataUrl;
  playerTitle.textContent = titleEl.value.trim() || audioData.title || 'Recorded Tab Audio';
  playerDuration.textContent = `00:00 / ${fmtSec(audioData.durationSec)}`;
  audioSeek.value = 0;
  playerCard.hidden = false;
  btnPlayPause.textContent = '▶ Play';
}

// ---------- Take Memory UI (IndexedDB history) ----------

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

async function refreshTakesList() {
  const store = Store();
  if (!store || !takesList) return;
  let items = [];
  try { items = await store.listMeta(); } catch (e) { /* IDB unavailable */ }
  if (takesCount) takesCount.textContent = `${items.length} saved`;
  if (!items.length) {
    takesList.innerHTML = '<p class="takes-empty">No takes yet — your finished recordings auto-save here.</p>';
    return;
  }
  takesList.innerHTML = '';
  items.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'take-row';
    const info = document.createElement('div');
    info.className = 'take-info';
    info.innerHTML = `<div class="take-title"></div><div class="take-meta">${fmtSec(t.durationSec)} • ${t.ext || ''} • ${fmtDate(t.createdAt)}</div>`;
    info.querySelector('.take-title').textContent = t.title || 'Untitled take';
    info.title = `${t.title || ''} — ${fmtDate(t.createdAt)}`;
    const load = document.createElement('button');
    load.className = 'take-load';
    load.textContent = 'Load';
    load.title = 'Load this take into the player';
    load.addEventListener('click', async () => {
      try {
        const full = await store.get(t.id);
        if (!full || !full.audioDataUrl) throw new Error('Take data missing.');
        currentAudio = full;
        currentTakeId = full.id;
        if (full.title && !titleEl.value.trim()) titleEl.value = full.title;
        loadAudioIntoPlayer(full);
        tabNameEl.textContent = `Loaded: ${full.title || 'take'} ✓`;
        toast('Take loaded into player ✓', 'success');
      } catch (e) { toast(e.message, 'err'); }
    });
    const del = document.createElement('button');
    del.className = 'take-del';
    del.textContent = '✕';
    del.title = 'Delete this take';
    del.addEventListener('click', async () => {
      try {
        await store.remove(t.id);
        if (currentTakeId === t.id) currentTakeId = null;
        await refreshTakesList();
        toast('Take deleted');
      } catch (e) { toast(e.message, 'err'); }
    });
    row.appendChild(info); row.appendChild(load); row.appendChild(del);
    takesList.appendChild(row);
  });
}

if (recoverDismiss) recoverDismiss.addEventListener('click', () => {
  if (recoverBar) recoverBar.hidden = true;
});

btnPlayPause.addEventListener('click', () => {
  if (!playerAudio.src) return;
  if (playerAudio.paused) {
    playerAudio.play();
    btnPlayPause.textContent = '⏸ Pause';
  } else {
    playerAudio.pause();
    btnPlayPause.textContent = '▶ Play';
  }
});

btnSkipBack.addEventListener('click', () => {
  if (playerAudio.src) {
    playerAudio.currentTime = Math.max(0, playerAudio.currentTime - 3);
  }
});

btnSkipFwd.addEventListener('click', () => {
  if (playerAudio.src) {
    playerAudio.currentTime = Math.min(playerAudio.duration || 9999, playerAudio.currentTime + 3);
  }
});

volumeSlider.addEventListener('input', () => {
  playerAudio.volume = Number(volumeSlider.value);
});

audioSeek.addEventListener('input', () => {
  isSeeking = true;
  if (playerAudio.duration) {
    const target = (Number(audioSeek.value) / 100) * playerAudio.duration;
    playerDuration.textContent = `${fmtSec(target)} / ${fmtSec(playerAudio.duration)}`;
  }
});

audioSeek.addEventListener('change', () => {
  if (playerAudio.duration) {
    playerAudio.currentTime = (Number(audioSeek.value) / 100) * playerAudio.duration;
  }
  isSeeking = false;
});

playerAudio.addEventListener('timeupdate', () => {
  if (!isSeeking && playerAudio.duration) {
    const pct = (playerAudio.currentTime / playerAudio.duration) * 100;
    audioSeek.value = pct;
    playerDuration.textContent = `${fmtSec(playerAudio.currentTime)} / ${fmtSec(playerAudio.duration)}`;
  }
  updateKaraokeHighlight(playerAudio.currentTime);
});

playerAudio.addEventListener('ended', () => {
  btnPlayPause.textContent = '▶ Play';
  audioSeek.value = 0;
});

// ---------- Synced LRC Parsing & Karaoke Display ----------

function parseLrc(text) {
  const lines = text.split(/\r?\n/);
  const parsed = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    let match;
    let hasTime = false;
    timeRegex.lastIndex = 0;
    const timestamps = [];

    while ((match = timeRegex.exec(line)) !== null) {
      hasTime = true;
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const cs = match[3] ? parseInt(match[3].padEnd(2, '0').slice(0, 2), 10) : 0;
      timestamps.push(min * 60 + sec + cs / 100);
    }

    const cleanText = line.replace(timeRegex, '').trim();
    if (hasTime) {
      for (const t of timestamps) {
        parsed.push({ time: t, text: cleanText, raw: line });
      }
    } else if (cleanText) {
      parsed.push({ time: -1, text: cleanText, raw: line });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

function renderKaraokeList() {
  parsedLrcLines = parseLrc(lyricsEl.value);
  karaokeList.innerHTML = '';

  if (!parsedLrcLines.length) {
    karaokeList.innerHTML = '<p class="karaoke-hint">No lyrics entered yet. Transcribe with Gemini or paste lyrics.</p>';
    return;
  }

  parsedLrcLines.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'karaoke-line';
    div.dataset.index = index;
    div.dataset.time = item.time;

    const timeTag = item.time >= 0 ? `<span class="karaoke-time">${fmtSec(item.time)}</span>` : '';
    div.innerHTML = `${timeTag}<span>${item.text || '♪ (instrumental)'}</span>`;

    div.addEventListener('click', () => {
      if (item.time >= 0 && playerAudio.src) {
        playerAudio.currentTime = item.time;
        if (playerAudio.paused) playerAudio.play();
        btnPlayPause.textContent = '⏸ Pause';
      }
    });

    karaokeList.appendChild(div);
  });
}

function updateKaraokeHighlight(currentTime) {
  if (currentMode !== 'karaoke' && karaokeWrap.hidden) return;
  if (!parsedLrcLines.length) return;

  let activeIndex = -1;
  for (let i = 0; i < parsedLrcLines.length; i++) {
    if (parsedLrcLines[i].time >= 0 && parsedLrcLines[i].time <= currentTime) {
      activeIndex = i;
    } else if (parsedLrcLines[i].time > currentTime) {
      break;
    }
  }

  const lineEls = karaokeList.querySelectorAll('.karaoke-line');
  lineEls.forEach((el, idx) => {
    const isActive = idx === activeIndex;
    el.classList.toggle('active', isActive);
    if (isActive) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

// Mode tabs switcher
tabLrc.addEventListener('click', () => {
  currentMode = 'lrc';
  tabLrc.classList.add('active');
  tabKaraoke.classList.remove('active');
  tabPlain.classList.remove('active');
  editorWrap.hidden = false;
  karaokeWrap.hidden = true;
});

tabKaraoke.addEventListener('click', () => {
  currentMode = 'karaoke';
  tabKaraoke.classList.add('active');
  tabLrc.classList.remove('active');
  tabPlain.classList.remove('active');
  editorWrap.hidden = true;
  karaokeWrap.hidden = false;
  renderKaraokeList();
});

tabPlain.addEventListener('click', () => {
  currentMode = 'plain';
  tabPlain.classList.add('active');
  tabLrc.classList.remove('active');
  tabKaraoke.classList.remove('active');
  editorWrap.hidden = false;
  karaokeWrap.hidden = true;
});

// ---------- Stamp Timestamp Helper [Ctrl+T] ----------
function stampCurrentTime() {
  const currentSec = playerAudio.currentTime || 0;
  const stamp = fmtLrcTimestamp(currentSec);

  const start = lyricsEl.selectionStart;
  const text = lyricsEl.value;

  // Find start and end of current line
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', start);
  if (lineEnd === -1) lineEnd = text.length;

  const currentLine = text.slice(lineStart, lineEnd);
  // Replace existing timestamp if present, otherwise prepend
  const strippedLine = currentLine.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, '');
  const newLine = `${stamp} ${strippedLine}`;

  lyricsEl.value = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
  lyricsEl.selectionStart = lineStart + newLine.length;
  lyricsEl.selectionEnd = lyricsEl.selectionStart;
  lyricsEl.focus();

  autosave();
  toast(`Stamped ${stamp} ✓`, 'success');
}

btnStampTime.addEventListener('click', stampCurrentTime);

// ---------- Auto-Transcribe with Gemini (Audio Input) ----------

btnTranscribe.addEventListener('click', async () => {
  if (!currentAudio || !currentAudio.audioBase64) {
    toast('No tab audio recorded yet! Record audio first.', 'err');
    return;
  }
  await getHealthyKeyPool();
  if (!requireKeys()) return;

  btnTranscribe.disabled = true;
  const prevHtml = btnTranscribe.innerHTML;
  btnTranscribe.innerHTML = '<span>⏳ Transcribing with Gemini...</span>';
  toast('Gemini is listening to your recorded audio and extracting lyrics...', 'info');

  const lang = transcribeLang.value;
  const langInstructions = lang === 'swahili'
    ? 'The song is primarily in Swahili (Kiswahili) with possible Sheng/English. Accurately capture Swahili syllables, rhymes, and dialect phrases.'
    : lang === 'english'
    ? 'The song is primarily in English.'
    : 'Detect the song language accurately (Swahili, English, or multilingual mix).';

  const systemPrompt = `You are a professional music transcriber and audio engineer.
Listen to this audio recording of a song. Transcribe the singing lyrics into standard synchronized LRC (.lrc) format.
RULES:
1. Every sung line MUST start with an exact timestamp like [mm:ss.xx] matching when that line is sung.
2. ${langInstructions}
3. If there is an instrumental solo or intro pause, mark it gracefully or skip to the first vocal entry.
4. Output ONLY the synchronized LRC lines. Do NOT wrap in markdown \`\`\` blocks, do not include introductory explanations or commentary.`;

  try {
    const resultText = await callGemini(() => ({
      contents: [{
        parts: [
          { text: systemPrompt },
          {
            inlineData: {
              mimeType: currentAudio.mimeType || 'audio/webm',
              data: currentAudio.audioBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    }));

    // Clean any markdown wrapper if model returned it
    const cleanLrc = resultText.replace(/^```(?:lrc)?\s*/i, '').replace(/```\s*$/i, '').trim();
    lyricsEl.value = cleanLrc;
    autosave();
    renderKaraokeList();
    toast('Gemini lyrics transcription complete! ✓', 'success');
  } catch (err) {
    console.error('[TabTune Gemini Transcribe Error]', err);
    toast(`Transcription error: ${err.message}`, 'err');
  } finally {
    btnTranscribe.disabled = false;
    btnTranscribe.innerHTML = prevHtml;
  }
});

// ---------- Online Synced Lyrics Search (LRCLIB) ----------

btnFetchLrclib.addEventListener('click', async () => {
  const query = titleEl.value.trim();
  if (!query) {
    toast('Enter a track or song title first to search LRCLIB 🔍', 'err');
    return;
  }

  btnFetchLrclib.disabled = true;
  const prevText = btnFetchLrclib.innerHTML;
  btnFetchLrclib.innerHTML = '<span>🔍 Searching LRCLIB...</span>';

  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LRCLIB search error (${res.status})`);

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      toast(`No lyrics found on LRCLIB for "${query}". Try Gemini Audio Transcribe!`, 'err');
      return;
    }

    // Pick best match with synced lyrics
    const withSync = data.find(d => d.syncedLyrics);
    if (withSync) {
      lyricsEl.value = withSync.syncedLyrics;
      if (!titleEl.value.includes(' - ')) {
        titleEl.value = `${withSync.artistName} - ${withSync.trackName}`;
      }
      autosave();
      renderKaraokeList();
      toast(`Loaded synced lyrics for "${withSync.trackName}" by ${withSync.artistName} ✓`, 'success');
    } else if (data[0].plainLyrics) {
      lyricsEl.value = data[0].plainLyrics;
      autosave();
      toast(`Loaded plain lyrics (no sync tags found). Use [Ctrl+T] to stamp timestamps!`, 'info');
    } else {
      toast('LRCLIB returned no lyrics text.', 'err');
    }
  } catch (err) {
    console.error('[TabTune LRCLIB Error]', err);
    toast(`LRCLIB error: ${err.message}`, 'err');
  } finally {
    btnFetchLrclib.disabled = false;
    btnFetchLrclib.innerHTML = prevText;
  }
});

// ---------- Lyrics Word & Line Count + Autosave ----------

function updateCount() {
  const text = lyricsEl.value.trim();
  const lines = text ? text.split(/\r?\n/).length : 0;
  const words = text ? text.split(/\s+/).length : 0;
  lyricsCount.textContent = `${lines} lines • ${words} words`;
}

let saveDebounce = null;
function autosave() {
  updateCount();
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    chrome.storage.local.set({
      draft: {
        title: titleEl.value,
        lyrics: lyricsEl.value,
        lang: transcribeLang.value
      }
    });
  }, 350);
}
lyricsEl.addEventListener('input', autosave);
titleEl.addEventListener('input', autosave);
transcribeLang.addEventListener('change', autosave);

// ---------- AI Songwriting & Assistance ----------

const AI_PROMPTS = {
  polish: (l) => `You are an expert songwriter and lyric editor. Polish and enhance these lyrics while preserving their original vocal flow, rhyme scheme, and core message. Return ONLY the improved lyrics, no conversational preamble:\n\n${l}`,
  continue: (l) => `You are a professional songwriter. Continue these lyrics seamlessly with 1-2 new verses and a chorus in the identical musical and rhyming style. Return ONLY the full combined lyrics:\n\n${l}`,
  rhymes: (l) => `Provide creative rhymes, multi-syllable rhymes, and slant rhymes for the key endings in these lyrics. Group clearly by target word:\n\n${l}`,
  titles: (l) => `Suggest 8 catchy, memorable song title ideas suited for these lyrics and musical mood. Return a numbered list:\n\n${l}`,
  mood: (l) => `Analyze these lyrics in under 120 words: identify the emotional mood, recommended musical chords (key/progressions), tempo (BPM), and genre styling:\n\n${l}`,
  swahili_adapt: (l) => `You are a renowned East African songwriter and Swahili poet. Adapt and enrich these lyrics with authentic, musical Swahili poetic metaphors (Tashbihi/Mizani) while maintaining easy singing rhythm. Return ONLY the adapted lyrics:\n\n${l}`,
  translate: (l) => `Translate these lyrics faithfully between Swahili and English (or English to Swahili), keeping rhythm and lyrical phrasing natural for singing. Return ONLY the translation:\n\n${l}`
};

const AI_LABELS = {
  polish: 'Polished Lyrics',
  continue: 'Continued Lyrics',
  rhymes: 'Rhyme Suggestions',
  titles: 'Song Title Ideas',
  mood: 'Mood & Chords Analysis',
  swahili_adapt: 'Swahili Rhyme Adapt',
  translate: 'Translation'
};

document.querySelectorAll('.ai-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const kind = btn.dataset.ai;
    const lyrics = lyricsEl.value.trim();
    if (!lyrics) {
      toast('Write, paste, or transcribe lyrics first ✍', 'err');
      return;
    }
    await getHealthyKeyPool();
    if (!requireKeys()) return;

    document.querySelectorAll('.ai-btn').forEach(b => b.disabled = true);
    aiOut.hidden = false;
    aiOutLabel.textContent = AI_LABELS[kind];
    aiText.textContent = '';
    aiText.classList.add('loading');

    try {
      const prompt = AI_PROMPTS[kind](lyrics);
      const result = await callGemini({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 1500 }
      });
      aiText.classList.remove('loading');
      aiText.textContent = result;
    } catch (err) {
      aiText.classList.remove('loading');
      aiText.textContent = `⚠ ${err.message}`;
    } finally {
      document.querySelectorAll('.ai-btn').forEach(b => b.disabled = false);
    }
  });
});

aiApply.addEventListener('click', () => {
  if (aiText.textContent && !aiText.textContent.startsWith('⚠')) {
    lyricsEl.value = aiText.textContent;
    autosave();
    renderKaraokeList();
    toast('Applied AI result to lyrics ✓', 'success');
  }
});

aiCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(aiText.textContent);
  toast('Copied to clipboard ✓', 'success');
});

aiClose.addEventListener('click', () => {
  aiOut.hidden = true;
});

// ---------- Export Hub (ZIP, LRC, Audio) ----------

btnExportZip.addEventListener('click', async () => {
  const title = titleEl.value.trim() || 'TabTune_Recording';
  const lyricsLrc = lyricsEl.value;
  // Clean plain lyrics without timestamps
  const lyricsTxt = lyricsLrc.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/g, '');

  toast('Building .zip package...', 'info');
  btnExportZip.disabled = true;

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'BG_EXPORT_ZIP',
      title,
      lyricsLrc,
      lyricsTxt,
      metadata: `Language: ${transcribeLang.value}\nExported via: TabTune Studio MV3`
    });
    if (!res?.ok) throw new Error(res?.error || 'Export failed.');
    toast(`Exported "${title}.zip" (${res.durationSec}s) ✓`, 'success');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btnExportZip.disabled = false;
  }
});

btnExportLrc.addEventListener('click', () => {
  const content = lyricsEl.value.trim();
  if (!content) {
    toast('No lyrics to export! Transcribe or write lyrics first.', 'err');
    return;
  }
  const title = (titleEl.value.trim() || 'lyrics').replace(/[\\/:*?"<>|]+/g, '_');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.lrc`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Downloaded ${title}.lrc ✓`, 'success');
});

btnExportAudio.addEventListener('click', () => {
  if (!currentAudio || !currentAudio.audioDataUrl) {
    toast('No audio recorded yet to download.', 'err');
    return;
  }
  const title = (titleEl.value.trim() || 'recording').replace(/[\\/:*?"<>|]+/g, '_');
  const a = document.createElement('a');
  a.href = currentAudio.audioDataUrl;
  a.download = `${title}.${currentAudio.ext || 'webm'}`;
  a.click();
  toast(`Downloaded ${a.download} ✓`, 'success');
});

// ---------- Keyboard Shortcuts Listener ----------

// Defense: never leave focus sitting on a button after click.
// Otherwise a stray Space/Enter (meant for play/pause or typing)
// re-triggers the focused button — e.g. restarting the 3-2-1
// countdown "by itself".
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button');
  if (btn) btn.blur();
});

document.addEventListener('keydown', (e) => {
  const isEditingText = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

  // Space -> Play/Pause audio preview (only when not typing in text fields)
  if (e.code === 'Space' && !isEditingText) {
    e.preventDefault();
    btnPlayPause.click();
    return;
  }

  // Ctrl + T -> Stamp timestamp
  if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T') && !e.shiftKey) {
    e.preventDefault();
    stampCurrentTime();
    return;
  }

  // Ctrl + [ -> Rewind 3s
  if ((e.ctrlKey || e.metaKey) && e.key === '[') {
    e.preventDefault();
    btnSkipBack.click();
    return;
  }

  // Ctrl + ] -> Forward 3s
  if ((e.ctrlKey || e.metaKey) && e.key === ']') {
    e.preventDefault();
    btnSkipFwd.click();
    return;
  }

  // Ctrl + Shift + T -> Transcribe Audio with Gemini
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'T' || e.key === 't')) {
    e.preventDefault();
    btnTranscribe.click();
    return;
  }

  // Ctrl + Shift + L -> Fetch LRCLIB
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
    e.preventDefault();
    btnFetchLrclib.click();
    return;
  }

  // Ctrl + S -> Export ZIP
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && !e.shiftKey) {
    e.preventDefault();
    btnExportZip.click();
    return;
  }

  // Ctrl + E -> Quick export .LRC
  if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    btnExportLrc.click();
    return;
  }
});

// ---------- Drawers & Modals Control ----------

expandBtn.addEventListener('click', () => {
  // From the sidepanel: open popup.html in a full tab (full-screen studio mode).
  // From the popup: same behaviour — open studio as a full tab.
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

if (sideBtn) {
  if (IS_SIDEPANEL) {
    // Already inside the sidebar — hide the pin button entirely.
    sideBtn.hidden = true;
  } else {
    // Running in popup: clicking the pin button opens the side panel and
    // CLOSES the popup (window.close() is safe here since we're in a popup).
    sideBtn.addEventListener('click', async () => {
      let lastErr = '';
      // Strategy 1: direct API with windowId (this click IS the user gesture).
      try {
        if (!chrome.sidePanel?.open) throw new Error('API_MISSING');
        try {
          const win = await chrome.windows.getCurrent().catch(() => null);
          if (win && win.id !== undefined) {
            await chrome.sidePanel.open({ windowId: win.id });
            window.close(); // safe — we are inside a popup, not the side panel
            return;
          }
          throw new Error('no-window-id');
        } catch (e) {
          lastErr = e.message || String(e);
          // Strategy 2: fall back to tabId scope.
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
          if (tabs && tabs[0]?.id !== undefined) {
            await chrome.sidePanel.open({ tabId: tabs[0].id });
            window.close(); // safe — popup context
            return;
          }
          throw e;
        }
      } catch (e) {
        lastErr = e.message || String(e);
      }
      // Strategy 3: delegate to background service worker.
      try {
        const res = await chrome.runtime.sendMessage({ type: 'BG_OPEN_SIDEPANEL' }).catch(() => null);
        if (res?.ok) { window.close(); return; } // safe — popup
        if (res?.error) lastErr = res.error;
      } catch (e) {
        lastErr = e.message || String(e);
      }
      if (lastErr === 'API_MISSING' || /no such api|undefined/i.test(lastErr)) {
        lastSidePanelError = 'API missing — reload extension (↻), Chrome 116+ needed';
        toast('Side Panel API missing — RELOAD extension at chrome://extensions (↻), Chrome 116+ needed. Or use ⤢ full-tab.', 'err');
      } else {
        lastSidePanelError = String(lastErr).slice(0, 120);
        toast(`Side Panel failed (${String(lastErr).slice(0, 90)}). Use ⤢ full-tab mode instead.`, 'err');
      }
      updateSidePanelStatus();
    });
  }
}

// ---------- Side Panel self-diagnosis (answers "shida ni nini?") ----------
function chromeMajorVersion() {
  try {
    const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch (e) { return 0; }
}

function updateSidePanelStatus() {
  if (!sidePanelStatus) return;
  const apiOk = !!(chrome.sidePanel && chrome.sidePanel.open);
  const v = chromeMajorVersion();
  if (apiOk && v >= 116) {
    sidePanelStatus.textContent = lastSidePanelError
      ? `⚠️ API ready (Chrome ${v}) but last open failed: ${lastSidePanelError}`
      : `✅ Ready (Chrome ${v}) — tap 📌 to dock the studio`;
  } else if (apiOk) {
    sidePanelStatus.textContent = `⚠️ API present but Chrome ${v || '?'} < 116 — update Chrome`;
  } else {
    sidePanelStatus.textContent = lastSidePanelError
      ? `❌ ${lastSidePanelError}`
      : `❌ API missing — reload extension (↻) at chrome://extensions`;
  }
}

shortcutsBtn.addEventListener('click', () => {
  shortcutsModal.hidden = !shortcutsModal.hidden;
});
closeShortcutsBtn.addEventListener('click', () => {
  shortcutsModal.hidden = true;
});

settingsBtn.addEventListener('click', async () => {
  settingsModal.hidden = !settingsModal.hidden;
  if (!settingsModal.hidden) {
    const pool = await getHealthyKeyPool();
    apiKeysArea.value = pool.join('\n');
    poolCountBadge.textContent = `${pool.length} Active Keys`;
    updateSidePanelStatus();
  }
});
closeSettingsBtn.addEventListener('click', () => {
  settingsModal.hidden = true;
});

saveSettings.addEventListener('click', async () => {
  const rawKeys = apiKeysArea.value
    .split(/\r?\n/)
    .map(k => k.trim())
    .filter(k => k.length > 10);

  // Empty = user explicitly clears pool (stays GitHub-safe: nothing in code).
  const keysToSave = rawKeys;
  await chrome.storage.local.set({
    storedKeys: keysToSave,
    settings: { model: modelEl.value }
  });
  currentPool = keysToSave;
  poolCountBadge.textContent = `${keysToSave.length} Active Keys`;
  settingsModal.hidden = true;
  toast(keysToSave.length
    ? `Configuration saved (${keysToSave.length} keys in pool) ✓`
    : 'Key pool cleared. Add keys any time in ⚙ Settings.', 'success');
});

// Test All Keys Button
btnTestPool.addEventListener('click', async () => {
  btnTestPool.disabled = true;
  poolTestStatus.textContent = 'Testing keys in pool...';
  const pool = await getHealthyKeyPool();
  if (!pool.length) {
    poolTestStatus.textContent = 'No keys to test — paste at least 1 key above.';
    btnTestPool.disabled = false;
    return;
  }
  let workingCount = 0;

  const testPromises = pool.map(async (k) => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelEl.value}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) workingCount++;
    } catch(e) {}
  });

  await Promise.all(testPromises);
  poolTestStatus.textContent = `${workingCount}/${pool.length} keys responsive!`;
  btnTestPool.disabled = false;
});

// ---------- Initialization ----------
(async function init() {
  // Restore pool & settings (GitHub-safe: no keys in code, storage only)
  const { storedKeys, settings, draft, countdownOn, countdownSecsVal } = await chrome.storage.local.get(['storedKeys', 'settings', 'draft', 'countdownOn', 'countdownSecsVal']);

  await getHealthyKeyPool(); // also imports local config.js once if present
  // Do NOT overwrite user storage with defaults anymore.
  if (storedKeys && Array.isArray(storedKeys)) currentPool = storedKeys.filter(k => k && k.trim().length > 10);
  poolCountBadge.textContent = `${currentPool.length} Active Keys`;

  if (settings?.model) {
    modelEl.value = settings.model;
  }

  if (countdownToggle) {
    countdownToggle.checked = countdownOn !== false; // default ON
    countdownToggle.addEventListener('change', () => {
      chrome.storage.local.set({ countdownOn: countdownToggle.checked });
    });
  }

  if (countdownSecs) {
    countdownSecs.value = String(countdownSecsVal || 5);
    if (![...countdownSecs.options].some(o => o.value === countdownSecs.value)) {
      countdownSecs.value = '5';
    }
    countdownSecs.addEventListener('change', () => {
      chrome.storage.local.set({ countdownSecsVal: parseInt(countdownSecs.value, 10) || 5 });
    });
  }

  if (draft) {
    titleEl.value = draft.title || '';
    lyricsEl.value = draft.lyrics || '';
    if (draft.lang) transcribeLang.value = draft.lang;
    updateCount();
    renderKaraokeList();
  }

  // Render persistent Take Memory first (fast, local).
  await refreshTakesList();

  // Resync with any ongoing tab recording or retrieve last audio.
  // Order: live session -> offscreen RAM -> IndexedDB (survives everything).
  const stateRes = await chrome.runtime.sendMessage({ type: 'BG_GET_STATE' }).catch(() => null);
  if (stateRes?.ok && stateRes.recState?.recording) {
    setRecordingUI(true, stateRes.recState.startedAt);
    tabNameEl.textContent = `● Recording: ${stateRes.recState.tabTitle || 'tab'}`;
  } else {
    let restored = null;
    const lastRecRes = await chrome.runtime.sendMessage({ type: 'BG_GET_LAST_RECORDING' }).catch(() => null);
    if (lastRecRes?.ok && lastRecRes.audioDataUrl) {
      restored = lastRecRes;
      currentTakeId = lastRecRes.id || null;
    } else {
      // Final safety net: persistent memory (popup was closed by mistake).
      try {
        const store = Store();
        if (store) restored = await store.getLatest();
      } catch (e) { /* ignore */ }
    }
    if (restored && restored.audioDataUrl) {
      currentAudio = restored;
      if (restored.id) currentTakeId = restored.id;
      loadAudioIntoPlayer(restored);
      tabNameEl.textContent = 'Audio restored from memory 💾';
      if (recoverBar) {
        recoverBar.hidden = false;
        if (recoverText) recoverText.textContent = `Recovered "${(restored.title || 'last take').slice(0, 40)}" (${fmtSec(restored.durationSec)}) — nothing was lost ✓`;
      }
    }
  }

  // Gentle first-run hint when no keys exist (without blocking recording).
  if (!currentPool.length) {
    poolCountBadge.textContent = '0 Active Keys — add in ⚙';
  }

  updateSidePanelStatus();
})();
