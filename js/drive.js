/* SwineOS – Google Drive backup and sync.
 * Backs the herd up (gzip-compressed JSON) to a Google Drive folder the user picks,
 * shortly after every change, and loads the newest backup from that folder when the app opens.
 * On a website it uses Google Identity Services for sign-in and the Drive REST API directly (no SDK).
 * Inside claude.ai it uses the Google Drive connector of the viewer's Claude account instead,
 * so no Google Cloud set-up is needed there. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const CFG_KEY = 'swineos.drive';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'application/vnd.google-apps.folder';
  const AUTO_DELAY = 60 * 1000; // back up one minute after the last change
  const CHECK_EVERY = 10 * 60 * 1000; // look for backups made on other computers
  const CONN = !!window.claude; // inside claude.ai: go through the Google Drive connector
  const SERVER = 'Google Drive';
  const CHUNK = 700 * 1024; // connector calls take at most 1 MB, so big backups go up in parts

  let cfg = load();
  let tokenClient = null;
  let gisLoading = null;
  let timer = null;
  let started = false;
  const status = { state: 'off', at: '', msg: '' };
  const statusListeners = new Set();

  function load() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { c = {}; }
    return { auto: true, loadOnOpen: true, keepDaily: 14, ...c };
  }
  function save() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ } }
  function clientId() { return (cfg.clientId || (S.CONFIG && S.CONFIG.googleClientId) || '').trim(); }
  function available() { return CONN || /^https?:$/.test(location.protocol); }
  function configured() { return available() && (CONN || !!clientId()) && !!cfg.folderId; }
  function setStatus(state, msg) {
    status.state = state; status.msg = msg || ''; status.at = new Date().toISOString();
    statusListeners.forEach((fn) => { try { fn(status); } catch (e) { /* ignore */ } });
  }
  function statusText() {
    const t = cfg.lastBackup ? new Date(cfg.lastBackup).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    switch (status.state) {
      case 'ok': return `Google Drive "${cfg.folderName}": backed up` + (t ? ' ' + t : '');
      case 'pending': return 'Google Drive: changes waiting to back up';
      case 'saving': return 'Google Drive: backing up…';
      case 'loading': return 'Google Drive: loading backup…';
      case 'connect': return CONN ? 'Google Drive: ' + (status.msg || 'needs permission') : 'Google Drive: click to reconnect';
      case 'error': return 'Google Drive: ' + (status.msg || 'error');
      default: return configured() ? 'Google Drive: connecting…' : '';
    }
  }

  /* ---------------- sign-in ---------------- */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.onload = () => resolve();
      sc.onerror = () => { gisLoading = null; reject(new Error('Could not reach Google. Check the internet connection.')); };
      document.head.appendChild(sc);
    });
    return gisLoading;
  }
  function tokenValid() { return cfg.token && cfg.tokenExp && Date.now() < cfg.tokenExp - 60000; }
  /* One token client for the whole session; every request for a token waits on its answer. */
  let waiters = [];
  let clientFor = '';
  function settle(err, token) {
    const w = waiters; waiters = [];
    w.forEach((x) => { clearTimeout(x.to); if (err) x.reject(err); else x.resolve(token); });
  }
  async function ensureClient() {
    await loadGis();
    if (tokenClient && clientFor === clientId()) return tokenClient;
    clientFor = clientId();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientFor, scope: SCOPE, login_hint: cfg.email || undefined,
      callback: (r) => {
        if (r.error) { settle(Object.assign(new Error(r.error_description || r.error), { code: 'connect' })); return; }
        cfg.token = r.access_token; cfg.tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; save();
        settle(null, cfg.token);
      },
      error_callback: (err) => settle(Object.assign(new Error(err && err.type === 'popup_failed_to_open' ? 'The browser blocked the Google sign-in window.' : 'Google sign-in was closed.'), { code: 'connect' })),
    });
    return tokenClient;
  }
  /** Ask Google for a token. Must run inside a click to be allowed by the browser, unless pop-ups are allowed for the site. */
  function requestToken(timeoutMs) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { waiters = waiters.filter((x) => x.to !== to); reject(Object.assign(new Error('Google sign-in did not answer.'), { code: 'connect' })); }, timeoutMs);
      waiters.push({ resolve, reject, to });
      if (waiters.length === 1) tokenClient.requestAccessToken({ prompt: '' });
    });
  }
  /** Get an access token. interactive=false tries without asking (the browser may block it). */
  async function getToken(interactive) {
    if (tokenValid()) return cfg.token;
    if (!clientId()) throw new Error('Enter the Google Client ID first.');
    await ensureClient();
    return requestToken(interactive ? 120000 : 8000);
  }

  /* When the browser blocks the sign-in window on opening, the first click or key press anywhere
     renews the sign-in (a click is allowed to open it) and then loads the newest backup. */
  let gestureArmed = false;
  function armFirstClick() {
    if (gestureArmed || (!CONN && !tokenClient)) return;
    gestureArmed = true;
    const handler = (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest('#drive-banner')) return; // the banner's own buttons handle it
      document.removeEventListener('pointerdown', handler, true);
      document.removeEventListener('keydown', handler, true);
      gestureArmed = false;
      if (CONN) { setStatus('loading'); sync(true).catch((e) => setStatus(e.code === 'connect' ? 'connect' : 'error', e.message)); return; }
      if (tokenValid()) return;
      setStatus('loading');
      requestToken(60000).then(async () => {
        const bar = document.getElementById('drive-banner'); if (bar) bar.remove();
        await sync(true);
      }).catch((e) => { setStatus('connect', e.message); reconnectBanner(); });
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('keydown', handler, true);
  }

  async function api(path, opts = {}, interactive = false) {
    const token = await getToken(interactive);
    const res = await fetch(path.startsWith('http') ? path : API + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (res.status === 401) { cfg.token = null; save(); throw Object.assign(new Error('Google sign-in expired.'), { code: 'connect' }); }
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) { /* not json */ }
      throw Object.assign(new Error(msg), { status: res.status });
    }
    return res;
  }
  const q = (s) => encodeURIComponent(s);

  async function connect() {
    if (CONN) { await tool('search_files', { query: "title contains 'SwineOS backup'", pageSize: 1, excludeContentSnippets: true }); return cfg.email || ''; }
    await getToken(true);
    const about = await (await api('/about?fields=user(emailAddress,displayName)')).json();
    cfg.email = about.user && about.user.emailAddress; save();
    return cfg.email;
  }
  function disconnect() {
    try { if (!CONN && cfg.token && window.google) google.accounts.oauth2.revoke(cfg.token, () => {}); } catch (e) { /* ignore */ }
    cfg = { ...cfg, token: null, tokenExp: 0, email: '', folderId: '', folderName: '', folderPath: '', mainFileId: '', lastRemote: '', lastLocal: '', lastBackup: '', lastFile: null };
    save(); setStatus('off');
  }

  /* ---------------- Google Drive connector (inside claude.ai) ---------------- */
  let mcpNs = null;
  const CONNECT_CODES = ['server_not_connected', 'needs_reauth', 'not_in_manifest', 'approval_required', 'consent_required', 'selection_required', 'not_granted', 'capability_disabled', 'blocked_by_policy'];
  function connError(e) {
    const c = e && e.code;
    const msg = {
      server_not_connected: 'Google Drive is not connected to your Claude account. Add it under claude.ai Settings → Connectors, then reload SwineOS.',
      needs_reauth: 'The Google Drive connection has expired. Reconnect Google Drive under claude.ai Settings → Connectors, then reload SwineOS.',
      not_in_manifest: 'SwineOS is not allowed to use Google Drive. Turn Google Drive on in this page\'s Permissions menu, then press Back up now.',
      approval_required: 'SwineOS needs your permission to use Google Drive. Press Back up now and choose Allow when claude.ai asks.',
      consent_required: 'SwineOS needs your permission to use Google Drive. Press Back up now and choose Allow when claude.ai asks.',
      selection_required: 'You have more than one Google Drive connection. Choose one when claude.ai asks, then press Back up now.',
      blocked_by_policy: 'Your organization does not allow SwineOS to use Google Drive.',
      not_granted: 'Google Drive is not available in this view of SwineOS.',
      capability_disabled: 'Google Drive is not available in this view of SwineOS.',
      tool_error: 'Google Drive refused the request: ' + ((e && e.message) || ''),
      server_unavailable: 'Google Drive did not answer. Check the internet connection; SwineOS tries again after the next change.',
    }[c];
    return Object.assign(new Error(msg || 'Google Drive: ' + ((e && (e.message || e.code)) || 'unknown error')), { code: CONNECT_CODES.includes(c) ? 'connect' : (c || 'error') });
  }
  async function tool(name, input) {
    if (!mcpNs) mcpNs = await window.claude.use('mcp');
    if (!mcpNs) throw Object.assign(new Error('Google Drive is not available in this view of SwineOS.'), { code: 'connect' });
    try { return (await mcpNs.callTool(SERVER, name, input, { cache: false })).payload || {}; } catch (e) { throw connError(e); }
  }
  const qv = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function cSearch(query) {
    const out = []; let pageToken = '';
    for (let i = 0; i < 20; i++) {
      const p = await tool('search_files', { query, pageSize: 100, excludeContentSnippets: true, ...(pageToken ? { pageToken } : {}) });
      out.push(...(p.files || []));
      pageToken = p.nextPageToken;
      if (!pageToken || !(p.files || []).length) break;
    }
    return out;
  }
  function b64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }
  /* Backups are named "SwineOS backup - <farm> - 2026-10-19 14.05.07.json.gz", with " (1 of 2)" before
     the extension when split into parts. A set of parts with the same time is one backup. */
  const SET_RX = /^SwineOS backup - (.*) - (\d{4}-\d\d-\d\d) (\d\d\.\d\d\.\d\d)(?: \((\d+) of (\d+)\))?\.json\.gz$/;
  function backupSets(files) {
    const m = new Map();
    for (const f of files) {
      const x = SET_RX.exec(f.title || '');
      if (!x && !/^SwineOS backup.*\.json(\.gz)?$/.test(f.title || '')) continue;
      const key = x ? `${x[2]} ${x[3]} ${x[1]}` : f.id; // older single files (website version) count as one set
      let st = m.get(key);
      if (!st) { st = { key, farm: x ? x[1] : '', day: x ? x[2] : (f.modifiedTime || '').slice(0, 10), name: x ? `SwineOS backup - ${x[1]} - ${x[2]} ${x[3].replace(/\./g, ':')}` : f.title, total: x ? +(x[5] || 1) : 1, parts: [], modifiedTime: f.modifiedTime || '', size: 0, timed: !!x }; m.set(key, st); }
      st.parts[(x ? +(x[4] || 1) : 1) - 1] = f;
      st.size += +f.fileSize || 0;
      if ((f.modifiedTime || '') > st.modifiedTime) st.modifiedTime = f.modifiedTime;
    }
    return [...m.values()].map((st) => ({ ...st, complete: st.parts.filter(Boolean).length === st.total })).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
  }
  async function cListSets() { return backupSets(await cSearch(`parentId = '${qv(cfg.folderId)}' and title contains 'SwineOS backup'`)); }
  function stampNow() {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  }
  async function cUploadSet(bytes, farm) {
    const stamp = stampNow();
    const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
    const files = [];
    for (let i = 0; i < n; i++) {
      const title = `SwineOS backup - ${farm} - ${stamp}${n > 1 ? ` (${i + 1} of ${n})` : ''}.json.gz`;
      files.push(await tool('create_file', { title, parentId: cfg.folderId, base64Content: b64(bytes.subarray(i * CHUNK, (i + 1) * CHUNK)), contentMimeType: 'application/gzip', disableConversionToGoogleType: true }));
    }
    return { key: `${stamp} ${farm}`, files };
  }
  async function cDownloadSet(st) {
    if (!st.complete) throw new Error('That backup is missing some of its parts.');
    const parts = [];
    for (const f of st.parts) { const p = await tool('download_file_content', { fileId: f.id }); parts.push(unb64(p.content || '')); }
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    return S.store.parseBackup(all);
  }
  /** Keep the newest backup, plus the newest one of each earlier day up to "daily copies to keep". */
  async function cPrune() {
    const sets = (await cListSets()).filter((st) => st.timed);
    const keepDays = Math.max(1, +cfg.keepDaily || 14);
    const days = []; const old = [];
    sets.forEach((st, i) => {
      if (i === 0) { days.push(st.day); return; }
      const stale = Date.now() - new Date(st.modifiedTime).getTime() > 3600000;
      if (!st.complete) { if (stale) old.push(st); return; }
      if (!days.includes(st.day) && days.length < keepDays) { days.push(st.day); return; }
      old.push(st);
    });
    for (const st of old) for (const f of st.parts.filter(Boolean)) { try { await tool('trash_file', { fileId: f.id }); } catch (e) { /* keep going */ } }
  }

  /* ---------------- files ---------------- */
  /** "My Drive / Farm / SwineOS backups" for a folder id. */
  async function folderPath(id) {
    const names = [];
    let cur = id;
    for (let i = 0; i < 12 && cur; i++) {
      if (cur === 'root') { names.unshift('My Drive'); break; }
      if (CONN) {
        const f = await tool('get_file_metadata', { fileId: cur, excludeContentSnippets: true });
        names.unshift(f.title || '?');
        cur = f.parentId;
        continue;
      }
      const f = await (await api(`/files/${cur}?fields=id,name,parents&supportsAllDrives=true`)).json();
      names.unshift(f.name);
      cur = f.parents && f.parents[0];
      if (!cur) break;
    }
    return names.join(' / ');
  }
  /** Folders anywhere in Drive that hold a SwineOS main backup, newest first. */
  async function findBackupFolders() {
    if (CONN) {
      const sets = backupSets(await cSearch("title contains 'SwineOS backup'"));
      const out = []; const seen = new Set();
      for (const st of sets) {
        const pid = st.parts.find(Boolean).parentId;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        let path = pid;
        try { path = await folderPath(pid); } catch (e) { /* keep id */ }
        out.push({ id: pid, name: path.split(' / ').pop(), path, file: { appProperties: { farm: st.farm, savedAt: st.modifiedTime }, modifiedTime: st.modifiedTime } });
      }
      return out;
    }
    const query = "appProperties has { key='swineos' and value='main' } and trashed=false";
    const r = await (await api(`/files?q=${q(query)}&fields=files(id,name,parents,modifiedTime,appProperties)&orderBy=modifiedTime desc&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
    const out = []; const seen = new Set();
    for (const f of r.files || []) {
      const pid = f.parents && f.parents[0];
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      let path = pid;
      try { path = await folderPath(pid); } catch (e) { /* keep id */ }
      out.push({ id: pid, name: path.split(' / ').pop(), path, file: f });
    }
    return out;
  }
  async function useFolder(f) {
    cfg.folderId = f.id; cfg.folderName = f.name; cfg.folderPath = f.path || f.name;
    cfg.mainFileId = ''; cfg.lastRemote = ''; save();
    if (!started) await startup(); else await sync(true);
    if (paneRender) paneRender();
  }
  /** Sign in, find the folder that holds the SwineOS backup and load it. Used on a new computer. */
  async function connectAndLoad() {
    if (!CONN && !clientId()) { S.settingsUI.open('drive'); ui().toast('Paste the Google Client ID first (Settings → Google Drive).'); return; }
    await connect();
    if (cfg.folderId) { setStatus('loading'); await sync(true); return; }
    const found = await findBackupFolders();
    if (found.length === 1) { await useFolder(found[0]); return; }
    if (!found.length) {
      await ui().alertBox('Google Drive', 'No SwineOS backup was found in this Google Drive yet. Choose the folder where SwineOS should keep its backups.');
      chooseFolder((f) => useFolder(f));
      return;
    }
    ui().modal({ title: 'Choose the farm backup', width: 620, body: h('div', h('p', 'SwineOS backups were found in these Google Drive folders. Pick the one to use on this computer:'),
      ui().grid({ rows: found, columns: [
        { label: 'Folder', value: (f) => f.path }, { label: 'Farm', value: (f) => (f.file.appProperties || {}).farm || '' },
        { label: 'Last saved', value: (f) => new Date((f.file.appProperties || {}).savedAt || f.file.modifiedTime).toLocaleString() },
      ], onRowDblClick: (f) => { U.$$('.modal-back').pop().remove(); useFolder(f); } }), h('p.hint', 'Double-click a folder to use it.')), buttons: [{ label: 'Cancel' }] });
  }
  async function listFolders(parent) {
    if (CONN) return (await cSearch(`parentId = '${qv(parent)}' and mimeType = '${FOLDER}'`)).map((f) => ({ id: f.id, name: f.title })).sort((a, b) => U.natCmp(a.name, b.name));
    const query = `mimeType='${FOLDER}' and trashed=false and '${parent}' in parents`;
    const r = await (await api(`/files?q=${q(query)}&fields=files(id,name)&orderBy=name&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
    return r.files || [];
  }
  async function createFolder(name, parent) {
    if (CONN) { const f = await tool('create_file', { title: name, parentId: parent, contentMimeType: FOLDER }); return { id: f.id, name: f.title || name }; }
    return (await api('/files?fields=id,name&supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) })).json();
  }
  async function findBackups(kind) {
    let query = `'${cfg.folderId}' in parents and trashed=false`;
    if (kind) query += ` and appProperties has { key='swineos' and value='${kind}' }`;
    else query += ` and (name contains '.json' or name contains 'SwineOS')`;
    const r = await (await api(`/files?q=${q(query)}&fields=files(id,name,modifiedTime,size,appProperties)&orderBy=modifiedTime desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
    return r.files || [];
  }
  async function upload(bytes, { fileId, name, props }) {
    const meta = fileId ? { appProperties: props } : { name, parents: [cfg.folderId], mimeType: 'application/gzip', appProperties: props };
    const boundary = 'swineos' + Math.random().toString(36).slice(2);
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`, bytes, `\r\n--${boundary}--`]);
    const url = `${UPLOAD}/files${fileId ? '/' + fileId : ''}?uploadType=multipart&fields=id,name,modifiedTime,webViewLink&supportsAllDrives=true`;
    return (await api(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
  }
  async function download(fileId) {
    const res = await api(`/files/${fileId}?alt=media&supportsAllDrives=true`);
    return S.store.parseBackup(await res.arrayBuffer());
  }
  function deviceName() {
    const ua = navigator.userAgent;
    return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Computer';
  }

  /* ---------------- backup / restore ---------------- */
  let busy = false;
  let paneRender = null; // redraws the open Google Drive settings pane
  const farmLabel = () => (`${S.store.settings.farmNumber || ''} ${S.store.settings.farmName || ''}`.trim() || 'herd').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  async function backupNow(interactive = false) {
    if (!configured()) { if (interactive) throw new Error('Choose a Google Drive folder first (Settings → Google Drive).'); return; }
    if (busy) { if (interactive) throw new Error('A backup is already running. Try again in a moment.'); return; }
    if (!CONN && S.store.state.backend === 'cloud') return;
    busy = true; clearTimeout(timer);
    setStatus('saving');
    try {
      const bytes = await S.store.gzipBackup();
      if (CONN) {
        const farm = farmLabel();
        const up = await cUploadSet(bytes, farm);
        const f0 = up.files[0] || {};
        cfg.lastRemote = up.key; cfg.lastLocal = S.store.state.savedAt || ''; cfg.lastBackup = new Date().toISOString();
        cfg.lastFile = { name: up.files.length > 1 ? `${f0.title} + ${up.files.length - 1} more part${up.files.length > 2 ? 's' : ''}` : f0.title, url: f0.viewUrl || '', size: bytes.length };
        if (f0.owner) cfg.email = f0.owner;
        save();
        try { await cPrune(); } catch (e) { /* old copies are tidied next time */ }
        setStatus('ok');
        return cfg.lastFile;
      }
      const farm = `${S.store.settings.farmNumber} ${S.store.settings.farmName}`.trim();
      const props = { swineos: 'main', savedAt: S.store.state.savedAt || '', device: deviceName(), farm: farm.slice(0, 100) };
      let file;
      try {
        if (cfg.mainFileId) file = await upload(bytes, { fileId: cfg.mainFileId, props });
      } catch (e) { if (e.status !== 404) throw e; }
      if (!file) {
        const found = (await findBackups('main'))[0];
        file = await upload(bytes, found ? { fileId: found.id, props } : { name: `SwineOS backup - ${farm}.json.gz`, props });
      }
      cfg.mainFileId = file.id; cfg.lastRemote = file.modifiedTime; cfg.lastLocal = S.store.state.savedAt || ''; cfg.lastBackup = new Date().toISOString();
      cfg.lastFile = { name: file.name, url: file.webViewLink || '', size: bytes.length };
      save();
      await dailyCopy(bytes, farm);
      setStatus('ok');
      return cfg.lastFile;
    } catch (e) {
      setStatus(e.code === 'connect' ? 'connect' : 'error', e.message);
      if (e.code === 'connect') armFirstClick();
      if (interactive) throw e;
    } finally { busy = false; }
  }
  async function dailyCopy(bytes, farm) {
    const today = U.today();
    if (cfg.lastDaily === today) return;
    await upload(bytes, { name: `SwineOS backup - ${farm} - ${today}.json.gz`, props: { swineos: 'daily', day: today } });
    cfg.lastDaily = today; save();
    const daily = await findBackups('daily');
    for (const f of daily.slice(Math.max(1, +cfg.keepDaily || 14))) {
      try { await api(`/files/${f.id}?supportsAllDrives=true`, { method: 'DELETE' }); } catch (e) { /* keep going */ }
    }
  }
  /** Keep the version that loses a conflict: remote=null saves this computer's records, else copies the Drive file. */
  async function saveConflictCopy(remote) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');
    const farm = `${S.store.settings.farmNumber} ${S.store.settings.farmName}`.trim();
    const name = `SwineOS backup - ${farm} - conflict copy ${remote ? 'from Drive' : 'from ' + deviceName()} ${stamp}.json.gz`;
    if (remote) {
      await api(`/files/${remote.id}/copy?fields=id&supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, appProperties: { swineos: 'copy' } }) });
    } else {
      await upload(await S.store.gzipBackup(), { name, props: { swineos: 'copy', savedAt: S.store.state.savedAt || '', device: deviceName() } });
    }
  }

  async function restoreFile(file, why) {
    setStatus('loading');
    if (CONN) {
      const data = await cDownloadSet(file);
      if (!data || !Array.isArray(data.animals)) throw new Error('The file in Google Drive is not a SwineOS backup.');
      ui().toast(`Loading ${data.animals.length} animals from Google Drive…`);
      await S.store.replaceAll(data.animals, data.settings, null, { savedAt: data.savedAt || file.modifiedTime, log: data.log });
      S.model.resetCache();
      cfg.lastRemote = file.key; cfg.lastLocal = S.store.state.savedAt || ''; cfg.lastBackup = new Date().toISOString(); save();
      setStatus('ok');
      ui().toast(`${why || 'Loaded backup from Google Drive'}: ${data.animals.length} animals, saved ${new Date(data.savedAt || file.modifiedTime).toLocaleString()}.`, 'ok');
      S.app.rerender();
      return;
    }
    const data = await download(file.id);
    if (!data || !Array.isArray(data.animals)) throw new Error('The file in Google Drive is not a SwineOS backup.');
    await S.store.replaceAll(data.animals, data.settings, null, { savedAt: data.savedAt || file.modifiedTime, log: data.log });
    S.model.resetCache();
    if ((file.appProperties || {}).swineos === 'main') { cfg.mainFileId = file.id; cfg.lastRemote = file.modifiedTime; }
    cfg.lastLocal = S.store.state.savedAt || ''; cfg.lastBackup = new Date().toISOString(); save();
    setStatus('ok');
    const p = file.appProperties || {};
    ui().toast(`${why || 'Loaded backup from Google Drive'}: ${data.animals.length} animals, saved ${new Date(p.savedAt || file.modifiedTime).toLocaleString()}${p.device ? ' on ' + p.device : ''}.`, 'ok');
    S.app.rerender();
  }

  /** Compare the newest Drive backup with this computer's records and bring them in line. */
  async function sync(opening) {
    if (!configured()) return;
    if (CONN) {
      // the shared online database holds the records here; Drive keeps the backups.
      // Load from Drive only when the herd is empty (a new copy of SwineOS), else make sure today is backed up.
      const latest = (await cListSets()).find((st) => st.complete);
      const hasLocal = S.store.animals().length > 0;
      if (!hasLocal) { if (latest) await restoreFile(latest, 'Loaded the latest backup from Google Drive'); else setStatus('ok'); return; }
      if (!latest || latest.day !== stampNow().slice(0, 10) || (S.store.state.savedAt && S.store.state.savedAt !== cfg.lastLocal)) await backupNow();
      else { if (!cfg.lastBackup) { cfg.lastBackup = latest.modifiedTime; save(); } setStatus('ok'); }
      return;
    }
    if (S.store.state.backend === 'cloud') return;
    const remote = (await findBackups('main'))[0];
    const localSaved = S.store.state.savedAt || '';
    const hasLocal = S.store.animals().length > 0;
    if (!remote) { if (hasLocal) await backupNow(); else setStatus('ok'); return; }
    const remoteChanged = remote.modifiedTime !== cfg.lastRemote;
    const localChanged = hasLocal && localSaved && localSaved !== cfg.lastLocal;
    if (remoteChanged && (!localChanged || !hasLocal)) {
      if (opening && !cfg.loadOnOpen) { setStatus('ok'); return; }
      await restoreFile(remote, opening ? 'Loaded the latest backup from Google Drive' : 'Updated from Google Drive');
    } else if (remoteChanged && localChanged) {
      const p = remote.appProperties || {};
      setStatus('pending');
      ui().modal({ title: 'Google Drive', width: 520, body: h('div',
        h('p', `Google Drive has a newer backup, saved ${new Date(p.savedAt || remote.modifiedTime).toLocaleString()}${p.device ? ' on ' + p.device : ''}.`),
        h('p', `This computer also has changes from ${new Date(localSaved).toLocaleString()} that are not in that backup.`),
        h('p', 'Which records do you want to keep? The other version is saved in the same Google Drive folder as a conflict copy, so nothing is lost.')), buttons: [
        { label: 'Use Google Drive backup', primary: true, onClick: async () => {
          try { await saveConflictCopy(null); await restoreFile(remote); } catch (e) { ui().alertBox('Google Drive', e.message); }
        } },
        { label: "Keep this computer's records", onClick: async () => {
          try { await saveConflictCopy(remote); } catch (e) { /* the daily copy still exists */ }
          cfg.lastRemote = remote.modifiedTime; save(); await backupNow();
        } },
      ] });
    } else if (localChanged) await backupNow();
    else setStatus('ok');
  }

  function schedule() {
    if (!configured() || !cfg.auto || (!CONN && S.store.state.backend === 'cloud')) return;
    setStatus('pending');
    clearTimeout(timer);
    timer = setTimeout(() => backupNow(), AUTO_DELAY);
  }

  async function startup() {
    if (!configured() || started) return;
    started = true;
    S.store.onLocalChange(schedule);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && status.state === 'pending') backupNow();
      if (!CONN && document.visibilityState === 'visible' && status.state !== 'pending' && tokenValid()) sync(false).catch(() => {});
    });
    window.addEventListener('online', () => { if (status.state === 'pending' || status.state === 'error') backupNow(); });
    if (!CONN) setInterval(() => { if (document.visibilityState === 'visible' && status.state !== 'pending' && tokenValid()) sync(false).catch(() => {}); }, CHECK_EVERY);
    setStatus('loading');
    try { await sync(true); } catch (e) {
      setStatus(e.code === 'connect' ? 'connect' : 'error', e.message);
      if (e.code === 'connect') {
        // blocked without a click: renew on the first click instead of asking
        if (CONN) armFirstClick();
        else try { await ensureClient(); armFirstClick(); } catch (e2) { reconnectBanner(); }
      }
    }
  }
  function reconnectBanner() {
    if (document.getElementById('drive-banner')) return;
    const bar = h('div#drive-banner', h('span', 'Google Drive sign-in did not finish, so the latest backup is not loaded yet. Press Connect, or allow pop-ups for this site so it happens by itself.'),
      h('button.wbtn', { type: 'button', onclick: async () => { try { await getToken(true); bar.remove(); setStatus('loading'); await sync(true); } catch (e) { ui().alertBox('Google Drive', e.message); } } }, 'Connect'),
      h('button.wbtn', { type: 'button', onclick: () => bar.remove() }, 'Not now'));
    document.body.appendChild(bar);
  }

  /* ---------------- dialogs ---------------- */
  function chooseFolder(done) {
    const path = [{ id: 'root', name: 'My Drive' }];
    let sel = null;
    const crumbs = h('div.gd-crumbs'); const listEl = h('div.gd-list');
    const render = async () => {
      crumbs.innerHTML = '';
      path.forEach((p, i) => { crumbs.append(i ? ' › ' : '', h('button.linkbtn', { type: 'button', onclick: () => { path.splice(i + 1); sel = null; render(); } }, p.name)); });
      listEl.innerHTML = '<div class="hint">Loading folders…</div>';
      try {
        const fs = await listFolders(path[path.length - 1].id);
        listEl.innerHTML = '';
        if (!fs.length) listEl.appendChild(h('div.hint', 'No folders here.'));
        fs.forEach((f) => listEl.appendChild(h('div.gd-row', { onclick: (e) => { sel = f; U.$$('.gd-row', listEl).forEach((x) => x.classList.remove('sel')); e.currentTarget.classList.add('sel'); }, ondblclick: () => { path.push(f); sel = null; render(); } }, '📁 ', f.name)));
      } catch (e) { listEl.innerHTML = ''; listEl.appendChild(h('div.hint', 'Could not list folders: ' + e.message)); }
    };
    const m = ui().modal({ title: 'Choose a Google Drive folder', width: 560, body: h('div', crumbs, listEl, h('p.hint', 'Double-click a folder to open it. Select a folder and press Use folder, or press Use this folder to back up into the folder that is open.')), buttons: [
      { label: 'Use folder', primary: true, onClick: () => { const f = sel || path[path.length - 1]; const names = path.map((p) => p.name).concat(sel ? [sel.name] : []); done({ ...f, path: names.join(' / ') }); } },
      { label: 'Use this folder', onClick: () => { const f = path[path.length - 1]; done({ ...f, path: path.map((p) => p.name).join(' / ') }); } },
      { label: 'New folder…', onClick: async () => {
        const inp = ui().input('gd-new', 'SwineOS backups');
        ui().modal({ title: 'New folder', width: 360, body: h('div.form', ui().field('Name', inp)), buttons: [{ label: 'Create', primary: true, onClick: async () => { try { const f = await createFolder(inp.value.trim() || 'SwineOS backups', path[path.length - 1].id); path.push(f); render(); } catch (e) { ui().alertBox('Google Drive', e.message); } } }, { label: 'Cancel' }] });
        return true;
      } },
      { label: 'Cancel' },
    ] });
    void m;
    render();
  }

  function restoreDialog() {
    const host = h('div', h('div.hint', 'Loading backups…'));
    ui().modal({ title: 'Restore from Google Drive', width: 640, body: host, buttons: [{ label: 'Close', primary: true }] });
    if (CONN) {
      cListSets().then((sets) => {
        host.innerHTML = '';
        if (!sets.length) { host.appendChild(h('p', 'No SwineOS backups in this folder yet.')); return; }
        host.appendChild(h('p.hint', 'Double-click a backup to load it. It replaces all records in SwineOS.'));
        host.appendChild(ui().grid({ rows: sets, columns: [
          { label: 'Backup', value: (st) => st.name + (st.complete ? '' : ' (incomplete)') }, { label: 'Saved', value: (st) => new Date(st.modifiedTime).toLocaleString(), sort: (st) => st.modifiedTime },
          { label: 'Parts', num: true, value: (st) => st.total }, { label: 'Size', num: true, value: (st) => (st.size ? Math.round(st.size / 1024) + ' KB' : '') },
        ], onRowDblClick: async (st) => {
          if (!(await ui().confirmBox('Restore from Google Drive', `Replace all records in SwineOS with the backup saved ${new Date(st.modifiedTime).toLocaleString()}?`, 'Restore'))) return;
          try { await restoreFile(st, 'Restored from Google Drive'); U.$$('.modal-back').forEach((x) => x.remove()); } catch (e) { ui().alertBox('Google Drive', e.message); }
        } }));
      }).catch((e) => { host.innerHTML = ''; host.appendChild(h('p', 'Could not list backups: ' + e.message)); });
      return;
    }
    findBackups().then((fs) => {
      host.innerHTML = '';
      if (!fs.length) { host.appendChild(h('p', 'No SwineOS backups in this folder yet.')); return; }
      host.appendChild(h('p.hint', 'Double-click a backup to load it. It replaces the records on this computer.'));
      host.appendChild(ui().grid({ rows: fs, columns: [
        { label: 'File', value: (f) => f.name }, { label: 'Saved', value: (f) => new Date((f.appProperties || {}).savedAt || f.modifiedTime).toLocaleString(), sort: (f) => f.modifiedTime },
        { label: 'Computer', value: (f) => (f.appProperties || {}).device || '' }, { label: 'Size', num: true, value: (f) => (f.size ? Math.round(f.size / 1024) + ' KB' : '') },
      ], onRowDblClick: async (f) => {
        if (!(await ui().confirmBox('Restore from Google Drive', `Replace the records on this computer with "${f.name}"?`, 'Restore'))) return;
        try { await restoreFile(f, 'Restored from Google Drive'); U.$$('.modal-back').forEach((x) => x.remove()); } catch (e) { ui().alertBox('Google Drive', e.message); }
      } }));
    }).catch((e) => { host.innerHTML = ''; host.appendChild(h('p', 'Could not list backups: ' + e.message)); });
  }

  /** Tell the user exactly what a manual backup did. */
  async function backupNowDialog() {
    try {
      ui().toast('Backing up to Google Drive…');
      const f = await backupNow(true);
      const where = cfg.folderPath || cfg.folderName;
      ui().modal({ title: 'Backed up to Google Drive', width: 520, body: h('div',
        h('p', 'The backup was saved in your Google Drive', where ? [' folder ', h('b', where)] : '', cfg.email ? [' (account ', h('b', cfg.email), ')'] : '', '.'),
        f && f.name ? h('p', 'File: ', f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.name) : h('b', f.name), f.size ? ` (${Math.round(f.size / 1024)} KB)` : '') : null,
        cfg.folderId ? h('p', h('a', { href: 'https://drive.google.com/drive/folders/' + cfg.folderId, target: '_blank', rel: 'noopener' }, 'Open the folder in Google Drive'))  : null),
      buttons: [{ label: 'OK', primary: true }] });
    } catch (e) { ui().alertBox('Google Drive backup failed', e.message); }
  }

  /** Settings pane. */
  function pane() {
    if (!available()) {
      return h('div.data-pane', h('h4', 'Google Drive backup'),
        h('p', 'Google Drive backup needs SwineOS to be opened from a web address (for example https://natt368.github.io/SwineOS/), not from a file on this computer.'));
    }
    const wrap = h('div.data-pane.gd-pane');
    const render = () => {
      wrap.innerHTML = '';
      const stLine = h('div.gd-status', statusText() || (cfg.email ? 'Connected' : 'Not connected'));
      const chooseBtn = h('button.wbtn', { type: 'button', disabled: !CONN && !cfg.email, onclick: () => chooseFolder(async (f) => {
        cfg.folderId = f.id; cfg.folderName = f.name; cfg.folderPath = f.path || f.name; cfg.mainFileId = ''; cfg.lastRemote = ''; save(); render();
        try { if (!started) await startup(); else await sync(true); } catch (e) { ui().alertBox('Google Drive', e.message); }
        render();
      }) }, cfg.folderId ? 'Change folder…' : 'Choose folder…');
      wrap.append(h('h4', 'Google Drive backup'));
      if (CONN) {
        wrap.append(
          h('p', 'SwineOS saves a backup of the whole herd to the Google Drive folder you choose, one minute after every change and at least once a day. If SwineOS ever opens with no animals, it loads the newest backup from that folder.'),
          h('p.hint', 'This uses the Google Drive connection of your Claude account (claude.ai Settings → Connectors). The first time, claude.ai asks you to allow SwineOS to use Google Drive: choose Allow.'),
          h('div.gd-row2',
            h('span', 'Account: ', h('b', cfg.email || (cfg.folderId ? 'your Claude Google Drive connection' : 'not connected yet'))),
            cfg.folderId
              ? h('button.wbtn', { type: 'button', onclick: async () => { if (await ui().confirmBox('Google Drive', 'Stop backing up to Google Drive? The backups already in Drive are kept.', 'Stop')) { disconnect(); render(); } } }, 'Disconnect')
              : h('button.wbtn.primary', { type: 'button', onclick: async () => { try { await connectAndLoad(); render(); } catch (e) { ui().alertBox('Google Drive', e.message); } } }, 'Connect Google Drive')));
      } else {
        const idInput = h('input#gd-client', { value: clientId(), placeholder: '1234567890-abc….apps.googleusercontent.com', onchange: (e) => { cfg.clientId = e.target.value.trim(); save(); } });
        wrap.append(
          h('p', 'SwineOS backs your records up to a Google Drive folder you choose, one minute after every change, and keeps a dated copy for each day. When SwineOS opens it loads the newest backup from that folder, so several computers can share the same herd.'),
          ui().field('Google Client ID', idInput),
          h('details.gd-help', h('summary', 'How to get a Client ID (one time, about 5 minutes)'), h('ol',
            h('li', 'Go to console.cloud.google.com and sign in with the Google account that owns the Drive.'),
            h('li', 'Create a project, for example "SwineOS".'),
            h('li', 'APIs & Services → Library → search "Google Drive API" → Enable.'),
            h('li', 'APIs & Services → OAuth consent screen → External → fill in the app name and your email → add your own Google address under Test users → Save.'),
            h('li', 'APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.'),
            h('li', `Under Authorized JavaScript origins add ${location.origin} and press Create.`),
            h('li', 'Copy the Client ID (ends in .apps.googleusercontent.com) and paste it above.'),
            h('li', 'When Google warns that the app is not verified, choose Continue: it is your own app.'))),
          h('div.gd-row2',
            cfg.email ? h('span', 'Account: ', h('b', cfg.email)) : h('span', 'Not connected'),
            cfg.email
              ? h('button.wbtn', { type: 'button', onclick: () => { disconnect(); render(); } }, 'Disconnect')
              : h('button.wbtn.primary', { type: 'button', onclick: async () => { try { if (!clientId()) { ui().alertBox('Google Drive', 'Paste the Google Client ID first.'); return; } await connectAndLoad(); render(); } catch (e) { ui().alertBox('Google Drive', e.message); } } }, 'Connect Google Drive')));
      }
      wrap.append(
        h('div.gd-row2',
          h('span', 'Connected folder: ', cfg.folderId ? h('a.gd-folder', { href: 'https://drive.google.com/drive/folders/' + cfg.folderId, target: '_blank', rel: 'noopener' }, cfg.folderPath || cfg.folderName) : h('b.gd-folder', 'none chosen')),
          chooseBtn),
        h('div.gd-row2', h('span', 'Last backup: ', cfg.lastFile && cfg.lastFile.name
          ? [cfg.lastFile.url ? h('a', { href: cfg.lastFile.url, target: '_blank', rel: 'noopener' }, cfg.lastFile.name) : h('b', cfg.lastFile.name), cfg.lastBackup ? ' · ' + new Date(cfg.lastBackup).toLocaleString() : '']
          : h('b', cfg.lastBackup ? new Date(cfg.lastBackup).toLocaleString() : 'none yet'))),
        h('label.blk', h('input', { type: 'checkbox', checked: cfg.auto, onchange: (e) => { cfg.auto = e.target.checked; save(); } }), ' Back up automatically after changes'),
        CONN ? null : h('label.blk', h('input', { type: 'checkbox', checked: cfg.loadOnOpen, onchange: (e) => { cfg.loadOnOpen = e.target.checked; save(); } }), ' Load the latest backup from Google Drive when SwineOS opens'),
        ui().field('Daily copies to keep', h('input', { type: 'number', min: 1, max: 365, value: cfg.keepDaily, style: { width: '80px' }, onchange: (e) => { cfg.keepDaily = Math.max(1, +e.target.value || 14); save(); } }), CONN ? 'The newest backup is always kept, plus the last backup of each earlier day for this many days. Older ones go to the Google Drive trash. Use Restore from Google Drive to go back to an earlier day.' : 'Besides the main backup, one dated copy is saved per day. Older copies are deleted. Use Restore from Google Drive to go back to an earlier day.'),
        h('div.btn-col.gd-btns',
          h('button.wbtn', { type: 'button', disabled: !configured(), onclick: async () => { await backupNowDialog(); render(); } }, 'Back up now'),
          h('button.wbtn', { type: 'button', disabled: !configured(), onclick: restoreDialog }, 'Restore from Google Drive…')),
        stLine);
    };
    render();
    paneRender = () => { if (wrap.isConnected) render(); };
    const off = (s) => { const el = wrap.querySelector('.gd-status'); if (el) el.textContent = statusText(); else statusListeners.delete(off); void s; };
    statusListeners.add(off);
    return wrap;
  }

  /** Small clickable status label for toolbars. */
  function statusChip() {
    const el = h('button.gd-chip', { type: 'button', title: 'Google Drive backup', onclick: () => { if (status.state === 'connect') reconnectBanner(); S.settingsUI.open('drive'); } });
    const upd = () => { if (!el.isConnected && el.dataset.on) { statusListeners.delete(upd); return; } el.dataset.on = '1'; el.textContent = statusText(); el.hidden = !statusText(); el.className = 'gd-chip ' + status.state; };
    statusListeners.add(upd); upd();
    return el;
  }

  S.drive = { connectAndLoad, folderLabel: () => cfg.folderPath || cfg.folderName || '', hasClientId: () => !!clientId(), startup, backupNow, sync, pane, statusChip, configured, available, get config() { return cfg; }, status, onStatus: (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); }, reconnect: reconnectBanner, backupNowDialog, connector: CONN };
})(window.SOS);
