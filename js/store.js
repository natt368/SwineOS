/* SwineOS – data store.
 * Keeps all herd data in memory and persists it to one of two backends:
 *  - Shared cloud database (when the app runs as a claude.ai Artifact with the db capability)
 *  - The browser's localStorage (any other host, e.g. GitHub Pages / local file)
 * Every animal is one record holding its own event history.
 * Finance records (expenses and income) are kept beside the herd and go into the same backups.
 */
(function (S) {
  'use strict';
  const U = S.U;
  const LS_KEY = 'swineos.v1';

  const state = {
    savedAt: '', // when the herd records last changed (ISO time)
    settings: null,
    animals: new Map(), // uid -> animal
    fin: new Map(), // id -> finance record (expense or income)
    log: [],
    backend: 'local',
    ready: false,
    // for merging backups made on two computers: when animals / events were deleted,
    // and when the whole herd was last replaced (PigWIN import, restore, clear); f: finance records
    tombs: { a: {}, e: {}, f: {} },
    replacedAt: '',
  };
  const listeners = new Set();
  const changeListeners = new Set(); // user changes only (not loads)
  // where saving stands, for the "data is safe" badge
  const saveState = { pending: 0, localPending: false, error: '', lastSaved: '' };
  const saveListeners = new Set();
  function saveNotify() { saveListeners.forEach((fn) => { try { fn(saveState); } catch (e) { console.error(e); } }); }
  function changed() {
    state.savedAt = new Date().toISOString();
    changeListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }
  let db = null;
  let bulk = false; // ignore partial snapshots while a whole-herd write is in flight
  let finBulk = false; // the same for a large finance import
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
    state.tombs = { f: {}, ...((raw && raw.tombs) || { a: {}, e: {} }) };
    state.replacedAt = (raw && raw.replacedAt) || '';
    state.fin = new Map(((raw && raw.fin) || []).map((r) => [r.id, r]));
  }
  function saveLocal() { saveState.localPending = true; saveNotify(); saveLocalNow(); }
  const saveLocalNow = U.debounce(async () => {
    const data = { savedAt: state.savedAt, settings: state.settings, animals: [...state.animals.values()], fin: [...state.fin.values()], log: state.log.slice(-2000), tombs: state.tombs, replacedAt: state.replacedAt };
    try {
      await idbPut(LS_KEY, data);
      try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
      saveState.error = ''; saveState.lastSaved = new Date().toISOString();
    } catch (e) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(data)); saveState.error = ''; saveState.lastSaved = new Date().toISOString(); } catch (e2) {
        saveState.error = 'Could not save in this browser: ' + e2.message;
        S.ui && S.ui.toast('Could not save in this browser: ' + e2.message + '. Download a backup now.', 'error');
      }
    }
    saveState.localPending = false; saveNotify();
  }, 250);

  /* ---------------- cloud backend ---------------- */
  async function withRetry(fn, tries = 5) {
    let wait = 400;
    saveState.pending++; saveNotify();
    try {
      for (let i = 0; ; i++) {
        try { const r = await fn(); saveState.error = ''; saveState.lastSaved = new Date().toISOString(); return r; } catch (e) {
          const code = e && e.code;
          if (i >= tries - 1 || !(code === 'resource_exhausted' || code === 'unavailable')) { saveState.error = (e && (e.message || e.code)) || 'save failed'; throw e; }
          await new Promise((r) => setTimeout(r, wait));
          wait *= 2;
        }
      }
    } finally { saveState.pending--; saveNotify(); }
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
      let gotA = false; let gotS = false; let gotF = false;
      const check = () => { if (gotA && gotS && gotF && first) { first = false; resolve(); } };
      db.collection('animals').onSnapshot((snap) => {
        if (bulk && gotA) return;
        const m = new Map();
        snap.docs.forEach((d) => { const a = d.data(); if (a && a.uid) m.set(a.uid, a); });
        state.animals = m;
        gotA = true; check(); notify();
      }, (e) => { console.warn(e); gotA = true; check(); });
      db.collection('finance').onSnapshot((snap) => {
        if ((bulk || finBulk) && gotF) return;
        const m = new Map();
        snap.docs.forEach((d) => { const r = d.data(); if (r && r.id) m.set(r.id, r); });
        state.fin = m;
        gotF = true; check(); notify();
      }, (e) => { console.warn(e); gotF = true; check(); });
      db.doc('meta/settings').onSnapshot((snap) => {
        state.settings = mergeSettings(snap.exists ? snap.data() : null);
        gotS = true; check(); notify();
      }, (e) => { console.warn(e); state.settings = mergeSettings(null); gotS = true; check(); });
      setTimeout(() => { if (first) { first = false; if (!state.settings) state.settings = mergeSettings(null); resolve(); } }, 15000);
    });
    db.doc('meta/log').onSnapshot((snap) => { state.log = (snap.exists && snap.data().entries) || []; });
    return true;
  }

  async function writeFin(recs, removeIds) {
    await pool(removeIds, (id) => withRetry(() => db.collection('finance').doc(id).delete()), 4);
    await pool(recs, (r) => withRetry(() => db.collection('finance').doc(r.id).set(JSON.parse(JSON.stringify(r)))), 4);
  }
  /** Finance records of this computer and a backup combined: newest change of each record wins, deletions stay deleted. */
  function mergeFin(remote) {
    const tombs = { ...(((remote.tombs || {}).f) || {}) };
    for (const [id, t] of Object.entries(state.tombs.f || {})) if (!tombs[id] || t > tombs[id]) tombs[id] = t;
    const rmap = new Map((remote.fin || []).map((r) => [r.id, r]));
    const list = []; let fromRemote = 0;
    for (const id of new Set([...state.fin.keys(), ...rmap.keys()])) {
      const l = state.fin.get(id); const r = rmap.get(id);
      const m = !l ? r : !r ? l : (r.updated || '') > (l.updated || '') ? r : l;
      if (tombs[id] && tombs[id] >= (m.updated || '')) { if (l) fromRemote++; continue; }
      if (m !== l) fromRemote++;
      list.push(m);
    }
    return { list, tombs, fromRemote };
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
    /** Saving progress (pending writes, last error, last saved time) for the safety badge. */
    onSaveState(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); },
    saveState,
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
      const now = new Date().toISOString();
      const prev = state.animals.get(a.uid);
      const before = new Map(((prev && prev.events) || []).map((e) => [e.eid, e]));
      const strip = (e) => JSON.stringify({ ...e, edited: undefined });
      // each new or changed event gets a time stamp; removed events are remembered as deleted
      const events = (a.events || []).map((e) => (before.has(e.eid) && strip(before.get(e.eid)) === strip(e) ? e : { ...e, edited: now }));
      const kept = new Set(events.map((e) => e.eid));
      for (const eid of before.keys()) if (!kept.has(eid)) state.tombs.e[a.uid + '|' + eid] = now;
      a = { ...a, events, updated: now };
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
      state.tombs.a[uid] = new Date().toISOString();
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
    /** Replace the whole herd (restore backup / PigWIN import / clear). */
    async replaceAll(animals, settings, onProgress, opts = {}) {
      const old = [...state.animals.keys()];
      state.animals = new Map(animals.map((a) => [a.uid, a]));
      if (settings) state.settings = mergeSettings(settings);
      if (opts.savedAt) state.savedAt = opts.savedAt; // loaded from a backup: not a new change
      else changed();
      // a fresh herd (import, example, clear) starts a new history; a loaded backup brings its own
      // finance records are only replaced when the backup brings them (a PigWIN import or a new herd keeps them)
      const fin = Array.isArray(opts.fin) ? opts.fin : null;
      const oldFin = fin ? [...state.fin.keys()] : [];
      if (fin) state.fin = new Map(fin.map((r) => [r.id, r]));
      if (!opts.additive) { // additive: animals added to the herd (CSV import), not a new herd
        state.tombs = { ...(opts.tombs || { a: {}, e: {} }), f: fin ? { ...((opts.tombs || {}).f || {}) } : state.tombs.f || {} };
        state.replacedAt = opts.replacedAt !== undefined ? opts.replacedAt : opts.savedAt ? '' : new Date().toISOString();
      }
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
          if (fin) await writeFin(fin, oldFin);
        } catch (e) { cloudError(e); }
        bulk = false;
        try { // resync with what the server now holds
          const snap = await db.collection('animals').get();
          const m = new Map();
          snap.docs.forEach((d) => { const a = d.data(); if (a && a.uid) m.set(a.uid, a); });
          state.animals = m;
          if (fin) {
            const fs = await db.collection('finance').get();
            state.fin = new Map(fs.docs.map((d) => d.data()).filter((r) => r && r.id).map((r) => [r.id, r]));
          }
          notify();
        } catch (e) { /* the live listener will catch up */ }
      } else saveLocal();
    },
    /* ---------- finance records ---------- */
    fin() { return [...state.fin.values()]; },
    getFin(id) { return state.fin.get(id); },
    /** Any herd or finance records on file (an empty copy of SwineOS loads a backup instead of making one). */
    hasRecords() { return state.animals.size > 0 || state.fin.size > 0; },
    async saveFin(rec) { return (await Store.putFin([rec]))[0]; },
    async deleteFin(id) { return Store.putFin([], [id]); },
    /** Add or change finance records and delete others in one go (one save, one backup). */
    async putFin(recs, removeIds = []) {
      const now = new Date().toISOString();
      const out = recs.map((r) => ({ ...r, id: r.id || U.uid('f'), updated: now }));
      out.forEach((r) => { state.fin.set(r.id, r); delete state.tombs.f[r.id]; });
      const dels = removeIds.filter((id) => state.fin.has(id) && !out.some((r) => r.id === id));
      dels.forEach((id) => { state.fin.delete(id); state.tombs.f[id] = now; });
      changed();
      notify();
      if (state.backend === 'cloud') {
        finBulk = out.length + dels.length > 20;
        try { await writeFin(out, dels); } catch (e) { cloudError(e); }
        if (finBulk) {
          finBulk = false;
          try { // resync with what the server now holds
            const fs = await db.collection('finance').get();
            state.fin = new Map(fs.docs.map((d) => d.data()).filter((r) => r && r.id).map((r) => [r.id, r]));
            notify();
          } catch (e) { /* the live listener will catch up */ }
        }
      } else saveLocal();
      return out;
    },
    exportJSON(compact) {
      return JSON.stringify({ app: 'SwineOS', version: 1, exported: new Date().toISOString(), savedAt: state.savedAt, settings: state.settings, animals: [...state.animals.values()], fin: [...state.fin.values()], log: state.log.slice(-1500), tombs: state.tombs, replacedAt: state.replacedAt }, null, compact ? 0 : 1);
    },
    /**
     * Combine a backup made on another computer with the records here, so nothing entered on either is lost.
     * Animals and events from both are kept; for the same animal or event the most recent change wins;
     * deletions made on either side stay deleted. If one side replaced the whole herd (PigWIN import,
     * restore) after the other's last change, that side is taken as it is.
     * Returns { mode: 'merged' | 'remote' | 'local', fromRemote, fromLocal } (counts of animals that changed).
     */
    async mergeBackup(remote) {
      const L = { savedAt: state.savedAt || '', replacedAt: state.replacedAt || '' };
      const R = { savedAt: remote.savedAt || '', replacedAt: remote.replacedAt || '' };
      // finance records are combined one by one whatever happened to the herd (a herd import does not touch them)
      const F = mergeFin(remote);
      if (R.replacedAt && R.replacedAt > L.savedAt) {
        await Store.replaceAll(remote.animals, remote.settings, null, { savedAt: remote.savedAt || new Date().toISOString(), log: remote.log, tombs: { ...remote.tombs, f: F.tombs }, replacedAt: remote.replacedAt, fin: F.list });
        return { mode: 'remote', fromRemote: remote.animals.length, fromLocal: 0, finFromRemote: F.fromRemote };
      }
      if (L.replacedAt && L.replacedAt > R.savedAt) {
        if (F.fromRemote) await Store.replaceAll([...state.animals.values()], null, null, { savedAt: state.savedAt, additive: true, fin: F.list });
        state.tombs.f = F.tombs; saveLocal();
        return { mode: 'local', fromRemote: 0, fromLocal: state.animals.size, finFromRemote: F.fromRemote };
      }
      const tombs = { a: { ...((remote.tombs || {}).a || {}) }, e: { ...((remote.tombs || {}).e || {}) }, f: F.tombs };
      for (const k of ['a', 'e']) for (const [id, t] of Object.entries(state.tombs[k] || {})) if (!tombs[k][id] || t > tombs[k][id]) tombs[k][id] = t;
      const rmap = new Map((remote.animals || []).map((a) => [a.uid, a]));
      const uids = new Set([...state.animals.keys(), ...rmap.keys()]);
      const out = []; let fromRemote = 0; let fromLocal = 0;
      const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      for (const uid of uids) {
        const l = state.animals.get(uid); const r = rmap.get(uid);
        const newest = Math.max(...[l, r].filter(Boolean).map((x) => Date.parse(x.updated || 0) || 0));
        if (tombs.a[uid] && Date.parse(tombs.a[uid]) >= newest) continue; // deleted after its last change
        let m;
        if (!l || !r) m = l || r;
        else {
          const base = (l.updated || '') >= (r.updated || '') ? l : r;
          const evs = new Map();
          for (const e of [...(l.events || []), ...(r.events || [])]) {
            const cur = evs.get(e.eid);
            if (!cur || (e.edited || '') > (cur.edited || '')) evs.set(e.eid, e);
          }
          const events = [...evs.values()].filter((e) => { const t = tombs.e[uid + '|' + e.eid]; return !t || t < (e.edited || ''); });
          m = { ...base, events, updated: (l.updated || '') > (r.updated || '') ? l.updated : r.updated };
        }
        if (!l || !same(m, l)) fromRemote++;
        if (!r || !same(m, r)) fromLocal++;
        out.push(m);
      }
      const settings = R.savedAt > L.savedAt ? remote.settings : state.settings;
      const seen = new Set(); const log = [...(state.log || []), ...(remote.log || [])].filter((x) => { const k = x.t + x.text; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => (x.t < y.t ? -1 : 1)).slice(-1500);
      if (fromRemote || F.fromRemote || R.savedAt > L.savedAt) {
        await Store.replaceAll(out, settings, null, { savedAt: R.savedAt > L.savedAt ? R.savedAt : L.savedAt, log, tombs, replacedAt: L.replacedAt > R.replacedAt ? L.replacedAt : R.replacedAt, fin: F.list });
      } else { state.tombs = tombs; saveLocal(); }
      return { mode: 'merged', fromRemote, fromLocal, finFromRemote: F.fromRemote };
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
