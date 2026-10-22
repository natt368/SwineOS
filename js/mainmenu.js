/* SwineOS – main menu (data entry / reports launcher) and the PigMAIN set-up window. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  function bottomBar(active) {
    const b = (ic, label, fn, on) => h('button.tb-btn' + (on ? '.active' : ''), { type: 'button', onclick: fn }, ui().icon(ic), h('span', label));
    return h('div.toolbar.main-bottom',
      b('sow', 'SwineOS home', () => S.app.landing(), active === 'litter'),
      b('backup', 'PigMAIN', () => S.app.show(pigMain), active === 'main'),
      b('find', 'Selfservice', selfService),
      b('help', 'Help', () => S.app.help('home')));
  }

  /** Herd records main menu: Data entry and Reports tiles, licence / farm tile and the SwineOS tile. */
  function home() {
    const st = S.store.settings;
    const o = st.owner || {};
    const win = h('section.win.home-win');
    win.appendChild(h('div.win-title', h('span.win-name', `SwineOS – Herd records  -  [${st.farmNumber} ${st.farmName}]`)));
    const pill = (label, fn, opts = {}) => h('button.pill' + (opts.disabled ? '.disabled' : ''), { type: 'button', disabled: opts.disabled, title: opts.title || label, onclick: fn },
      opts.icon ? h('span.pill-ico', { html: ui().ICONS[opts.icon] || '' }) : null, h('span', label));
    const fem = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed);
    const c = (s) => fem.filter((a) => A(a).status === s).length;
    const gest = st.gestationLength;
    const due7 = fem.filter((a) => A(a).status === 'Served' && U.diff(U.addDays(A(a).lastService.date, gest), U.today()) <= 7).length;
    const wean = fem.filter((a) => A(a).lactating && U.diff(U.today(), A(a).currentLitter.farrowDate) >= st.targetLactation).length;
    const kpi = (label, v, fn) => h('button.mini-kpi', { type: 'button', onclick: fn }, h('b', String(v)), h('span', label));
    const tileHead = (title, sub) => h('header.mm2-head', h('h2', title), sub ? h('p', sub) : null);
    win.appendChild(h('div.mm2-body',
      h('section.mm2-tile.mm2-main.mm2-entry',
        tileHead('Data Entry', 'Record what happens in the barn'),
        h('div.pills',
          pill('Sows / Boars', () => S.app.entry()),
          pill('Gilt pool', () => S.app.show(S.entry.openGiltPool)),
          pill('Action list entry', () => S.app.show(S.actionEntry.open)),
          pill('Vaccinations', () => S.app.show(S.reports.vaccinationsEntry)),
          pill('PigPAD', null, { disabled: true, title: 'Handheld entry is not available' }),
          pill('More options', moreOptions))),
      h('section.mm2-tile.mm2-main.mm2-reports',
        tileHead('Reports', 'Herd results, lists and cards'),
        h('div.pills',
          pill('Sows / Gilts', () => S.app.reports('sows')),
          pill('Piglets', () => S.app.reports('piglets')),
          pill('Boars', () => S.app.reports('boars')),
          pill('Sow cards', () => S.sowCard.open()),
          pill('Herd performance', () => S.app.show(S.reports.herdPerformance)),
          pill('Action lists', () => S.actionLists.open()),
          pill('Report generator', () => S.reportGen.open()))),
      h('div.mm2-side',
        h('section.mm2-tile.mm2-small.mm2-lic',
          tileHead('Licence and farm'),
          h('dl.mm2-dl',
            h('dt', 'Licensed to'), h('dd', [o.license ? 'Licence: ' + o.license : null, o.name, o.address, o.city].filter(Boolean).join(' · ') || '–'),
            h('dt', 'Farm'), h('dd', `${st.farmNumber || ''} ${st.farmName || ''}`.trim() || '–'),
            S.drive.available() ? h('dt', 'Google Drive folder') : null,
            S.drive.available() ? h('dd', h('button.mm-link', { type: 'button', onclick: () => S.settingsUI.open('drive') },
              S.drive.configured() ? `${S.drive.folderLabel()}${S.drive.config.email ? '  (' + S.drive.config.email + ')' : ''}` : 'Not connected – click to connect')) : null),
          h('div.mm-kpis',
            kpi('breeding females', fem.length, () => S.app.entry('Current')), kpi('served', c('Served'), () => S.app.entry('Served')),
            kpi('lactating', c('Lactating'), () => S.app.entry('Lactating')), kpi('open / gilts', c('Open') + c('Gilt'), () => S.app.entry('Open')),
            kpi('due ≤ 7 d or overdue', due7, () => S.actionLists.open()), kpi('ready to wean', wean, () => S.actionLists.open()))),
        h('section.mm2-tile.mm2-small.mm2-nav',
          tileHead('SwineOS'),
          h('div.pills.pills-sm',
            pill('SwineOS home', () => S.app.landing(), { icon: 'sow' }),
            pill('PigMAIN', () => S.app.show(pigMain), { icon: 'backup' }),
            pill('Selfservice', selfService, { icon: 'find' }),
            pill('Help', () => S.app.help('home'), { icon: 'help' }))))));
    return win;
  }

  function moreOptions() {
    const m = ui().modal({ title: 'More options', width: 420, body: h('div.btn-col',
      ...[['Settings', () => S.settingsUI.open('farm')], ['Import PigWIN backup (.BDR)…', () => S.settingsUI.open('data')], ['Backup / restore', () => S.settingsUI.open('data')],
        ['Code lists', () => S.settingsUI.open('codes')], ['Vaccination schedule', () => S.settingsUI.open('vacc')], ['Targets', () => S.settingsUI.open('targets')],
        ['Export data', () => S.reports.exportData()], ['Change log', () => S.app.show(S.reports.logReport)], ['Check data (Selfservice)', selfService], ['Set-up options (PigMAIN)', () => S.app.show(pigMain)]]
        .map(([l, fn]) => h('button.wbtn', { type: 'button', onclick: () => { m.close(); fn(); } }, l))), buttons: [{ label: 'Close', primary: true }] });
  }

  /* ---------- PigMAIN: set-up options ---------- */
  function pigMain(tab = 'comm') {
    const win = ui().appWindow({ title: 'PigMAIN', cls: 'pigmain-win', toolbar: [
      { icon: 'find', label: 'Select farm', onClick: () => ui().alertBox('Select farm', `This copy of SwineOS holds one farm: ${S.store.settings.farmNumber} ${S.store.settings.farmName}. To keep another farm, open SwineOS in another browser profile or use a separate copy of the app.`) },
      { icon: 'backup', label: 'Backup farm data', onClick: () => S.settingsUI.open('data') },
      { icon: 'sow', label: 'SwineOS settings', onClick: () => S.settingsUI.open('farm') },
      { icon: 'settings', label: 'Set-up options', active: true, onClick: () => S.app.show(() => pigMain(tab)) },
      { icon: 'info', label: 'License', onClick: licenseDialog },
    ] });
    const tabs = [['comm', 'Communications Settings'], ['maint', 'Farm data maintenance'], ['net', 'Internet'], ['util', 'Utilities']];
    const head = h('div.pm-head', h('div.pm-title', 'Set-up options'),
      h('div.pm-tabs', tabs.map(([k, l]) => h('button.pm-tab' + (k === tab ? '.active' : ''), { type: 'button', onclick: () => S.app.show(() => pigMain(k)) }, l))));
    const row = (label, desc, fn) => h('div.pm-row', h('button.red-btn', { type: 'button', onclick: fn }, label), h('span', desc));
    let body;
    if (tab === 'comm') {
      body = [h('h2', 'Settings'),
        row('Farm', 'Owner, farm name and number, weight unit, first day of week', farmDialog),
        row('Personal', 'Font size and button style on this computer', personalDialog),
        row('Program', 'Backup farm, restore settings', () => S.settingsUI.open('data')),
        row('Language settings', 'Change language settings', () => ui().alertBox('Language settings', 'SwineOS is available in English. Dates are shown as month/day/year.')),
        row('Printer appearance', 'Set printer and page layout for reports', printDialog),
        row('Page settings', 'Page settings', printDialog)];
    } else if (tab === 'maint') {
      body = [h('h2', 'Farm data maintenance'),
        row('Import PigWIN backup', 'Load a .BDR farm backup from PigWIN / PigLITTER', () => S.settingsUI.open('data')),
        row('Restore backup', 'Restore a SwineOS backup file', () => S.settingsUI.open('data')),
        row('Code lists', 'Locations, breeds, cull and death reasons, piglet death causes, treatments', () => S.settingsUI.open('codes')),
        row('Vaccination schedule', 'Periodical actions shown on the action lists', () => S.settingsUI.open('vacc')),
        row('Targets', 'Targets used in Herd performance and Benchmarking', () => S.settingsUI.open('targets')),
        row('Check data', 'List records that look wrong or incomplete', selfService)];
    } else if (tab === 'net') {
      const cloud = S.store.state.backend === 'cloud';
      body = [h('h2', 'Internet'),
        h('p.pm-text', cloud ? 'Records are saved in the shared online database. Every computer and phone that opens this app link sees the same herd, and changes appear on the others within seconds.' : 'Records are saved in this web browser on this computer only. To use SwineOS on several computers with one shared herd, open it from the claude.ai link, or move data with Backup farm data / Restore.'),
        row('Google Drive', 'Automatic backups to a Google Drive folder, loaded again when SwineOS opens', () => S.settingsUI.open('drive')),
        row('Backup farm data', 'Download a backup file of every animal and event', () => S.settingsUI.open('data'))];
    } else {
      body = [h('h2', 'Utilities'),
        row('Export data', 'Animals, events and litters as CSV files for Excel', () => S.reports.exportData()),
        row('Change log', 'Who changed what, most recent first', () => S.app.show(S.reports.logReport)),
        row('Check data', 'List records that look wrong or incomplete', selfService),
        row('Report generator', 'Your own saved lists and reports', () => S.reportGen.open())];
    }
    win.appendChild(head);
    win.appendChild(h('div.pm-body', body));
    win.appendChild(bottomBar('main'));
    return win;
  }

  function licenseDialog() {
    const st = S.store.settings; const o = st.owner || {};
    ui().modal({ title: 'License', width: 460, body: h('div',
      h('p', 'This software is licensed to:'),
      h('div.details-sum', [o.license ? 'License : ' + o.license : null, o.name, o.address, o.city].filter(Boolean).map((l) => h('div', l)).concat(o.name ? [] : [h('div', 'No owner entered. Use Set-up options → Farm.')])),
      h('p', `Currently selected farm: ${st.farmNumber} ${st.farmName}`)), buttons: [{ label: 'Edit…', onClick: farmDialog }, { label: 'Close', primary: true }] });
  }

  function farmDialog() {
    const s = JSON.parse(JSON.stringify(S.store.settings));
    s.owner = s.owner || {};
    const f = (label, obj, key, attrs) => ui().field(label, h('input', { value: obj[key] ?? '', ...attrs, onchange: (e) => { obj[key] = attrs && attrs.type === 'number' ? +e.target.value : e.target.value; } }));
    ui().modal({ title: 'Farm', width: 560, body: h('div.form',
      f('Farm name', s, 'farmName'), f('Farm number', s, 'farmNumber'),
      f('Owner / company', s.owner, 'name'), f('Address', s.owner, 'address'), f('Postal code, place', s.owner, 'city'), f('License no.', s.owner, 'license'),
      ui().field('Weight unit', ui().select('fm-wu', [['kg', 'Kilograms'], ['lb', 'Pounds']], s.weightUnit || 'kg', { onchange: (e) => { s.weightUnit = e.target.value; } })),
      ui().field('First day of week', ui().select('fm-fdw', [['1', 'Monday'], ['0', 'Sunday']], String(s.firstDayOfWeek ?? 1), { onchange: (e) => { s.firstDayOfWeek = +e.target.value; } })),
      f('Gestation length (days)', s, 'gestationLength', { type: 'number', min: 105, max: 125 })),
    buttons: [{ label: 'OK', primary: true, onClick: async () => { await S.store.saveSettings(s); S.model.resetCache(); ui().toast('Farm settings saved.', 'ok'); S.app.rerender(); } }, { label: 'Cancel' }] });
  }

  function personalDialog() {
    let scale = 1;
    try { scale = +(localStorage.getItem('swineos.scale') || 1); } catch (e) { /* storage blocked */ }
    const sel = ui().select('ps-scale', [['0.9', 'Small'], ['1', 'Normal'], ['1.15', 'Large'], ['1.3', 'Extra large']], String(scale));
    ui().modal({ title: 'Personal', width: 420, body: h('div.form', ui().field('Font size', sel), h('p.hint', 'Saved on this computer only.')),
      buttons: [{ label: 'OK', primary: true, onClick: () => { try { localStorage.setItem('swineos.scale', sel.value); } catch (e) { /* storage blocked */ } applyScale(); } }, { label: 'Cancel' }] });
  }
  function applyScale() {
    let scale = 1;
    try { scale = +(localStorage.getItem('swineos.scale') || 1); } catch (e) { /* storage blocked */ }
    document.documentElement.style.setProperty('--app-zoom', scale);
    const app = U.$('#app'); if (app) app.style.zoom = scale === 1 ? '' : scale;
  }

  function printDialog() {
    const s = JSON.parse(JSON.stringify(S.store.settings));
    s.print = s.print || { orientation: 'portrait', margin: 12 };
    ui().modal({ title: 'Printer appearance / page settings', width: 440, body: h('div.form',
      ui().field('Orientation', ui().select('pr-or', [['portrait', 'Portrait'], ['landscape', 'Landscape']], s.print.orientation, { onchange: (e) => { s.print.orientation = e.target.value; } })),
      ui().field('Margins (mm)', h('input', { type: 'number', min: 5, max: 30, value: s.print.margin, onchange: (e) => { s.print.margin = +e.target.value; } })),
      h('p.hint', 'Used by Print in every report.')),
    buttons: [{ label: 'OK', primary: true, onClick: async () => { await S.store.saveSettings(s); applyPrint(); } }, { label: 'Cancel' }] });
  }
  function applyPrint() {
    const p = (S.store.settings && S.store.settings.print) || { orientation: 'portrait', margin: 12 };
    let el = document.getElementById('print-page-style');
    if (!el) { el = document.createElement('style'); el.id = 'print-page-style'; document.head.appendChild(el); }
    el.textContent = `@page { size: ${p.orientation}; margin: ${p.margin}mm; }`;
  }

  /* ---------- Selfservice: data checks ---------- */
  function selfService() {
    const gest = S.store.settings.gestationLength;
    const today = U.today();
    const rows = [];
    for (const a of S.store.animals()) {
      const r = A(a);
      if (r.removed) continue;
      if (a.sex === 'F') {
        if (r.status === 'Served' && r.lastService && U.diff(today, r.lastService.date) > gest + 10) rows.push([a.id, 'Served ' + U.diff(today, r.lastService.date) + ' days ago, no farrowing or check recorded']);
        if (r.lactating && U.diff(today, r.currentLitter.farrowDate) > 45) rows.push([a.id, 'Lactating for ' + U.diff(today, r.currentLitter.farrowDate) + ' days, weaning not recorded']);
        if (r.status === 'Open' && r.daysInStatus > 60) rows.push([a.id, 'Open for ' + r.daysInStatus + ' days']);
        if (r.status === 'Gilt' && r.ageDays > 330) rows.push([a.id, 'Gilt ' + r.ageDays + ' days old, never served']);
        if (!a.birthDate) rows.push([a.id, 'No birth date']);
      }
      r.litters.forEach((l) => { if (l.gestLen && (l.gestLen < 105 || l.gestLen > 125)) rows.push([a.id, `Gestation ${l.gestLen} days for farrowing on ${U.fmt(l.farrowDate)}`]); });
    }
    const t = S.reports.table(['Animal', 'Check'], rows);
    ui().modal({ title: 'Selfservice – check data', width: 760, body: h('div', h('div.vsum', rows.length ? `${rows.length} records to check (active animals only).` : 'No problems found.'), t), buttons: [
      { label: 'Export CSV', onClick: () => { ui().saveFile('data-check.csv', U.csv(t.csv), 'text/csv'); return true; } }, { label: 'Close', primary: true }] });
  }

  S.mainMenu = { home, pigMain, selfService, applyScale, applyPrint };
})(window.SOS);
