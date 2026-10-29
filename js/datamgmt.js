/* SwineOS – Data management: Google Drive backup and sync, backup files, imports and what is on file,
 * for herd records and finances alike. Opened from the gear on the landing page. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;

  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  const card = (title, sub, ...kids) => h('section.dm-card', h('h2', title), sub ? h('p.dm-sub', sub) : null, ...kids);
  const row = (k, v) => h('div.dm-row', h('span', k), h('b', v === '' || v === undefined || v === null ? '–' : String(v)));
  // small buttons for the one-time imports and start over; the explanation is the hover tip
  const mini = (label, tip, onclick, cls = '') => h('button.dm-mini' + cls, { type: 'button', title: tip, onclick }, label);
  const miniFile = (label, tip, accept, onfile) => h('label.dm-mini', { title: tip }, label,
    h('input', { type: 'file', accept, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onfile(f); } }));

  /**
   * Deleting records cannot be undone: say exactly what goes, offer a backup file first, and only allow the
   * delete once DELETE has been typed. Resolves true when the person confirmed.
   */
  function guardedDelete({ title, what, keeps }) {
    return new Promise((resolve) => {
      let ok = false;
      const word = h('input.dm-word', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Type DELETE to confirm' });
      const body = h('div.dm-guard',
        h('p.dm-guard-what', h('b', 'This deletes '), what, '.'),
        h('p', keeps, ' It cannot be undone: Google Drive backs up the emptied records too, so its next backups no longer hold them.'),
        h('button.dm-mini', { type: 'button', onclick: () => { ui().saveFile(`swineos-backup-${U.today()}.json`, S.store.exportJSON(), 'application/json'); S.safety.markDownload(); } }, 'Download a backup file first'),
        h('label.dm-guard-type', h('span', 'To delete, type ', h('b', 'DELETE'), ' in the box:'), word));
      const m = ui().modal({ title, width: 480, cls: 'fin-dlg.dm-guard-dlg', body, onClose: () => resolve(ok), buttons: [
        { label: 'Cancel', primary: true },
        { label: 'Delete', cls: 'danger', right: true, onClick: () => { ok = true; } },
      ] });
      const del = m.box.querySelector('.wbtn.danger');
      del.disabled = true;
      word.addEventListener('input', () => { del.disabled = word.value.trim().toUpperCase() !== 'DELETE'; });
      setTimeout(() => word.focus(), 40);
    });
  }

  function open() {
    const win = ui().appWindow({ title: 'Data management', cls: 'dm-win', onClose: () => S.app.landing() });
    const body = h('div.dm-body');
    win.appendChild(body);
    const prog = h('div.progress.dm-prog');

    function render() {
      body.innerHTML = '';
      const st = S.store.state;
      const animals = S.store.animals();
      const removed = (a) => S.model.analyze(a).removed;
      const females = animals.filter((a) => a.sex === 'F');
      const events = animals.reduce((n, a) => n + (a.events || []).length, 0);
      const moves = S.store.fin().filter((r) => r.kind === 'move');
      const fin = S.store.fin().filter((r) => r.kind === 'exp' || r.kind === 'inc');
      const years = [...new Set(fin.map((r) => (r.date || '').slice(0, 4)).filter(Boolean))].sort();
      const ss = S.store.saveState || {};
      const saved = ss.lastSaved || st.savedAt;

      body.append(
        h('header.dm-head',
          h('button.mm-homebtn', { type: 'button', title: 'Back to the SwineOS home page', onclick: () => S.app.landing() }, h('span', { html: '&#8592;' }), ' SwineOS home'),
          h('div', h('h1', 'Data management'), h('p', 'Backups, Google Drive sync and imports for herd records and finances. One backup holds both.'))),
        h('div.dm-grid',
          card('Google Drive backup and sync', null, S.drive.pane()),
          h('div.dm-col',
            card('Records on file', null,
              h('h3', 'Herd Records'),
              row('Animals', `${animals.length} (${females.filter((a) => !removed(a)).length} females and ${animals.filter((a) => a.sex === 'M' && !removed(a)).length} boars in the herd)`),
              row('Events', events.toLocaleString('en-US')),
              row('Moved to Finisher', `${moves.length.toLocaleString('en-US')} groups, ${moves.reduce((n, r) => n + (r.head || 0), 0).toLocaleString('en-US')} pigs`),
              S.store.settings.demo ? h('p.demo-note', 'The herd on file is EXAMPLE data. Clear it before entering your own animals.') : null,
              h('h3', 'Finances'),
              row('Expenses', fin.filter((r) => r.kind === 'exp').length.toLocaleString('en-US') + ' records'),
              row('Income', fin.filter((r) => r.kind === 'inc').length.toLocaleString('en-US') + ' records'),
              row('Years', years.length ? (years.length > 1 ? `${years[0]} – ${years[years.length - 1]}` : years[0]) : ''),
              h('h3', 'Storage'),
              row('Saved in', st.backend === 'cloud' ? 'Shared online database' : 'This browser on this computer'),
              row('Last saved', saved ? U.fmtDT(saved) : ''),
              row('Last Google Drive backup', S.drive.configured() ? (S.drive.config.lastBackup ? U.fmtDT(S.drive.config.lastBackup) : 'not yet') : 'not connected')))),
        h('section.dm-card.dm-small',
          h('div.dm-small-head', h('h2', 'Import or backup'), h('span', 'A backup file holds every animal, event and finance record. Imports are usually done once. Point at a button for what it does.')),
          h('div.dm-minis',
            mini('Download backup file', 'Save a copy of every animal, event and finance record to this computer.', () => { ui().saveFile(`swineos-backup-${U.today()}.json`, S.store.exportJSON(), 'application/json'); S.safety.markDownload(); }),
            miniFile('Restore backup file…', 'Replaces the records now in SwineOS with a backup file (asks first).', '.json,.gz,application/json,application/gzip,.bdr,.BDR', (f) => S.settingsUI.restore(f, prog)),
            h('span.dm-sep', { 'aria-hidden': 'true' }),
            miniFile('PigWIN backup (.BDR)', 'Herd Records: every sow, boar and their history from PigWIN / PigLITTER. Replaces the herd now on file; finances are kept.', '.bdr,.BDR,.zip', (f) => S.settingsUI.importPigwin(f, prog)),
            miniFile('Animals (CSV)', 'Herd Records: adds new animals. Columns ID, Sex, Birth date, Arrival date, Entry date, Parity, Breed, Location.', '.csv,text/csv', (f) => S.settingsUI.importCsv(f, prog)),
            mini('Moved to Finisher (Excel)', 'Herd Records: the MOVED TO FINISHER sheet of the Expense & Income workbook (.xls or .xlsx).', () => S.finisher.importDialog(render)),
            mini('Expense & Income (Excel)', 'Finances: expenses, hog sales, cripples and cull sows & boars from the Excel workbook (.xls or .xlsx), one year or many.', () => S.finance.importDialog(render))),
          prog),
        recentChanges(),
        // start over: tucked away at the bottom, closed, and every delete must be typed out
        h('details.dm-danger',
          h('summary', 'Start over…'),
          h('p', 'Deletes records for good. Each one asks you to type DELETE first, and offers a backup file.'),
          h('div.dm-minis',
            mini('Clear herd records', 'Deletes every animal and event. Finances are kept.', clearHerd, '.danger'),
            mini('Clear finance records', 'Deletes every expense and income record. The herd is kept.', clearFinances, '.danger'))));
    }

    /** Change history: every change of the last two years, picked by dates, kind and words. */
    function recentChanges() {
      const f = histView;
      const all = S.store.state.log || [];
      const box = h('div.dm-hist-list');
      const count = h('span.dm-hist-count');
      const from = ui().dateInput('dm-h-from', f.from, { 'aria-label': 'From' });
      const to = ui().dateInput('dm-h-to', f.to, { 'aria-label': 'To' });
      const kind = ui().select('dm-h-kind', [['', 'All changes'], ...KINDS.map(([k, label]) => [k, label])], f.kind, { 'aria-label': 'Kind of change' });
      const q = h('input.dm-h-q', { type: 'search', placeholder: 'Search, e.g. a sow ID or SOYA', value: f.q, 'aria-label': 'Search the changes' });
      const read = () => { f.from = from.value || ''; f.to = to.value || ''; f.kind = kind.value; f.q = q.value; f.shown = 200; update(); };
      from.addEventListener('change', read); to.addEventListener('change', read); kind.addEventListener('change', read); q.addEventListener('input', U.debounce(read, 200));
      const quick = (label, days) => h('button.dm-mini', { type: 'button', onclick: () => {
        const t = U.today();
        f.to = t; f.from = days === 'year' ? `${t.slice(0, 4)}-01-01` : days ? U.addDays(t, -days) : '';
        from.value = f.from; to.value = f.to; f.shown = 200; update();
      } }, label);
      function rows() {
        const words = f.q.trim().toLowerCase();
        return all.filter((e) => { const day = toDay(e.t);
          return (!f.from || day >= f.from) && (!f.to || day <= f.to) && (!f.kind || kindOf(e.text) === f.kind) && (!words || e.text.toLowerCase().includes(words)); }).reverse();
      }
      function update() {
        const list = rows();
        box.innerHTML = '';
        const oldest = all.length ? toDay(all[0].t) : '';
        count.textContent = `${list.length.toLocaleString('en-US')} ${list.length === 1 ? 'change' : 'changes'}${oldest ? ` · history kept from ${U.fmt(oldest)}` : ''}`;
        if (!list.length) { box.appendChild(h('p.hint', all.length ? 'No changes match. Widen the dates or clear the search.' : 'Nothing yet.')); return; }
        const label = Object.fromEntries(KINDS);
        box.appendChild(h('table.dm-log', h('tbody', list.slice(0, f.shown).map((e) => { const k = kindOf(e.text);
          return h('tr', h('td', U.fmtDT(e.t)), h('td', h('span.dm-kind.k-' + k, label[k])), h('td', e.text)); }))));
        if (list.length > f.shown) box.appendChild(h('button.dm-mini.dm-more', { type: 'button', onclick: () => { f.shown += 500; update(); } }, `Show more (${(list.length - f.shown).toLocaleString('en-US')} older)`));
      }
      update();
      const csv = () => ui().saveFile(`swineos-change-history-${U.today()}.csv`, U.csv([['Date', 'Time', 'Kind', 'Change'], ...rows().map((e) => { const dt = new Date(e.t);
        return [toDay(e.t), dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), Object.fromEntries(KINDS)[kindOf(e.text)], e.text]; })]), 'text/csv');
      return h('section.dm-card',
        h('div.dm-hist-head', h('h2', 'Change history'), count),
        h('p.dm-sub', 'Every import, restore, entry, edit and deletion of the last two years. Pick the dates, the kind of change, or search.'),
        h('div.dm-hist-filters',
          h('label', h('span', 'From'), from), h('label', h('span', 'To'), to), h('label', h('span', 'Kind'), kind), h('label.dm-h-search', h('span', 'Search'), q)),
        h('div.dm-minis', quick('Last 30 days', 30), quick('Last 12 months', 365), quick('This year', 'year'), quick('Everything', 0),
          h('span.dm-sep', { 'aria-hidden': 'true' }), h('button.dm-mini', { type: 'button', onclick: csv, title: 'Save the changes shown as a CSV file for Excel' }, 'Download (CSV)')),
        box);
    }

    async function clearHerd() {
      const animals = S.store.animals();
      if (!animals.length) { ui().toast('There are no herd records.'); return; }
      const events = animals.reduce((n, a) => n + (a.events || []).length, 0);
      const ok = await guardedDelete({ title: 'Clear herd records', what: `every animal and event: ${animals.length.toLocaleString('en-US')} ${animals.length === 1 ? 'animal' : 'animals'} with ${events.toLocaleString('en-US')} ${events === 1 ? 'event' : 'events'}`,
        keeps: 'Finances, Moved to Finisher, settings and code lists are kept.' });
      if (ok) await S.settingsUI.clearAll(prog, true);
    }

    async function clearFinances() {
      const all = S.store.fin().filter((r) => r.kind === 'exp' || r.kind === 'inc');
      if (!all.length) { ui().toast('There are no finance records.'); return; }
      const yrs = [...new Set(all.map((r) => (r.date || '').slice(0, 4)).filter(Boolean))].sort();
      const total = (k) => all.filter((r) => r.kind === k).length.toLocaleString('en-US');
      const ok = await guardedDelete({ title: 'Clear finance records',
        what: `every expense and income record: ${total('exp')} expenses and ${total('inc')} income records${yrs.length ? `, ${yrs[0]}${yrs.length > 1 ? '–' + yrs[yrs.length - 1] : ''}` : ''}`,
        keeps: 'The herd records and Moved to Finisher are kept.' });
      if (!ok) return;
      await S.store.putFin([], all.map((r) => r.id));
      S.store.log(`Cleared ${all.length} finance records`);
      ui().toast('Finance records cleared.', 'ok');
      render();
    }

    render();
    win.refresh = render;
    return win;
  }

  /* the change history's filters stay while the page is open; it opens on the last 30 days */
  const histView = { from: '', to: '', kind: '', q: '', shown: 200 };
  (function () { const t = S.U.today(); histView.to = t; histView.from = S.U.addDays(t, -30); })();
  /** Kinds of change, from the wording of each log line. */
  const KINDS = [['herd', 'Herd entry'], ['finance', 'Finances'], ['import', 'Import'], ['backup', 'Backup / restore'], ['delete', 'Deleted'], ['settings', 'Settings'], ['other', 'Other']];
  function kindOf(text) {
    const t = String(text || '');
    if (/^Imported/.test(t)) return 'import';
    if (/^(Restored|Loaded)|backup/i.test(t)) return 'backup';
    if (/^(Cleared|Deleted)/.test(t)) return 'delete';
    if (/settings/i.test(t)) return 'settings';
    if (/expense|income|hog sale|cripple|cull sale|move to Finisher|finance/i.test(t)) return 'finance';
    if (/^(Entered|Edited|Action list entry)/.test(t)) return 'herd';
    return 'other';
  }
  /** A log time (ISO, UTC) -> the day on this computer's calendar. */
  function toDay(t) { const d = new Date(t); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }

  /** The gear on the landing page. */
  const gear = () => h('button.ld-gear.win-end', { type: 'button', title: 'Data management: backups, Google Drive, imports', 'aria-label': 'Data management', onclick: () => S.app.dataMgmt() },
    h('span', { html: GEAR }), h('span.ld-gear-l', 'Data'));

  S.dataMgmt = { open, gear };
})(window.SOS);
