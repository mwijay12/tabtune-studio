/**
 * TabTune Studio — offscreen.js
 * ------------------------------
 * Lives in the offscreen document.
 *  - Captures tab audio via chromeMediaSourceId without muting browser playback.
 *  - Records with MediaRecorder (WebM/Opus @ up to 320 kbps).
 *  - Computes live audio levels and broadcasts to popup visualizer.
 *  - High quality WAV conversion (PCM 16-bit LE).
 *  - Holds the current recorded audio buffer in memory for instant playback,
 *    AI transcription via Gemini, and flexible exporting (.zip, .lrc, .wav).
 */

let mediaStream = null;
let mediaRecorder = null;
let audioCtx = null;
let analyser = null;
let levelTimer = null;
let chunks = [];
let startedAt = 0;
let chosenMime = '';
let wantWav = false;
let currentTabTitle = '';

// Cached recording for preview playback and transcription
let lastRecording = null;

const PREFERRED_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus'
];

function pickMime() {
  for (const m of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

// ---------- Level broadcasting (popup waveform) ----------

function startLevelBroadcast() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  levelTimer = setInterval(() => {
    if (!analyser) return;
    analyser.getByteFrequencyData(data);
    const bars = 28;
    const step = Math.floor(data.length / bars);
    const levels = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j];
      levels.push(Math.round(sum / step));
    }
    chrome.runtime.sendMessage({
      type: 'LEVELS',
      levels,
      elapsedMs: Date.now() - startedAt
    }).catch(() => {});
  }, 70);
}

function stopLevelBroadcast() {
  if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }
}

// ---------- WAV encoding (PCM 16-bit LE) ----------

async function webmBlobToWav(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();

  const numCh = decoded.numberOfChannels;
  const sampleRate = decoded.sampleRate;
  const numFrames = decoded.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(decoded.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// Helper: Blob to Base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ dataUrl, base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------- Recorder control ----------

async function startRecording({ streamId, bitrate, format, tabTitle }) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    throw new Error('A recording is already in progress.');
  }
  wantWav = format === 'wav';
  currentTabTitle = tabTitle || 'Recording';
  chunks = [];

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  audioCtx = new AudioContext();
  const src = audioCtx.createMediaStreamSource(mediaStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  src.connect(analyser);
  src.connect(audioCtx.destination);

  chosenMime = pickMime();
  mediaRecorder = new MediaRecorder(mediaStream, {
    mimeType: chosenMime || undefined,
    audioBitsPerSecond: Math.min(Math.max(bitrate || 320000, 96000), 510000)
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  mediaRecorder.onerror = (e) => console.error('[TabTune offscreen] recorder error', e.error);

  mediaStream.getAudioTracks()[0].addEventListener('ended', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    stopLevelBroadcast();
  });

  mediaRecorder.start(1000);
  startedAt = Date.now();
  startLevelBroadcast();
}

function stopRecorder() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(); return; }
    mediaRecorder.onstop = () => resolve();
    mediaRecorder.stop();
  });
}

function teardown() {
  stopLevelBroadcast();
  try { mediaStream?.getTracks().forEach(t => t.stop()); } catch {}
  try { audioCtx?.close(); } catch {}
  mediaStream = null; mediaRecorder = null; audioCtx = null; analyser = null;
}

async function stopRecordingAndProcess() {
  const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  await stopRecorder();
  stopLevelBroadcast();

  const rawBlob = new Blob(chunks, { type: chosenMime || 'audio/webm' });
  chunks = [];
  if (!rawBlob.size) {
    teardown();
    throw new Error('No audio was captured — was the tab silent or playing through another device?');
  }

  let finalBlob = rawBlob;
  let finalMime = rawBlob.type || 'audio/webm';
  let finalExt = 'webm';

  if (wantWav) {
    try {
      finalBlob = await webmBlobToWav(rawBlob);
      finalMime = 'audio/wav';
      finalExt = 'wav';
    } catch (e) {
      console.warn('[TabTune] Lossless WAV conversion error, defaulting to WebM.', e);
    }
  }

  teardown();

  const { dataUrl, base64 } = await blobToBase64(finalBlob);

  lastRecording = {
    id: 'take-' + Date.now(),
    blob: finalBlob,
    audioDataUrl: dataUrl,
    audioBase64: base64,
    mimeType: finalMime,
    ext: finalExt,
    durationSec,
    title: currentTabTitle,
    timestamp: Date.now(),
    createdAt: Date.now()
  };

  // ---- SMART MEMORY: persist to IndexedDB so the take survives
  // popup close, service-worker restart, even browser restart.
  // (Best-effort: recording still returns even if IDB fails.)
  try {
    if (typeof TabTuneStore !== 'undefined' && TabTuneStore.save) {
      await TabTuneStore.save({
        id: lastRecording.id,
        audioDataUrl: lastRecording.audioDataUrl,
        audioBase64: lastRecording.audioBase64,
        mimeType: lastRecording.mimeType,
        ext: lastRecording.ext,
        durationSec: lastRecording.durationSec,
        title: lastRecording.title,
        createdAt: lastRecording.createdAt
      });
    }
  } catch (e) {
    console.warn('[TabTune] IDB persist failed (memory-only fallback).', e);
  }

  return {
    id: lastRecording.id,
    audioDataUrl: dataUrl,
    audioBase64: base64,
    mimeType: finalMime,
    ext: finalExt,
    durationSec,
    title: currentTabTitle
  };
}

async function zipAndExport({ title, lyricsLrc, lyricsTxt, metadata }) {
  if (!lastRecording || !lastRecording.blob) {
    throw new Error('No recorded audio available to export. Record a tab first.');
  }

  const zip = new JSZip();
  const audioFilename = `audio.${lastRecording.ext || 'webm'}`;
  zip.file(audioFilename, lastRecording.blob);

  if (lyricsLrc) {
    zip.file('lyrics.lrc', lyricsLrc);
  }
  zip.file('lyrics.txt', lyricsTxt || lyricsLrc || '(No lyrics recorded)');

  const infoContent = [
    `Title: ${title || lastRecording.title || 'Tab Recording'}`,
    `Duration: ${lastRecording.durationSec}s`,
    `Audio Format: ${audioFilename} (${lastRecording.mimeType})`,
    `Captured At: ${new Date().toLocaleString()}`,
    `Tool: TabTune Studio MV3 with Gemini AI & LRCLIB`,
    metadata ? `\n--- Metadata ---\n${metadata}` : ''
  ].join('\n');

  zip.file('info.txt', infoContent);

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const { dataUrl } = await blobToBase64(zipBlob);
  return { zipDataUrl: dataUrl, durationSec: lastRecording.durationSec };
}

// ---------- Message handling ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  (async () => {
    try {
      switch (msg.type) {
        case 'OFFSCREEN_START':
          await startRecording(msg);
          sendResponse({ ok: true });
          break;

        case 'OFFSCREEN_STOP': {
          const res = await stopRecordingAndProcess();
          sendResponse({ ok: true, ...res });
          break;
        }

        case 'OFFSCREEN_GET_LAST': {
          if (!lastRecording) {
            // Offscreen restarted? Try to recover from persistent memory.
            try {
              if (typeof TabTuneStore !== 'undefined' && TabTuneStore.getLatest) {
                const saved = await TabTuneStore.getLatest();
                if (saved && saved.audioDataUrl) {
                  sendResponse({
                    ok: true,
                    recovered: true,
                    id: saved.id,
                    audioDataUrl: saved.audioDataUrl,
                    audioBase64: saved.audioBase64,
                    mimeType: saved.mimeType,
                    ext: saved.ext,
                    durationSec: saved.durationSec,
                    title: saved.title
                  });
                  break;
                }
              }
            } catch (e) { /* fall through to error */ }
            sendResponse({ ok: false, error: 'No recording available.' });
          } else {
            sendResponse({
              ok: true,
              id: lastRecording.id,
              audioDataUrl: lastRecording.audioDataUrl,
              audioBase64: lastRecording.audioBase64,
              mimeType: lastRecording.mimeType,
              ext: lastRecording.ext,
              durationSec: lastRecording.durationSec,
              title: lastRecording.title
            });
          }
          break;
        }

        case 'OFFSCREEN_ZIP_EXPORT': {
          const res = await zipAndExport(msg);
          sendResponse({ ok: true, ...res });
          break;
        }

        case 'OFFSCREEN_CANCEL':
          await stopRecorder();
          teardown();
          chunks = [];
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ ok: false, error: 'Unknown offscreen message.' });
      }
    } catch (err) {
      console.error('[TabTune offscreen]', err);
      teardown();
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});
