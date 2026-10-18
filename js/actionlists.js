/* SwineOS – Action lists (the barn's daily/weekly work lists). */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  const REPORTS = [
    ['gilts', 'Gilts from', 'giltAge', 'days of age'],
    ['open', 'Open sows from', 'openDays', 'days open'],
    ['servicesLast', 'No. of services last', 'servicesLast', 'days'],
    ['heat3', 'Heat check at 3 weeks from', 'heat3', 'days gestation'],
    ['heat6', 'Heat check at 6 weeks from', 'heat6', 'days gestation'],
    ['preg1', 'Pregnancy check on', 'preg1', 'days'],
    ['preg2', 'Pregnancy check 2 on', 'preg2', 'days'],
    ['served', 'Sows served', 'served', 'days'],
    ['dueFarrow', 'Sows due to farrow next', 'dueFarrow', 'days'],
    ['wean', 'Sows to be weaned, litters from', 'weanLitters', 'days'],
    ['periodical', 'Periodical actions', null, ''],
  ];
  const QUICK = {
    Standard: null,
    Mating: ['gilts', 'open', 'servicesLast', 'heat3', 'heat6'],
    Farrowing: ['dueFarrow'],
    Weaning: ['wean'],
    Treatment: ['periodical'],
  };

  function build(cfg, from, to, locFilter) {
    const gest = S.store.settings.gestationLength;
    const females = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed && (!locFilter.length || locFilter.includes(A(a).location || '')));
    const sec = [];
    const add = (key, title, cols, rows, note) => sec.push({ key, title, cols, rows, note });
    const byId = (a, b) => U.natCmp(a.id, b.id);
    const on = cfg.on;

    if (on.gilts) {
      const rows = females.filter((a) => A(a).status === 'Gilt' && a.birthDate && U.diff(to, a.birthDate) >= cfg.giltAge).sort(byId)
        .map((a) => [a.id, A(a).location || '', U.fmt(a.birthDate), U.diff(U.today(), a.birthDate), U.fmt(a.entryDate)]);
      add('gilts', `Gilts from ${cfg.giltAge} days of age (not yet served)`, ['ID', 'Location', 'Birth date', 'Age', 'Entered'], rows);
    }
    if (on.open) {
      const rows = females.filter((a) => A(a).status === 'Open' && A(a).daysInStatus >= cfg.openDays).sort((a, b) => A(b).daysInStatus - A(a).daysInStatus)
        .map((a) => { const r = A(a); return [a.id, r.parity, r.location || '', U.fmt(r.statusDate), r.daysInStatus, r.lastWeanDate === r.statusDate ? 'Weaned' : 'Returned / neg.']; });
      add('open', `Open sows from ${cfg.openDays} days open`, ['ID', 'Par', 'Location', 'Open since', 'Days open', 'Reason'], rows);
    }
    if (on.servicesLast) {
      const rows = [];
      females.forEach((a) => { const r = A(a); r.services.forEach((s) => { if (U.diff(to, s.date) <= cfg.servicesLast && s.date <= to && s.serviceNo >= 2) rows.push([a.id, r.parity, U.fmt(s.date), s.serviceNo, s.boars.join(', '), r.status]); }); });
      add('servicesLast', `Repeat services in the last ${cfg.servicesLast} days`, ['ID', 'Par', 'Service date', 'Service no.', 'Boar(s)', 'Status now'], rows.sort((x, y) => U.natCmp(x[0], y[0])));
    }
    // served sows whose gestation day falls in [startDay, startDay + 14] at some day of the list period
    const servedWindow = (startDay) => females.filter((a) => A(a).status === 'Served').map((a) => ({ a, r: A(a) }))
      .filter((x) => U.diff(to, x.r.lastService.date) >= startDay && U.diff(from, x.r.lastService.date) <= startDay + 14);
    if (on.heat3) {
      const rows = servedWindow(cfg.heat3).sort((x, y) => byId(x.a, y.a)).map((x) => [x.a.id, x.r.parity, x.r.location || '', U.fmt(x.r.lastService.date), U.diff(to, x.r.lastService.date), x.r.lastService.boars.join(', ')]);
      add('heat3', `Heat check at 3 weeks – sows from ${cfg.heat3} days gestation`, ['ID', 'Par', 'Location', 'Served', 'Days', 'Boar(s)'], rows, 'Check for heat between day 18 and 24.');
    }
    if (on.heat6) {
      const rows = servedWindow(cfg.heat6).sort((x, y) => byId(x.a, y.a)).map((x) => [x.a.id, x.r.parity, x.r.location || '', U.fmt(x.r.lastService.date), U.diff(to, x.r.lastService.date), x.r.lastService.boars.join(', ')]);
      add('heat6', `Heat check at 6 weeks – sows from ${cfg.heat6} days gestation`, ['ID', 'Par', 'Location', 'Served', 'Days', 'Boar(s)'], rows);
    }
    const pregOn = (day, key, label) => {
      const rows = females.filter((a) => A(a).status === 'Served').map((a) => ({ a, r: A(a) })).filter((x) => { const due = U.addDays(x.r.lastService.date, day); return U.inRange(due, from, to) || (due < from && !x.r.lastService.pregCheck && U.diff(from, due) <= 7); })
        .filter((x) => !x.r.events.some((e) => e.type === 'preg' && e.date >= U.addDays(x.r.lastService.date, day - 7))).sort((x, y) => byId(x.a, y.a))
        .map((x) => [x.a.id, x.r.parity, x.r.location || '', U.fmt(x.r.lastService.date), U.fmt(U.addDays(x.r.lastService.date, day)), '☐ +   ☐ –']);
      add(key, `${label} (${day} days after service)`, ['ID', 'Par', 'Location', 'Served', 'Check on', 'Result'], rows);
    };
    if (on.preg1) pregOn(cfg.preg1, 'preg1', 'Pregnancy check');
    if (on.preg2) pregOn(cfg.preg2, 'preg2', 'Pregnancy check 2');
    if (on.served) {
      const rows = [];
      females.forEach((a) => { const r = A(a); r.services.forEach((s) => { if (U.diff(to, s.date) <= cfg.served && s.date <= to) rows.push([a.id, s.parity, U.fmt(s.date), s.matings, s.boars.join(', '), s.wsi ?? '', s.serviceNo > 1 ? 'Repeat' : s.isGilt ? 'Gilt' : 'Sow']); }); });
      add('served', `Sows served in the last ${cfg.served} days`, ['ID', 'Par', 'Service date', 'Matings', 'Boar(s)', 'WSI', 'Type'], rows.sort((x, y) => (x[2] < y[2] ? -1 : 1)));
    }
    if (on.dueFarrow) {
      const rows = females.filter((a) => A(a).status === 'Served').map((a) => ({ a, r: A(a), due: U.addDays(A(a).lastService.date, gest) }))
        .filter((x) => U.diff(x.due, from) <= cfg.dueFarrow && U.diff(x.r.lastService.date, U.addDays(from, -gest)) >= -10 && (x.r.lastService.pregCheck !== '-'))
        .sort((x, y) => (x.due < y.due ? -1 : x.due > y.due ? 1 : byId(x.a, y.a)))
        .map((x) => [x.a.id, x.r.parity + 1, x.r.location || '', U.fmt(x.r.lastService.date), U.fmt(x.due), U.diff(to, x.r.lastService.date), x.r.lastService.pregCheck === '+' ? 'Yes' : '?']);
      add('dueFarrow', `Sows due to farrow in the next ${cfg.dueFarrow} days`, ['ID', 'Next par', 'Location', 'Served', 'Due date', 'Gest. days', 'Preg +'], rows);
    }
    if (on.wean) {
      const rows = females.filter((a) => A(a).lactating && U.diff(to, A(a).currentLitter.farrowDate) >= cfg.weanLitters).map((a) => ({ a, r: A(a) }))
        .sort((x, y) => (x.r.currentLitter.farrowDate < y.r.currentLitter.farrowDate ? -1 : 1))
        .map((x) => [x.a.id, x.r.parity, x.r.location || '', U.fmt(x.r.currentLitter.farrowDate), U.diff(to, x.r.currentLitter.farrowDate), x.r.piglets, '']);
      add('wean', `Sows to be weaned – litters from ${cfg.weanLitters} days`, ['ID', 'Par', 'Location', 'Farrowed', 'Lact. days', 'Pigs', 'Weaned / weight'], rows);
    }
    if (on.periodical) {
      const due = S.reports.dueVaccinations(U.addDays(from, -3), to).filter((x) => !locFilter.length || locFilter.includes(x.r.location || ''));
      add('periodical', 'Periodical actions (vaccinations / treatments)', ['Due', 'Action', 'ID', 'Par', 'Status', 'Location', 'Done'], due.map((x) => [U.fmt(x.due), x.v.name, x.a.id, x.r.parity, x.r.status, x.r.location || '', '☐']));
    }
    return sec;
  }

  function render(sections, cfg, from, to) {
    const out = h('div.actionlist');
    out.appendChild(h('div.al-period', `Action lists for ${U.weekday(from)} ${U.fmt(from)} to ${U.weekday(to)} ${U.fmt(to)}`));
    sections.forEach((s) => {
      const extra = [];
      if (cfg.repeatSpace && ['heat3', 'heat6', 'open', 'gilts'].includes(s.key)) extra.push('Served / boar');
      if (cfg.remarksSpace) extra.push('Remarks');
      const cols = s.cols.concat(extra);
      const t = h('table.rtable.al-table', h('thead', h('tr', cols.map((c, i) => h('th', { class: i >= s.cols.length ? 'write' : null }, c)))), h('tbody', s.rows.length ? s.rows.map((r) => h('tr', r.concat(extra.map(() => '')).map((c, i) => h('td', { class: i >= s.cols.length ? 'write' : null }, String(c ?? ''))))) : h('tr', h('td.none', { colspan: cols.length }, 'None'))));
      out.appendChild(h('section.al-sec', h('h4', `${s.title}  (${s.rows.length})`), s.note ? h('div.al-note', s.note) : null, h('div.rtable-wrap', t)));
    });
    if (cfg.printCodes) {
      const L = S.store.settings.lists;
      out.appendChild(h('section.al-sec.codes', h('h4', 'Code list'),
        h('div.codes-grid',
          h('div', h('b', 'Piglet death causes'), h('ol', L.pigDeathCauses.map((c) => h('li', c)))),
          h('div', h('b', 'Cull reasons'), h('ol', L.cullReasons.map((c) => h('li', c)))),
          h('div', h('b', 'Death reasons'), h('ol', L.deathReasons.map((c) => h('li', c)))),
          h('div', h('b', 'Locations'), h('ol', L.locations.map((c) => h('li', c)))))));
    }
    return out;
  }

  function open() {
    const st = S.store.settings;
    const cfg = JSON.parse(JSON.stringify(st.actionLists));
    const last = cfg.lastPrinted || U.addDays(U.today(), -1);
    const from = ui().dateInput('al-from', U.addDays(last, 1));
    const to = ui().dateInput('al-to', U.addDays(U.addDays(last, 1), 6));
    const copies = ui().input('al-copies', 1, { type: 'number', min: 1, max: 9, style: { width: '48px' } });
    let locs = [];
    const locText = ui().input('al-loc', 'All', { disabled: true });
    const lastDay = h('span.al-wd', last ? U.weekday(last) : '');
    const fromDay = h('span.al-wd', U.weekday(from.value));
    from.addEventListener('change', () => { fromDay.textContent = U.weekday(from.value); if (to.value < from.value) to.value = U.addDays(from.value, 6); });

    const repRows = REPORTS.map(([key, label, valKey, unit]) => {
      const cb = h('input', { type: 'checkbox', id: 'al-on-' + key, checked: !!cfg.on[key], onchange: (e) => { cfg.on[key] = e.target.checked; } });
      const val = valKey ? h('input.al-num', { type: 'number', id: 'al-v-' + key, value: cfg[valKey], min: 0, max: 400, onchange: (e) => { cfg[valKey] = +e.target.value || 0; } }) : null;
      return h('div.al-rep', h('label.al-cb', cb, ' ', label), h('div.al-val', val, val ? h('span', ' ' + unit) : null));
    });
    const quick = h('div.al-quick', Object.keys(QUICK).map((q) => h('label', h('input', { type: 'radio', name: 'al-quick', onchange: () => {
      const keys = QUICK[q] || Object.keys(S.DEFAULT_SETTINGS.actionLists.on).filter((k) => S.DEFAULT_SETTINGS.actionLists.on[k]);
      REPORTS.forEach(([k]) => { cfg.on[k] = keys.includes(k); U.$('#al-on-' + k).checked = cfg.on[k]; });
    } }), ' ', q)));
    const opts = h('div.al-opts',
      h('label', h('input', { type: 'checkbox', checked: cfg.printCodes, onchange: (e) => { cfg.printCodes = e.target.checked; } }), ' Print code list'),
      h('label', h('input', { type: 'checkbox', checked: cfg.repeatSpace, onchange: (e) => { cfg.repeatSpace = e.target.checked; } }), ' Repeat service writing space'),
      h('label', h('input', { type: 'checkbox', checked: cfg.remarksSpace, onchange: (e) => { cfg.remarksSpace = e.target.checked; } }), ' Remarks writing space'));

    const body = h('div.al-dialog',
      h('fieldset', h('legend', 'Selection'),
        h('div.al-sel',
          h('span', 'Date last printed'), h('div', ui().dateInput('al-last', last, { disabled: true }), lastDay),
          h('span', 'From'), h('div', from, fromDay),
          h('span', 'to'), h('div', to, h('span.al-copies', copies, ' No. of copies')),
          h('span', 'Location'), h('div', locText, h('button.wbtn', { type: 'button', onclick: pickLoc }, 'Select...')),
          h('span', 'Current group'), h('div', ui().input('al-grp', 'All', { disabled: true }), h('button.wbtn', { type: 'button', disabled: true, title: 'Groups are not used on this farm' }, 'Select...')))),
      h('fieldset', h('legend', 'Options'),
        h('div.al-cols',
          h('div', h('div.al-colhead', 'Quick options'), quick),
          h('div.al-reps', h('div.al-colhead.two', h('span', 'Reports'), h('span', 'Selection')), repRows),
          h('div', h('div.al-colhead', 'Options'), opts))));

    function pickLoc() {
      const L = S.store.settings.lists.locations;
      const boxes = L.map((l) => h('label.blk', h('input', { type: 'checkbox', value: l, checked: locs.includes(l) }), ' ', l));
      ui().modal({ title: 'Select location', body: h('div.loc-pick', boxes), width: 340, buttons: [
        { label: 'OK', primary: true, onClick: () => { locs = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value); locText.value = locs.length ? locs.join(', ') : 'All'; } },
        { label: 'All', onClick: () => { locs = []; locText.value = 'All'; } },
        { label: 'Cancel' },
      ] });
    }
    const preview = (markPrinted) => {
      const secs = build(cfg, from.value, to.value, locs);
      const node = render(secs, cfg, from.value, to.value);
      const m = ui().printPreview('Action lists', node);
      if (markPrinted) { /* nothing */ }
      return m;
    };
    ui().modal({ title: 'Action lists', body, width: 900, cls: 'al-modal', buttons: [
      { label: 'Settings', onClick: () => { S.settingsUI.open('actions'); } },
      { label: 'Preview', right: true, primary: true, manual: true, onClick: () => { preview(false); return true; } },
      { label: 'Print', manual: true, cls: 'print-btn', onClick: async () => {
        cfg.lastPrinted = to.value;
        cfg.history = [...new Set([...(cfg.history || []), from.value])].slice(-30);
        await S.store.saveSettings({ ...S.store.settings, actionLists: cfg });
        lastDay.textContent = U.weekday(to.value);
        U.$('#al-last').value = to.value;
        preview(true);
        setTimeout(() => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }, 300);
        return true;
      } },
      { label: 'Cancel', onClick: async () => { await S.store.saveSettings({ ...S.store.settings, actionLists: { ...cfg, lastPrinted: S.store.settings.actionLists.lastPrinted } }); } },
    ] });
  }

  S.actionLists = { open, build, render };
})(window.SOS);
