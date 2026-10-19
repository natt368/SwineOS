/* SwineOS – "data is safe" badge shown in the title bar of every window.
 * Green cloud with a tick: saved and backed up. Spinning arrows: saving or backing up now.
 * Amber: saved on this computer but not backed up (yet). Red: a save failed. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const DL_KEY = 'swineos.lastDownload';

  const GLYPH = {
    safe: '<path d="M9.5 15.2l2.4 2.4 4.8-5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    saving: '<g class="spin"><path d="M16.8 13.4a4.2 4.2 0 0 1-7.4 1.6M9 12.6a4.2 4.2 0 0 1 7.4-1.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M16.9 9.4v2.2h-2.2M9 16.6v-2.2h2.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>',
    pending: '<circle cx="13" cy="14" r="4" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M13 11.8V14l1.6 1" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    warn: '<path d="M13 10.2v4.4" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><circle cx="13" cy="17.6" r="1.3" fill="#fff"/>',
    error: '<path d="M10.6 11.4l4.8 4.8M15.4 11.4l-4.8 4.8" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>',
  };
  const COLOR = { safe: '#1f9d3a', saving: '#1f6fd0', pending: '#d08a00', warn: '#d08a00', error: '#c62828' };
  const icon = (st) => `<svg viewBox="0 0 26 24" aria-hidden="true"><path d="M7.5 20h12a4.6 4.6 0 0 0 .6-9.2A6.6 6.6 0 0 0 7.4 9.4 5.3 5.3 0 0 0 7.5 20z" fill="${COLOR[st]}"/>${GLYPH[st]}</svg>`;

  function ago(iso) {
    if (!iso) return '';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(iso).toLocaleDateString();
  }
  function lastDownload() { try { return localStorage.getItem(DL_KEY) || ''; } catch (e) { return ''; } }

  /** Current safety state: { st, label, detail } */
  function compute() {
    const ss = S.store.saveState || {};
    const cloud = S.store.state.backend === 'cloud';
    if (cloud) {
      if (ss.error) return { st: 'error', label: 'Not saved', detail: 'The last change could not be saved to the online database: ' + ss.error };
      if (ss.pending > 0) return { st: 'saving', label: 'Saving…', detail: 'Saving your changes to the shared online database.' };
      return { st: 'safe', label: 'Saved online', detail: 'Every change is saved to the shared online database' + (ss.lastSaved ? ` (last save ${ago(ss.lastSaved)})` : '') + '.' };
    }
    if (ss.error) return { st: 'error', label: 'Not saved', detail: ss.error + '. Download a backup now.' };
    if (ss.localPending) return { st: 'saving', label: 'Saving…', detail: 'Saving your changes on this computer.' };
    const d = S.drive;
    if (d && d.configured()) {
      const cfg = d.config; const ds = d.status.state;
      const when = cfg.lastBackup ? ago(cfg.lastBackup) : '';
      if (ds === 'saving') return { st: 'saving', label: 'Backing up…', detail: 'Uploading a backup to Google Drive.' };
      if (ds === 'loading') return { st: 'saving', label: 'Checking backup…', detail: 'Checking Google Drive for the newest backup.' };
      if (ds === 'pending') return { st: 'pending', label: 'Backing up soon', detail: 'Your latest changes are saved on this computer and go to Google Drive within a minute.' };
      if (ds === 'ok') return { st: 'safe', label: `Backed up to ${cfg.folderName}` + (when ? ' · ' + when : ''), detail: `Saved on this computer and backed up to Google Drive (folder "${cfg.folderName}")${when ? ', ' + when : ''}.` };
      if (ds === 'connect') return { st: 'warn', label: 'Backup paused', detail: 'Google Drive sign-in has expired. Changes are saved on this computer only until you reconnect.' };
      if (ds === 'error') return { st: 'warn', label: 'Backup failed', detail: 'The last Google Drive backup failed: ' + (d.status.msg || 'unknown error') + '. Changes are saved on this computer; SwineOS tries again after the next change.' };
      return { st: 'saving', label: 'Connecting…', detail: 'Connecting to Google Drive.' };
    }
    const dl = lastDownload();
    return { st: 'warn', label: 'This computer only', detail: 'Records are saved in this browser on this computer, but not backed up anywhere else' + (dl ? ` (last backup file downloaded ${ago(dl)})` : '') + '. Connect Google Drive for automatic backups, or download a backup file regularly.' };
  }

  const badge = h('button.safe-badge', { type: 'button', onclick: details, 'aria-live': 'polite' });
  function render() {
    const c = compute();
    badge.className = 'safe-badge ' + c.st;
    badge.innerHTML = icon(c.st) + `<span>${U.esc(c.label)}</span>`;
    badge.title = c.detail + ' Click for details.';
  }

  function details() {
    const c = compute();
    const cloud = S.store.state.backend === 'cloud';
    const d = S.drive; const dc = d && d.configured();
    const ss = S.store.saveState || {};
    const row = (k, v) => h('div.safe-row', h('span', k), h('b', v || '–'));
    const body = h('div.safe-detail',
      h('div.safe-head', h('span.safe-big', { html: icon(c.st) }), h('div', h('div.safe-title', c.label), h('div', c.detail))),
      row('Records saved', cloud ? 'Shared online database' : 'This browser on this computer'),
      row('Last saved', ss.lastSaved ? new Date(ss.lastSaved).toLocaleString() : (S.store.state.savedAt ? new Date(S.store.state.savedAt).toLocaleString() : '')),
      cloud ? null : row('Google Drive folder', dc ? d.folderLabel() : (d && d.available() ? 'Not connected' : 'Not available here')),
      cloud || !dc ? null : row('Google account', d.config.email || ''),
      cloud || !dc ? null : row('Last synced with Google Drive', d.config.lastBackup ? new Date(d.config.lastBackup).toLocaleString() : 'not yet'),
      cloud ? null : row('Last backup file downloaded', lastDownload() ? new Date(lastDownload()).toLocaleString() : 'never'),
      row('Animals on file', String(S.store.animals().length)));
    const buttons = [];
    if (dc) buttons.push({ label: 'Back up now', primary: true, onClick: async () => { try { if (d.status.state === 'connect') { d.reconnect(); return; } await d.backupNow(true); ui().toast('Backed up to Google Drive.', 'ok'); } catch (e) { ui().alertBox('Google Drive', e.message); } } });
    else if (!cloud && d && d.available()) buttons.push({ label: 'Set up Google Drive backup', primary: true, onClick: () => S.settingsUI.open('drive') });
    buttons.push({ label: 'Download backup file', onClick: () => { ui().saveFile(`swineos-backup-${U.today()}.json`, S.store.exportJSON(), 'application/json'); return true; } });
    if (dc) buttons.push({ label: 'Google Drive settings', onClick: () => S.settingsUI.open('drive') });
    buttons.push({ label: 'Close' });
    ui().modal({ title: 'Is my data safe?', width: 520, body, buttons });
  }

  /** Put the badge into a window's title bar (called for every window that is shown). */
  function attach(win) {
    const bar = win && win.querySelector('.win-title');
    if (!bar) return;
    const x = bar.querySelector('.win-x');
    bar.insertBefore(badge, x || null);
    render();
  }

  function start() {
    S.store.onSaveState(render);
    S.store.onChange(render);
    if (S.drive && S.drive.onStatus) S.drive.onStatus(render);
    setInterval(render, 30000);
    render();
  }

  S.safety = { attach, start, render, markDownload: () => { try { localStorage.setItem(DL_KEY, new Date().toISOString()); } catch (e) { /* storage blocked */ } render(); } };
})(window.SOS);
