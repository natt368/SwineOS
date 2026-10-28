/* SwineOS – Data management: Google Drive backup and sync, backup files, imports and what is on file,
 * for herd records and finances alike. Opened from the gear on the landing page. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;

  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  const card = (title, sub, ...kids) => h('section.dm-card', h('h2', title), sub ? h('p.dm-sub', sub) : null, ...kids);
  const row = (k, v) => h('div.dm-row', h('span', k), h('b', v === '' || v === undefined || v === null ? '–' : String(v)));
  const action = (label, sub, onclick, cls = '') => h('button.dm-act' + cls, { type: 'button', onclick }, h('b', label), sub ? h('small', sub) : null);
  const fileAction = (label, sub, accept, onfile, cls = '') => h('label.dm-act' + cls, h('b', label), sub ? h('small', sub) : null,
    h('input', { type: 'file', accept, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onfile(f); } }));
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
              h('h3', 'Herd records'),
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
              row('Last Google Drive backup', S.drive.configured() ? (S.drive.config.lastBackup ? U.fmtDT(S.drive.config.lastBackup) : 'not yet') : 'not connected')),
            card('Backup files', 'A backup file holds every animal, event and finance record.',
              h('div.dm-acts',
                action('Download backup file', 'Save a copy to this computer', () => { ui().saveFile(`swineos-backup-${U.today()}.json`, S.store.exportJSON(), 'application/json'); S.safety.markDownload(); }),
                fileAction('Restore backup file…', 'Replaces the records now in SwineOS', '.json,.gz,application/json,application/gzip,.bdr,.BDR', (f) => S.settingsUI.restore(f, prog)))))),
        h('section.dm-card.dm-small',
          h('div.dm-small-head', h('h2', 'Import'), h('span', 'Usually done once, when moving from PigWIN or Excel. Point at a button for what it reads.')),
          h('div.dm-minis',
            miniFile('PigWIN backup (.BDR)', 'Herd records: every sow, boar and their history from PigWIN / PigLITTER. Replaces the herd now on file; finances are kept.', '.bdr,.BDR,.zip', (f) => S.settingsUI.importPigwin(f, prog)),
            miniFile('Animals (CSV)', 'Herd records: adds new animals. Columns ID, Sex, Birth date, Arrival date, Entry date, Parity, Breed, Location.', '.csv,text/csv', (f) => S.settingsUI.importCsv(f, prog)),
            mini('Moved to Finisher (Excel)', 'Herd records: the MOVED TO FINISHER sheet of the Expense & Income workbook (.xls or .xlsx).', () => S.finisher.importDialog(render)),
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

    function recentChanges() {
      const log = (S.store.state.log || []).slice(-25).reverse();
      return card('Recent changes', 'Imports, restores, backups and other changes to the data.',
        log.length ? h('table.dm-log', h('tbody', log.map((e) => h('tr', h('td', U.fmtDT(e.t)), h('td', e.text))))) : h('p.hint', 'Nothing yet.'));
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

  /** The gear on the landing page. */
  const gear = () => h('button.ld-gear.win-end', { type: 'button', title: 'Data management: backups, Google Drive, imports', 'aria-label': 'Data management', onclick: () => S.app.dataMgmt() },
    h('span', { html: GEAR }), h('span.ld-gear-l', 'Data'));

  S.dataMgmt = { open, gear };
})(window.SOS);
