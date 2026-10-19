/* SwineOS – data store.
 * Keeps all herd data in memory and persists it to one of two backends:
 *  - Shared cloud database (when the app runs as a claude.ai Artifact with the db capability)
 *  - The browser's localStorage (any other host, e.g. GitHub Pages / local file)
 * Every animal is one record holding its own event history.
 */
(function (S) {
  'use strict';
  const U = S.U;
  const LS_KEY = 'swineos.v1';

  const state = {
    savedAt: '', // when the herd records last changed (ISO time)
    settings: null,
    animals: new Map(), // uid -> animal
    log: [],
    backend: 'local',
    ready: false,
  };
  const listeners = new Set();
  const changeListeners = new Set(); // user changes only (not loads)
  function changed() {
    state.savedAt = new Date().toISOString();
    changeListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  let db = null;
  let bulk = false; // ignore partial snapshots while a whole-herd write is in flight
  let notifyQueued = false;

  function notify() {
    if (notifyQueued) return;
    notifyQueued = true;
    requestAnimationFrame(() => { notifyQueued = false; listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); });
  }

  function mergeSettings(s) {
    const d = JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS));
    if (!s) return d;
    for (const [k, v] of Object.entries(s)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) d[k] = { ...d[k], ...v };
      else d[k] = v;
    }
    return d;
  }

  /* ---------------- local backend ----------------
   * IndexedDB holds the herd (no 5 MB limit); localStorage is the fallback. */
  function idb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open('swineos', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let idbConn = null;
  async function idbGet(key) {
    idbConn = idbConn || await idb();
    return new Promise((resolve, reject) => {
      const r = idbConn.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbPut(key, val) {
    idbConn = idbConn || await idb();
    return new Promise((resolve, reject) => {
      const tx = idbConn.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function loadLocal() {
    let raw = null;
    try { raw = await idbGet(LS_KEY); } catch (e) { raw = null; }
    if (!raw) { try { raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { raw = null; } }
    state.settings = mergeSettings(raw && raw.settings);
    state.animals = new Map();
    ((raw && raw.animals) || []).forEach((a) => state.animals.set(a.uid, a));
    state.log = (raw && raw.log) || [];
    state.savedAt = (raw && raw.savedAt) || '';
  }
  const saveLocal = U.debounce(async () => {
    const data = { savedAt: state.savedAt, settings: state.settings, animals: [...state.animals.values()], log: state.log.slice(-2000) };
    try {
      await idbPut(LS_KEY, data);
      try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
    } catch (e) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e2) {
        S.ui && S.ui.toast('Could not save in this browser: ' + e2.message + '. Download a backup now.', 'error');
      }
    }
  }, 250);

  /* ---------------- cloud backend ---------------- */
  async function withRetry(fn, tries = 5) {
    let wait = 400;
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) {
        const code = e && e.code;
        if (i >= tries - 1 || !(code === 'resource_exhausted' || code === 'unavailable')) throw e;
        await new Promise((r) => setTimeout(r, wait));
        wait *= 2;
      }
    }
  }
  async function pool(items, worker, size = 4, onProgress) {
    let i = 0; let done = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const it = items[i++];
        await worker(it);
        done++;
        onProgress && onProgress(done, items.length);
      }
    });
    await Promise.all(runners);
  }
  function cloudError(e) {
    const msg = e && e.code === 'quota_exceeded'
      ? 'The shared database is full. Remove old records or download a backup.'
      : (e && e.code === 'not_granted') ? 'You have view-only access, so changes are not saved.'
        : 'Could not save to the shared database (' + ((e && (e.message || e.code)) || 'error') + ').';
    S.ui && S.ui.toast(msg, 'error');
  }

  async function tryCloud() {
    if (!window.claude || typeof window.claude.use !== 'function') return false;
    try {
      db = await Promise.race([window.claude.use('db'), new Promise((r) => setTimeout(() => r(null), 6000))]);
    } catch (e) { db = null; }
    if (!db) return false;
    state.backend = 'cloud';
    let first = true;
    await new Promise((resolve) => {
      let gotA = false; let gotS = false;
      const check = () => { if (gotA && gotS && first) { first = false; resolve(); } };
      db.collection('animals').onSnapshot((snap) => {
        if (bulk && gotA) return;
        const m = new Map();
        snap.docs.forEach((d) => { const a = d.data(); if (a && a.uid) m.set(a.uid, a); });
        state.animals = m;
        gotA = true; check(); notify();
      }, (e) => { console.warn(e); gotA = true; check(); });
      db.doc('meta/settings').onSnapshot((snap) => {
        state.settings = mergeSettings(snap.exists ? snap.data() : null);
        gotS = true; check(); notify();
      }, (e) => { console.warn(e); state.settings = mergeSettings(null); gotS = true; check(); });
      setTimeout(() => { if (first) { first = false; if (!state.settings) state.settings = mergeSettings(null); resolve(); } }, 15000);
    });
    db.doc('meta/log').onSnapshot((snap) => { state.log = (snap.exists && snap.data().entries) || []; });
    return true;
  }

  /* ---------------- public API ---------------- */
  const Store = {
    state,
    async init() {
      const cloud = await tryCloud();
      if (!cloud) await loadLocal();
      state.ready = true;
      notify();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Called after every change a user makes (for automatic backups). */
    onLocalChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); },
    get settings() { return state.settings; },
    animals() { return [...state.animals.values()]; },
    get(uid) { return state.animals.get(uid); },
    /** Find a live animal by ear tag; prefers active animals. */
    findById(id) {
      const t = String(id || '').trim().toLowerCase();
      if (!t) return null;
      const hits = [...state.animals.values()].filter((a) => String(a.id).toLowerCase() === t);
      if (!hits.length) return null;
      return hits.find((a) => !S.model.analyze(a).removed) || hits[hits.length - 1];
    },

    async saveAnimal(a) {
      a = { ...a, events: [...(a.events || [])], updated: new Date().toISOString() };
      state.animals.set(a.uid, a);
      changed();
      notify();
      if (state.backend === 'cloud') {
        try { await withRetry(() => db.collection('animals').doc(a.uid).set(a)); } catch (e) { cloudError(e); }
      } else saveLocal();
      return a;
    },
    async deleteAnimal(uid) {
      state.animals.delete(uid);
      changed();
      notify();
      if (state.backend === 'cloud') {
        try { await withRetry(() => db.collection('animals').doc(uid).delete()); } catch (e) { cloudError(e); }
      } else saveLocal();
    },
    async saveSettings(s) {
      state.settings = mergeSettings(s);
      changed();
      notify();
      if (state.backend === 'cloud') {
        try { await withRetry(() => db.doc('meta/settings').set(JSON.parse(JSON.stringify(state.settings)))); } catch (e) { cloudError(e); }
      } else saveLocal();
    },
    async log(text) {
      const entry = { t: new Date().toISOString(), text };
      state.log = [...state.log, entry].slice(-1500);
      if (state.backend === 'cloud') {
        try { await db.doc('meta/log').set({ entries: state.log }); } catch (e) { /* log is best effort */ }
      } else saveLocal();
    },
    /** Replace the whole herd (restore backup / demo / clear). */
    async replaceAll(animals, settings, onProgress, opts = {}) {
      const old = [...state.animals.keys()];
      state.animals = new Map(animals.map((a) => [a.uid, a]));
      if (settings) state.settings = mergeSettings(settings);
      if (opts.savedAt) state.savedAt = opts.savedAt; // loaded from a backup: not a new change
      else changed();
      if (opts.log) state.log = opts.log;
      notify();
      if (state.backend === 'cloud') {
        const keep = new Set(animals.map((a) => a.uid));
        const dels = old.filter((u) => !keep.has(u));
        const total = dels.length + animals.length;
        let base = 0;
        bulk = true;
        try {
          await pool(dels, (u) => withRetry(() => db.collection('animals').doc(u).delete()), 4, (d) => onProgress && onProgress(d, total));
          base = dels.length;
          await pool(animals, (a) => withRetry(() => db.collection('animals').doc(a.uid).set(a)), animals.length > 2000 ? 8 : 4, (d) => onProgress && onProgress(base + d, total));
          if (settings) await withRetry(() => db.doc('meta/settings').set(JSON.parse(JSON.stringify(state.settings))));
        } catch (e) { cloudError(e); }
        bulk = false;
        try { // resync with what the server now holds
          const snap = await db.collection('animals').get();
          const m = new Map();
          snap.docs.forEach((d) => { const a = d.data(); if (a && a.uid) m.set(a.uid, a); });
          state.animals = m;
          notify();
        } catch (e) { /* the live listener will catch up */ }
      } else saveLocal();
    },
    exportJSON(compact) {
      return JSON.stringify({ app: 'SwineOS', version: 1, exported: new Date().toISOString(), savedAt: state.savedAt, settings: state.settings, animals: [...state.animals.values()], log: state.log.slice(-1500) }, null, compact ? 0 : 1);
    },
    /** Backup file contents (JSON, optionally gzip-compressed) -> object. */
    async parseBackup(bytes) {
      let u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      return JSON.parse(new TextDecoder().decode(u8));
    },
    async gzipBackup() {
      return new Uint8Array(await new Response(new Blob([Store.exportJSON(true)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    },
  };

  S.store = Store;
})(window.SOS);
