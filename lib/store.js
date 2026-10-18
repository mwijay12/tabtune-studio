/**
 * TabTune Studio — shared persistent store (IndexedDB)
 * -----------------------------------------------------
 * Why IndexedDB and not chrome.storage?
 *  - chrome.storage.local caps at ~5-10 MB. One 320kbps song is already ~7MB.
 *  - IndexedDB quota is hundreds of MB, survives popup close, service-worker
 *    restart AND browser restart. Perfect "song memory".
 *
 * Works in popup, sidepanel AND offscreen (same extension origin shares one DB).
 * Exposes a tiny global: `window.TabTuneStore = { save, list, get, remove, ... }`
 * No external dependency. Plain callbacks-free Promise API.
 */
(function () {
  'use strict';

  const DB_NAME = 'tabtune-studio';
  const DB_VERSION = 1;
  const STORE = 'recordings';
  const MAX_KEEP = 10; // keep at most 10 takes, auto-prune oldest

  function openDb() {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: 'id' });
            os.createIndex('by-created', 'createdAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function tx(db, mode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async function save(rec) {
    // rec: { id?, audioDataUrl, audioBase64, mimeType, ext, durationSec, title, createdAt? }
    if (!rec || !rec.audioDataUrl) throw new Error('Nothing to save.');
    const db = await openDb();
    try {
      const entry = {
        id: rec.id || ('take-' + Date.now()),
        audioDataUrl: rec.audioDataUrl,
        audioBase64: rec.audioBase64 || '',
        mimeType: rec.mimeType || 'audio/webm',
        ext: rec.ext || 'webm',
        durationSec: rec.durationSec || 0,
        title: (rec.title || 'Untitled take').slice(0, 120),
        createdAt: rec.createdAt || Date.now()
      };
      await new Promise((resolve, reject) => {
        const rq = tx(db, 'readwrite').put(entry);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error);
      });
      // prune oldest beyond MAX_KEEP (fire-and-forget)
      try {
        const all = await listMeta();
        if (all.length > MAX_KEEP) {
          const victims = all
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, all.length - MAX_KEEP);
          for (const v of victims) {
            await remove(v.id).catch(() => {});
          }
        }
      } catch (e) { /* prune is best-effort */ }
      return entry;
    } finally {
      db.close();
    }
  }

  async function listMeta() {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const out = [];
        const rq = tx(db, 'readonly').index('by-created').openCursor(null, 'prev');
        rq.onsuccess = () => {
          const cur = rq.result;
          if (cur) {
            const v = cur.value;
            // metadata only — strip heavy payloads for fast list rendering
            out.push({
              id: v.id,
              title: v.title,
              durationSec: v.durationSec,
              ext: v.ext,
              mimeType: v.mimeType,
              createdAt: v.createdAt,
              hasAudio: !!v.audioDataUrl
            });
            cur.continue();
          } else resolve(out);
        };
        rq.onerror = () => reject(rq.error);
      });
    } finally {
      db.close();
    }
  }

  async function get(id) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const rq = tx(db, 'readonly').get(id);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => reject(rq.error);
      });
    } finally {
      db.close();
    }
  }

  async function getLatest() {
    const meta = await listMeta();
    if (!meta.length) return null;
    return get(meta[0].id);
  }

  async function remove(id) {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const rq = tx(db, 'readwrite').delete(id);
        rq.onsuccess = () => resolve();
        rq.onerror = () => reject(rq.error);
      });
    } finally {
      db.close();
    }
  }

  window.TabTuneStore = { save, listMeta, get, getLatest, remove, MAX_KEEP };
})();
