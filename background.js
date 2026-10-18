/**
 * TabTune Studio — background.js (MV3 service worker)
 * ----------------------------------------------------
 * Responsibilities:
 *  1. Manages the offscreen document lifecycle (Chrome 116+).
 *  2. Mints tab-capture stream IDs (chrome.tabCapture.getMediaStreamId).
 *  3. Relays state and audio payload between popup <-> offscreen recorder.
 *  4. Manages Chrome downloads for ZIP, LRC, and Audio exports.
 *  5. Handles global keyboard shortcut commands (Alt+Shift+R to toggle recording).
 *  6. Shows live recording badge on extension icon.
 */

const OFFSCREEN_URL = 'offscreen.html';

// ---------- Offscreen document management ----------

async function hasOffscreenDoc() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  return contexts.length > 0;
}

let creatingOffscreen = null;

async function ensureOffscreenDoc() {
  if (await hasOffscreenDoc()) return;
  if (creatingOffscreen) { await creatingOffscreen; return; }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Recording audio from a captured browser tab via MediaRecorder.'
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

async function closeOffscreenDoc() {
  if (await hasOffscreenDoc()) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

// ---------- Badge helpers ----------

function setRecordingBadge(on) {
  chrome.action.setBadgeText({ text: on ? 'REC' : '' });
  if (on) {
    chrome.action.setBadgeBackgroundColor({ color: '#e11d48' });
    chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  }
}

// ---------- Recording toggler helper ----------

async function startTabCapture(format = 'webm', bitrate = 320000) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab found.');
  if (tab.url && /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
    throw new Error('Cannot capture browser internal pages. Open a tab playing music or video.');
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  await ensureOffscreenDoc();

  const res = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_START',
    target: 'offscreen',
    streamId,
    format,
    bitrate,
    tabTitle: tab.title || 'Tab Recording'
  });
  if (!res?.ok) throw new Error(res?.error || 'Offscreen recorder failed to start.');

  setRecordingBadge(true);
  await chrome.storage.session.set({
    recState: {
      recording: true,
      startedAt: Date.now(),
      tabTitle: tab.title || '',
      format
    }
  });

  return { ok: true, tabTitle: tab.title || '' };
}

async function stopTabCapture() {
  const res = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_STOP',
    target: 'offscreen'
  });
  if (!res?.ok) throw new Error(res?.error || 'Could not stop recording.');

  setRecordingBadge(false);
  await chrome.storage.session.set({
    recState: {
      recording: false,
      hasAudio: true,
      durationSec: res.durationSec,
      tabTitle: res.title || '',
      mimeType: res.mimeType
    }
  });

  return res;
}

// ---------- Message router ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {

        case 'BG_START_RECORDING': {
          const result = await startTabCapture(msg.format, msg.bitrate);
          sendResponse(result);
          break;
        }

        case 'BG_STOP_RECORDING': {
          const result = await stopTabCapture();
          sendResponse(result);
          break;
        }

        case 'BG_GET_LAST_RECORDING': {
          if (!(await hasOffscreenDoc())) {
            sendResponse({ ok: false, error: 'Offscreen document not active.' });
            break;
          }
          const result = await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_GET_LAST',
            target: 'offscreen'
          });
          sendResponse(result);
          break;
        }

        case 'BG_EXPORT_ZIP': {
          if (!(await hasOffscreenDoc())) {
            throw new Error('Audio recorder is not loaded. Please record a tab first.');
          }
          const res = await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_ZIP_EXPORT',
            target: 'offscreen',
            title: msg.title || 'TabTune_Track',
            lyricsLrc: msg.lyricsLrc || '',
            lyricsTxt: msg.lyricsTxt || '',
            metadata: msg.metadata || ''
          });
          if (!res?.ok) throw new Error(res?.error || 'Failed to generate ZIP.');

          const safe = (msg.title || 'TabTune_Track')
            .replace(/[\\/:*?"<>|]+/g, '_').trim() || 'TabTune_Track';

          const downloadId = await chrome.downloads.download({
            url: res.zipDataUrl,
            filename: `${safe}.zip`,
            saveAs: true
          });

          sendResponse({ ok: true, downloadId, durationSec: res.durationSec });
          break;
        }

        case 'BG_CANCEL_RECORDING': {
          await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_CANCEL',
            target: 'offscreen'
          }).catch(() => {});
          setRecordingBadge(false);
          await chrome.storage.session.remove('recState');
          await closeOffscreenDoc();
          sendResponse({ ok: true });
          break;
        }

        case 'BG_GET_STATE': {
          const { recState } = await chrome.storage.session.get('recState');
          sendResponse({ ok: true, recState: recState || { recording: false } });
          break;
        }

        case 'BG_OPEN_SIDEPANEL': {
          // Caller (popup click) holds the user gesture; try window scope, then tab scope.
          try {
            if (!chrome.sidePanel?.open) throw new Error('API_MISSING');
            try {
              const win = await chrome.windows.getCurrent().catch(() => null);
              if (win && win.id !== undefined) {
                await chrome.sidePanel.open({ windowId: win.id });
                sendResponse({ ok: true });
                break;
              }
              throw new Error('no-window-id');
            } catch (e) {
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
              if (!tabs || tabs[0]?.id === undefined) throw e;
              await chrome.sidePanel.open({ tabId: tabs[0].id });
              sendResponse({ ok: true });
              break;
            }
          } catch (e) {
            sendResponse({ ok: false, error: e.message || 'Could not open Side Panel.' });
          }
          break;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown message type.' });
      }
    } catch (err) {
      console.error('[TabTune background]', err);
      setRecordingBadge(false);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();
  return true;
});

// ---------- Global Keyboard Shortcut listener ----------

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-recording') {
    try {
      const { recState } = await chrome.storage.session.get('recState');
      if (recState?.recording) {
        await stopTabCapture();
      } else {
        await startTabCapture();
      }
    } catch (err) {
      console.error('[TabTune shortcut error]', err);
    }
  }
});

// Clear badge if service worker is suspended
chrome.runtime.onSuspend?.addListener(() => setRecordingBadge(false));
