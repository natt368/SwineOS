/* SwineOS – Sow card window (one sow's card, selection lists, quick due/mating picks). */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  const SELECTIONS = [
    ['active', '*Active sows'], ['served', 'Served sows'], ['lactating', 'Lactating sows'], ['open', 'Open sows'],
    ['gilts', 'Gilts'], ['removed', 'Removed sows'], ['all', 'All sows'],
  ];
  // PigWIN's Filter type list; date-based ones use the From – To dates
  const FILTERS = [['all', 'All'], ['active', 'Sows active'], ['removed', 'Sows removed'], ['giltsServe', 'Gilts to be served'], ['open', 'Open'],
    ['heat3', 'Heat check at 3 weeks'], ['heat6', 'Heat check at 6 weeks'], ['preg', 'Pregnancy check'], ['served', 'Sows served'], ['due', 'Sows due to farrow'], ['wean', 'Sows to be weaned']];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayDate = (iso) => (iso ? `${DAY[new Date(iso + 'T12:00:00').getDay()]}:${U.fmt(iso)}` : '');
  const mgroup = (iso) => U.matingGroup(iso);

  /** Card history rows in the old program's style. */
  function cardRows(a) {
    const r = A(a);
    const gest = S.store.settings.gestationLength;
    const gap = S.store.settings.serviceWindowDays || 6;
    const rows = [];
    if (a.birthDate) rows.push({ par: 0, date: a.birthDate, interval: '', event: 'Birth', n: '', rem: '' });
    if (a.arrivalDate) rows.push({ par: Number(a.entryParity) || 0, date: a.arrivalDate, interval: a.birthDate ? U.diff(a.arrivalDate, a.birthDate) : '', event: 'Arrival', n: '', rem: a.origin || '' });
    if (a.entryDate) rows.push({ par: Number(a.entryParity) || 0, date: a.entryDate, interval: '', event: 'Herd entry', n: '', rem: '' });
    let par = Number(a.entryParity) || 0;
    let lastWean = null; let lastSvc = null; let lastFarrow = null; let prevMate = null;
    for (const e of r.events) {
      const row = { par, date: e.date, interval: '', event: (S.EVENTS[e.type] || {}).label || e.type, n: '', rem: [S.entry.describe(e), e.remarks].filter(Boolean).join(' – '), type: e.type, ev: e };
      if (e.type === 'mate') {
        const repeatMating = prevMate && lastSvc && U.diff(e.date, lastSvc) <= gap;
        prevMate = e.date;
        if (repeatMating) { row.interval = U.diff(e.date, lastSvc); }
        else {
          row.interval = lastWean && (!lastSvc || lastSvc < lastWean) ? U.diff(e.date, lastWean) : lastSvc ? U.diff(e.date, lastSvc) : a.birthDate ? U.diff(e.date, a.birthDate) : '';
          lastSvc = e.date;
        }
        row.n = mgroup(lastSvc);
        row.rem = `Boar: ${e.boar || '–'}  Due: ${U.fmt(U.addDays(lastSvc, gest))}` + (e.tech ? `  Staff: ${e.tech}` : '') + (e.method && !/^AI$/i.test(e.method) ? `  ${e.method}` : '') + (e.remarks ? '  ' + e.remarks : '');
      } else if (e.type === 'farrow') {
        par++;
        row.par = par;
        row.interval = lastSvc ? U.diff(e.date, lastSvc) : '';
        row.event = 'Farrowing details';
        row.n = e.liveBorn ?? '';
        row.rem = `BD ${e.stillborn || 0}  BM ${e.mummies || 0}` + (e.birthWeight ? `  Wt ${e.birthWeight}` : '') + (e.location ? '  ' + e.location : '') + (e.remarks ? '  ' + e.remarks : '');
        lastFarrow = e.date;
      } else if (e.type === 'wean' || e.type === 'partwean') {
        row.interval = lastFarrow ? U.diff(e.date, lastFarrow) : '';
        row.n = e.count ?? '';
        if (e.type === 'wean') lastWean = e.date;
      } else if (['preg', 'heat', 'abort'].includes(e.type)) {
        row.interval = lastSvc ? U.diff(e.date, lastSvc) : '';
      } else if (['pigdeath', 'foster', 'nurse'].includes(e.type)) {
        row.interval = lastFarrow ? U.diff(e.date, lastFarrow) : '';
        row.n = e.count ?? '';
      }
      rows.push(row);
    }
    return rows;
  }

  function stats(a) {
    const r = A(a);
    const L = r.litters;
    const v = (l) => ({
      fi: l.prevFarrowDate ? U.diff(l.farrowDate, l.prevFarrowDate) : NaN, gest: l.gestLen ?? NaN, ba: l.liveBorn, bd: l.stillborn, mm: l.mummies,
      deaths: l.deaths, foster: l.fosterIn - l.fosterOut, weaned: l.weanDate ? l.weaned : (r.currentLitter === l ? 0 : NaN),
    });
    const vals = L.map(v);
    const keys = ['fi', 'gest', 'ba', 'bd', 'mm', 'deaths', 'foster', 'weaned'];
    const avg = {}; keys.forEach((k) => { avg[k] = U.avg(vals.map((x) => x[k])); });
    return { avg, last: L.length ? vals[vals.length - 1] : null, keys };
  }

  /* ---------- printed sow card (PigWIN layout, two per letter page) ---------- */
  const PW_CSS = `
.pw-cards { display: block; }
.pw { width: 7.5in; height: 4.9in; box-sizing: border-box; padding: 0.06in 0.1in 0.04in; margin: 0 auto 0.2in; background: #fff; color: #000;
  font: 7pt/1.15 Arial, Helvetica, sans-serif; display: flex; flex-direction: column; gap: 0.05in; break-inside: avoid; page-break-inside: avoid; }
.pw table { border-collapse: collapse; width: 100%; height: 100%; table-layout: fixed; }
.pw td, .pw th { border: 1px solid #000; padding: 0 2px; overflow: hidden; white-space: nowrap; vertical-align: middle; font-weight: normal; }
.pw th { font-size: 6.3pt; letter-spacing: .02em; text-align: center; line-height: 1.05; white-space: normal; }
.pw-top { display: flex; align-items: flex-end; height: 0.5in; flex: none; }
.pw-id { font: bold 34pt/1 Arial, sans-serif; margin-left: 0.3in; flex: 1; letter-spacing: -.01em; }
.pw-farm { text-align: right; font: bold 9pt/1.35 Arial, sans-serif; margin-right: 0.06in; }
.pw-logo { width: 0.62in; text-align: center; font: bold 7pt Arial, sans-serif; color: #2e8b2e; }
.pw-logo svg { width: 0.55in; height: 0.3in; display: block; margin: 0 auto -1px; }
.pw-row { display: flex; gap: 0.04in; flex: none; }
.pw-lbl { width: 0.2in; flex: none; writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; font: 10.5pt Arial, sans-serif; letter-spacing: .03em; white-space: nowrap; }
.pw-r1 { height: 1.36in; }
.pw-farrow { flex: 1; }
.pw-farrow td.big { font: bold 12pt Arial, sans-serif; text-align: center; }
.pw-farrow td.rl { font-size: 6.6pt; text-align: center; white-space: normal; line-height: 1.05; }
.pw-farrow td.sub { font-size: 6.6pt; text-align: center; vertical-align: top; }
.pw-info { width: 2.0in; flex: none; }
.pw-info td { text-align: center; vertical-align: top; font-size: 6.3pt; line-height: 1.1; padding-top: 1px; }
.pw-info td b { display: block; font: bold 8.5pt Arial, sans-serif; margin-top: 1px; }
.pw-r2 { height: 1.02in; }
.pw-r2 th, .pw-r3 th { height: 0.15in; }
.pw-lbl.sm { font-size: 8.5pt; }
.pw-r3 { height: 1.12in; }
.pw-box { flex: 1; display: flex; gap: 0.03in; min-width: 0; }
.pw-box.wide { flex: 1.25; }
.pw-hist td { font-size: 6.4pt; padding: 0 2px; line-height: 1.1; }
.pw-hist td.n { text-align: right; }
.pw-hist th { font-size: 6.3pt; }
.pw-foot { height: 0.36in; flex: none; margin-left: 0.24in; }
.pw-foot td { text-align: center; font-size: 6.6pt; line-height: 1.15; letter-spacing: .02em; }
.pw-foot td b { display: block; font: bold 8.5pt Arial, sans-serif; letter-spacing: 0; }
@media print {
  @page { size: letter portrait; margin: 0.35in 0.5in; }
  .pw { margin: 0 auto; }
  .pw:nth-child(2n) { break-after: page; page-break-after: always; margin-top: 0.25in; }
  .pw:last-child { break-after: auto; page-break-after: auto; }
  .print-sheet.bare { padding: 0 !important; }
}`;
  (function injectCss() { if (typeof document === 'undefined' || document.getElementById('pw-css')) return; const st = document.createElement('style'); st.id = 'pw-css'; st.textContent = PW_CSS; document.head.appendChild(st); })();
  const PIG_SVG = '<svg viewBox="0 0 60 34" aria-hidden="true"><path d="M8 18c-3-1-6 1-5 4" fill="none" stroke="#c8607e" stroke-width="1.6"/><ellipse cx="26" cy="18" rx="17" ry="10.5" fill="#f6adc0" stroke="#c8607e" stroke-width="1.4"/><circle cx="42" cy="15" r="8" fill="#f6adc0" stroke="#c8607e" stroke-width="1.4"/><path d="M38 8l2-6 4 5z" fill="#ef8fa8" stroke="#c8607e" stroke-width="1.2"/><ellipse cx="49" cy="17" rx="3.6" ry="3.2" fill="#ef8fa8" stroke="#c8607e" stroke-width="1.2"/><circle cx="44" cy="13" r="1" fill="#3b2430"/><path d="M15 27v5M21 28v5M31 28v5M37 26v5" stroke="#c8607e" stroke-width="2.6" stroke-linecap="round"/></svg>';

  /** One printed sow card. data=false gives an empty card to fill in by hand. */
  function card(a, data = true) {
    const T = (rows, cls) => h('table' + (cls ? '.' + cls : ''), h('tbody', rows));
    const blankRows = (n, cols) => Array.from({ length: n }, () => h('tr', Array.from({ length: cols }, () => h('td', ' '))));
    const now = new Date();
    const r = data && a ? A(a) : null;
    const gest = S.store.settings.gestationLength;
    const s = r ? stats(a) : null;
    const f0 = (v) => (Number.isFinite(v) ? U.num(v, 0) : ''); const f1 = (v) => (Number.isFinite(v) ? U.num(v, 1) : '');
    const keys = ['fi', 'gest', 'ba', 'bd', 'mm', 'deaths', 'foster', 'weaned'];
    const avgCells = keys.map((k) => h('td.big', s ? (['fi', 'gest'].includes(k) ? f0(s.avg[k]) : f1(s.avg[k])) : ''));
    const lastCells = keys.map((k) => h('td.big', s && s.last ? f0(s.last[k]) : ''));
    const cur = r && r.currentLitter;
    const svc = r && r.lastService;
    const svcN = svc ? r.services.filter((x) => x.parity === svc.parity).length : '';
    const due = r && r.status === 'Served' && svc ? U.addDays(svc.date, gest) : '';

    const head = h('div.pw-top',
      h('div.pw-id', data && a ? a.id : ''),
      h('div.pw-farm', h('div', `${S.store.settings.farmNumber || ''} ${S.store.settings.farmName || ''}`.trim()), h('div', U.fmtDT(now))),
      h('div.pw-logo', { html: PIG_SVG + 'SwineOS' }));

    const farrow = T([
      h('tr', h('th', ''), ['FARROWING INTERVAL', 'GESTATION LENGTH', 'BORN ALIVE', 'BORN DEAD', 'BORN MUMMIFIED', 'PIG DEATHS', 'NET FOSTER', 'PIGS WEANED'].map((t) => h('th', t))),
      h('tr', h('td.rl', 'LIFETIME AVERAGE'), avgCells),
      h('tr', h('td.rl', 'LAST LITTER'), lastCells),
      h('tr', h('td.sub', 'THIS LITTER'), h('td.sub', { colspan: 2 }, 'FARROWING DATE', cur ? h('div', { style: { font: 'bold 9pt Arial' } }, U.fmt(cur.farrowDate)) : null),
        h('td.big', cur ? cur.liveBorn : ''), h('td.big', cur ? cur.stillborn : ''), h('td.big', cur ? cur.mummies : ''), h('td.sub', { colspan: 3 }, 'LITTER ID / BIRTH WEIGHT', cur && cur.birthWeight ? h('div', { style: { font: 'bold 9pt Arial' } }, String(cur.birthWeight)) : null)),
      h('tr', h('td.sub', { colspan: 3, style: { textAlign: 'center', verticalAlign: 'middle' } }, 'LAST SERVICE BOAR(S)'), h('td', { colspan: 3, style: { font: 'bold 8pt Arial' } }, svc ? svc.boars.join(', ') : ''),
        h('td', { style: { textAlign: 'center', font: 'bold 8pt Arial' } }, String(svcN)), h('td.sub', { colspan: 2, style: { verticalAlign: 'middle' } }, 'SERVICE(S)')),
    ], 'pw-farrow');
    const cell = (l, v) => h('td', l, h('b', v || ' '));
    const info = T([
      h('tr', cell('ALT ID', a && data ? a.altId : ''), cell('DUE TO FARROW', due ? U.fmt(due) : '')),
      h('tr', cell('HERD ENTRY', a && data ? U.fmt(a.entryDate) : ''), cell('GENETICS', a && data ? a.breed || 'Unknown' : '')),
      h('tr', cell('LOCATION', r ? r.location : ''), cell('MATING GROUP', svc ? mgroup(svc.date) : '')),
      h('tr', cell('STATUS', r ? r.status : ''), cell('PARITY', r ? String(r.parity) : '')),
    ], 'pw-info-t');

    // write-in tables: filled with the current litter's events while the sow is lactating
    const curEv = (types) => (cur ? r.events.filter((e) => types.includes(e.type) && e.date >= cur.farrowDate).slice(-3) : []);
    const fill = (evs, f) => { const rows = evs.map((e) => h('tr', f(e).map((v) => h('td', v)))); return rows.concat(blankRows(3 - rows.length, 3)); };
    const tbl = (heads, rows, widths) => T([h('tr', heads.map((t, i) => h('th', { style: widths ? { width: widths[i] } : null }, t))), ...rows]);
    const deaths = tbl(['DATE', 'NUMBER', 'REASON'], fill(curEv(['pigdeath']), (e) => [U.fmt(e.date), e.count, e.cause || '']), ['36%', '24%', '40%']);
    const fosters = tbl(['DATE', 'NUMBER', 'REASON'], fill(curEv(['foster', 'nurse']), (e) => [U.fmt(e.date), e.count, e.type === 'nurse' ? 'Nurse' : '']), ['36%', '24%', '40%']);
    const weans = tbl(['DATE', 'NUMBER', 'LITTER WEIGHT'], fill(curEv(['partwean', 'wean']), (e) => [U.fmt(e.date), e.count, e.weight || '']), ['36%', '24%', '40%']);
    const matings = tbl(['DATE', 'BOAR', 'TYPE / STAFF'], blankRows(3, 3), ['27%', '37%', '36%']);
    const hrows = r ? cardRows(a).filter((x) => x.ev).slice(-9) : [];
    const hist = T([h('tr', ['PAR', 'DATE', 'EVENT', '#', 'DETAILS'].map((t, i) => h('th', { style: { width: ['9%', '19%', '20%', '10%', '42%'][i] } }, t))),
      ...hrows.map((x) => h('tr', h('td.n', x.par), h('td.n', U.fmt(x.date)), h('td', x.event.replace(' details', '')), h('td.n', x.n), h('td', x.rem))),
      ...blankRows(9 - hrows.length, 5)], 'pw-hist');

    const q = [['MATING +21', 'mate', 21], ['MATING +35', 'mate', 35], ['MATING +42', 'mate', 42], ['MATING +60', 'mate', 60], ['DUE DATE -15', 'due', -15], ['DUE DATE -10', 'due', -10], ['DUE DATE -5', 'due', -5]];
    const foot = T([h('tr', q.map(([l, k, d]) => h('td', l, h('b', due ? dayDate(U.addDays(k === 'mate' ? svc.date : due, d)) : ' '))))]);

    return h('div.pw',
      head,
      h('div.pw-row.pw-r1', h('div.pw-lbl', 'FARROWING'), h('div.pw-farrow', farrow), h('div.pw-info', info)),
      h('div.pw-row.pw-r2', h('div.pw-box', h('div.pw-lbl', 'PIG DEATHS'), deaths), h('div.pw-box', h('div.pw-lbl', 'FOSTERS'), fosters), h('div.pw-box', h('div.pw-lbl.sm', '(PART) WEANS'), weans)),
      h('div.pw-row.pw-r3', h('div.pw-box', h('div.pw-lbl', 'MATINGS'), matings), h('div.pw-box.wide', h('div.pw-lbl', 'HISTORY'), hist)),
      h('div.pw-foot', foot));
  }
  /** Print preview of PigWIN-style cards, two to a letter page. */
  function printCardsPreview(list, title, data = true) {
    return ui().printPreview(title || `Sow cards (${list.length})`, h('div.pw-cards', list.map((a) => card(a, data))), { bare: true, css: PW_CSS });
  }

  function open(initial) {
    const st = { sel: 'active', group: '', selected: [], current: null, view: 'full', filter: 'all', from: U.addDays(U.today(), -6), to: U.today() };
    const win = ui().appWindow({ title: 'Sow cards', cls: 'card-win', toolbar: [
      { icon: 'settings', label: 'Settings', onClick: () => S.settingsUI.open('farm') },
      { icon: 'print', label: 'Print', onClick: printCards },
      { icon: 'export', label: 'Save', title: 'Save the selected cards as a file you can print', onClick: printCards },
      '|',
      { icon: 'close', label: 'Close', onClick: () => S.app.home() },
    ] });

    // ---- left: header + stats + history
    const title = h('div.sc2-title');
    const lastEntry = h('div.sc2-last');
    const statBox = h('div.sc2-stats');
    const boarRow = h('div.sc2-boar');
    const viewRow = h('div.sc2-view', h('span.sc2-vlabel', 'View:'),
      ...[['full', 'Full history'], ['selected', 'Selected events'], ['lt', 'L T Summary'], ['comments', 'Comments']].map(([k, l]) =>
        h('label', h('input', { type: 'radio', name: 'sc2-view', value: k, checked: k === st.view, onchange: () => { st.view = k; renderCard(); } }), ' ', l)));
    const head = h('div.sc2-head',
      h('div.rep-logo', ui().icon('sow'), h('span', 'Swine', h('b', 'OS'))),
      h('div.sc2-main', title, lastEntry, statBox, boarRow, viewRow));
    const hist = h('div.sc2-hist');
    const left = h('div.sc2-left', head, hist);

    // ---- right: info cells + selection lists
    const info = h('div.sc2-info');
    const selSelect = ui().select('sc2-sel', SELECTIONS, st.sel, { onchange: (e) => { st.sel = e.target.value; if (st.filter !== 'all') applyFilter(); else renderLists(); } });
    const groupBtn = h('button.wbtn', { type: 'button', onclick: pickGroup }, 'Group');
    const availHead = h('div.sc2-lh'); const selHead = h('div.sc2-lh');
    const avail = h('select.sc2-list', { size: 18, 'aria-label': 'Available sows', onchange: (e) => show(e.target.value), ondblclick: () => addOne() });
    const chosen = h('select.sc2-list', { size: 18, 'aria-label': 'Selected sows', onchange: (e) => show(e.target.value), ondblclick: () => removeOne() });
    const arrows = h('div.sc2-arrows',
      h('button.abtn', { type: 'button', title: 'Add selected sow', onclick: addOne }, '▷'),
      h('button.abtn', { type: 'button', title: 'Add all', onclick: addAll }, '▶'),
      h('button.abtn', { type: 'button', title: 'Remove selected sow', onclick: removeOne }, '◁'),
      h('button.abtn', { type: 'button', title: 'Remove all', onclick: () => { st.selected = []; renderLists(); } }, '◀'),
      h('button.abtn', { type: 'button', title: 'Find sow', onclick: findSow }, ui().icon('find')));
    const right = h('aside.sc2-right', info,
      h('div.sc2-selrow', h('span', 'Selection'), selSelect, groupBtn),
      h('div.sc2-lists', h('div', availHead, avail), arrows, h('div', selHead, chosen)));

    // ---- bottom bar: quick picks
    const from = ui().dateInput('sc2-from', st.from, { onchange: (e) => { st.from = e.target.value; applyFilter(); } });
    const to = ui().dateInput('sc2-to', st.to, { onchange: (e) => { st.to = e.target.value; applyFilter(); } });
    const quick = [['Mating +21', 'mate', 21], ['Mating +35', 'mate', 35], ['Mating +42', 'mate', 42], ['Mating +60', 'mate', 60], ['Due date -15', 'due', -15], ['Due date -10', 'due', -10], ['Due date -5', 'due', -5]];
    // as on PigWIN's card: the date of each check for the sow shown (click to pick every sow with that date in From – To)
    const quickBtns = quick.map(([l, k, d]) => h('button.sc2-q', { type: 'button', title: k === 'mate' ? `Pick sows served ${d} days before a day in From – To` : `Pick sows due to farrow ${-d} days after a day in From – To`, onclick: () => quickPick(k, d, l) }, h('span.sc2-ql', l), h('span.sc2-qd')));
    const bottom = h('div.sc2-bottom',
      h('div.sc2-quick', quickBtns),
      h('div.sc2-filter',
        h('label', h('span', 'Filter type'), ui().select('sc2-ft', FILTERS, st.filter, { onchange: (e) => {
          st.filter = e.target.value;
          // forward-looking filters start today when the dates are still in the past
          if (['due', 'wean', 'heat3', 'heat6', 'preg'].includes(st.filter) && st.to <= U.today()) { st.from = U.today(); st.to = U.addDays(U.today(), 7); from.value = st.from; to.value = st.to; }
          applyFilter();
        } })),
        h('label', h('span', 'From'), from), h('label', h('span', 'To'), to)));

    win.appendChild(h('div.sc2-body', left, right));
    win.appendChild(bottom);

    function pool() {
      const all = S.store.animals().filter((a) => a.sex === 'F');
      const f = {
        active: (r) => !r.removed, served: (r) => r.status === 'Served', lactating: (r) => r.status === 'Lactating', open: (r) => r.status === 'Open',
        gilts: (r) => r.status === 'Gilt', removed: (r) => r.removed, all: () => true,
      }[st.sel];
      return all.filter((a) => f(A(a)) && (!st.group || A(a).location === st.group)).sort((x, y) => U.natCmp(x.id, y.id));
    }
    /** Sows matching Filter type and From – To (within the Selection, except Sows removed). */
    function filtered() {
      const ft = filterFn();
      const base = st.filter === 'removed' ? S.store.animals().filter((a) => a.sex === 'F' && (!st.group || A(a).location === st.group)) : pool();
      const out = base.filter((a) => ft(a, A(a)));
      if (st.filter === 'due') return out.sort((x, y) => dueOf(x).localeCompare(dueOf(y)) || U.natCmp(x.id, y.id));
      return out.sort((x, y) => U.natCmp(x.id, y.id));
    }
    const dueOf = (a) => (A(a).lastService ? U.addDays(A(a).lastService.date, S.store.settings.gestationLength) : '');
    function filterFn() {
      const inR = (d) => !!d && U.inRange(d, st.from, st.to);
      const L = S.store.settings.actionLists || {};
      const served = (r) => r.status === 'Served' && r.lastService && r.lastService.pregCheck !== '-';
      const plus = (r, d) => (r.lastService ? U.addDays(r.lastService.date, d) : '');
      const weanAge = S.store.settings.weanAge || 21;
      return {
        all: () => true,
        active: (a, r) => !r.removed,
        removed: (a, r) => r.removed && inR(r.removedDate),
        giltsServe: (a, r) => !r.removed && r.status === 'Gilt',
        open: (a, r) => !r.removed && r.status === 'Open' && inR(r.statusDate),
        heat3: (a, r) => served(r) && inR(plus(r, 21)),
        heat6: (a, r) => served(r) && inR(plus(r, 42)),
        preg: (a, r) => served(r) && inR(plus(r, L.preg1 || 28)),
        served: (a, r) => r.services.some((x) => inR(x.date)),
        due: (a, r) => served(r) && inR(plus(r, S.store.settings.gestationLength)),
        wean: (a, r) => { if (r.status !== 'Lactating' || !r.currentLitter) return false; const d = U.addDays(r.currentLitter.farrowDate, weanAge); return inR(d) || (d < st.from && st.from <= U.today()); },
      }[st.filter] || (() => true);
    }
    /** Filter type, then From and To: the matching sows go into the Selected list. All clears it. */
    function applyFilter() {
      if (st.from > st.to) { ui().toast('From is after To.', 'error'); return; }
      if (st.filter === 'all') { st.selected = []; renderLists(); return; }
      const hits = filtered();
      st.selected = hits.map((a) => a.uid);
      renderLists();
      if (hits.length) show(hits[0].uid);
    }
    function renderLists() {
      const p = pool();
      const selSet = new Set(st.selected);
      avail.innerHTML = '';
      p.filter((a) => !selSet.has(a.uid)).forEach((a) => avail.appendChild(h('option', { value: a.uid, selected: st.current && st.current.uid === a.uid ? 'selected' : null }, a.id)));
      chosen.innerHTML = '';
      const gestL = S.store.settings.gestationLength;
      st.selected.map((u) => S.store.get(u)).filter(Boolean).forEach((a) => {
        const r = A(a);
        const label = st.filter === 'due' && r.lastService ? `${a.id}   due ${U.fmt(U.addDays(r.lastService.date, gestL)).slice(0, 6)}` : a.id;
        chosen.appendChild(h('option', { value: a.uid, selected: st.current && st.current.uid === a.uid ? 'selected' : null }, label));
      });
      availHead.textContent = `Available ${avail.options.length}`;
      selHead.textContent = `Selected ${chosen.options.length}`;
      groupBtn.textContent = st.group ? 'Group: ' + st.group : 'Group';
    }
    function show(uid) { const a = S.store.get(uid); if (a) { st.current = a; renderCard(); } }
    function addOne() { const u = avail.value; if (!u) return; if (!st.selected.includes(u)) st.selected.push(u); renderLists(); }
    function addAll() { [...avail.options].forEach((o) => { if (!st.selected.includes(o.value)) st.selected.push(o.value); }); renderLists(); }
    function removeOne() { const u = chosen.value; st.selected = st.selected.filter((x) => x !== u); renderLists(); }
    function pickGroup() {
      const L = S.store.settings.lists.locations;
      const m = ui().modal({ title: 'Group – location', width: 320, body: h('div.loc-pick',
        h('button.wbtn', { type: 'button', onclick: () => { st.group = ''; m.close(); renderLists(); } }, 'All locations'),
        L.map((l) => h('button.wbtn', { type: 'button', onclick: () => { st.group = l; m.close(); renderLists(); } }, l))) });
    }
    function findSow() {
      const q = ui().input('sc2-find', '', { placeholder: 'Sow ID' });
      ui().modal({ title: 'Find sow', width: 340, body: h('div.form', ui().field('ID', q)), buttons: [
        { label: 'Show', primary: true, onClick: () => { const a = S.store.findById(q.value); if (!a) { ui().toast(`No sow with ID ${q.value}.`); return true; } st.current = a; renderCard(); renderLists(); } },
        { label: 'Cancel' },
      ] });
    }
    function quickPick(kind, d, label) {
      st.dueMode = false;
      if (st.from > st.to) { ui().toast('From is after To.', 'error'); return; }
      const gest = S.store.settings.gestationLength;
      const hits = S.store.animals().filter((a) => {
        const r = A(a);
        if (a.sex !== 'F' || r.status !== 'Served' || !r.lastService) return false;
        const ref = kind === 'mate' ? U.addDays(r.lastService.date, d) : U.addDays(U.addDays(r.lastService.date, gest), d);
        return U.inRange(ref, st.from, st.to);
      }).sort((x, y) => U.natCmp(x.id, y.id));
      st.selected = hits.map((a) => a.uid);
      renderLists();
      if (hits.length) show(hits[0].uid);
      ui().toast(`${label}: ${hits.length} sows selected.`);
    }
    function printCards() {
      const cur = st.current; const pl = pool();
      const o = { which: st.selected.length ? 'selected' : 'one', data: true, template: true, sort: 'entry', layout: 'pw' };
      const radio = (name, val, label, checked) => h('label.blk', h('input', { type: 'radio', name, checked, onchange: () => { o[name] = val; } }), ' ', label);
      const chk = (key, label) => h('label.blk', h('input', { type: 'checkbox', checked: o[key], onchange: (e) => { o[key] = e.target.checked; } }), ' ', label);
      const body = h('div.sc-print',
        h('fieldset', h('legend', 'Options'),
          radio('which', 'one', `Print sow ${cur ? cur.id : '–'}`, o.which === 'one'),
          radio('which', 'selected', `Print selected sows (${st.selected.length})`, o.which === 'selected'),
          radio('which', 'all', `Print all sows (${pl.length})`, false)),
        h('fieldset', h('legend', 'Layout options'), chk('data', 'Print data'), chk('template', 'Print template (blank lines to write on)')),
        h('fieldset', h('legend', 'Sort by'), h('div.two-col',
          radio('sort', 'id', 'ID', false), radio('sort', 'stage', 'Production stage', false),
          radio('sort', 'location', 'Location', false), radio('sort', 'entry', 'According to entry', true),
          radio('sort', 'mating', 'Mating date', false), radio('sort', 'group', 'Mating group', false))),
        h('fieldset', h('legend', 'Sow card layout options'), ui().select('sc-layout', [['pw', 'Standard sow card (2 per letter page)'], ['full', 'Event history list'], ['lt', 'Lifetime summary']], 'pw', { onchange: (e) => { o.layout = e.target.value; } })));
      const build = () => {
        let list = o.which === 'one' ? [cur] : o.which === 'selected' ? st.selected.map((u) => S.store.get(u)) : pl;
        list = list.filter(Boolean);
        const key = {
          id: (a) => a.id, location: (a) => A(a).location || '~', mating: (a) => (A(a).lastService ? A(a).lastService.date : '~'),
          stage: (a) => ['Gilt', 'Open', 'Served', 'Lactating'].indexOf(A(a).status) + ':' + (A(a).statusDate || ''), group: (a) => (A(a).lastService ? mgroup(A(a).lastService.date) : '~'), entry: null,
        }[o.sort];
        if (key) list = list.slice().sort((x, y) => U.natCmp(key(x), key(y)) || U.natCmp(x.id, y.id));
        return list;
      };
      const preview = (list) => (o.layout === 'pw'
        ? printCardsPreview(list.slice(0, 500), `Sow cards (${list.length})`, o.data)
        : ui().printPreview(`Sow cards (${list.length})`, h('div.cards', list.slice(0, 500).map((a) => printable(a, o)))));
      ui().modal({ title: 'Sow card', width: 460, body, buttons: [
        { label: 'Preview', primary: true, onClick: () => { const list = build(); if (!list.length) { ui().toast('No sows to print.'); return true; } preview(list); } },
        { label: 'Print', cls: 'print-btn', onClick: () => {
          const list = build(); if (!list.length) return true;
          if (o.layout === 'pw') { printFrame(h('div.pw-cards', list.slice(0, 500).map((a) => card(a, o.data)))); return false; }
          preview(list); setTimeout(() => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }, 300); } },
        { label: 'Cancel' },
      ] });
    }
    function printable(a, o) {
      if (!o.data) return h('div.sowcard', h('div.sc-head', h('span.sc-id', a.id)), h('div.sc-lines', Array.from({ length: 14 }, () => h('div.sc-line'))));
      const card = o.layout === 'lt'
        ? h('div.sowcard', h('div.sc-head', h('div', h('span.sc-id', a.id), ` Parity ${A(a).parity} · ${A(a).status}`)), S.reports.table(['Par', 'Served', 'Boar', 'Farrowed', 'BA', 'BD', 'Weaned', 'Weaned on'], S.entry.ltSummaryRows(a).map((x) => [x.par, U.fmt(x.svc), x.boar, U.fmt(x.farrow), x.ba, x.sb, x.weaned, U.fmt(x.wean)])))
        : S.reports.sowCard(a);
      if (!o.template) { const lines = card.querySelector('.sc-lines'); if (lines) lines.remove(); }
      return card;
    }


    function cell(label, value) { return h('div.sc2-cell', h('div.sc2-cl', label), h('div.sc2-cv', value || ' ')); }
    function renderCard() {
      const a = st.current;
      statBox.innerHTML = ''; hist.innerHTML = ''; info.innerHTML = ''; boarRow.innerHTML = '';
      if (!a) {
        quickBtns.forEach((b) => { b.querySelector('.sc2-qd').textContent = ''; });
        title.textContent = 'Sow card';
        lastEntry.textContent = 'Pick a sow from the Available list';
        info.append(cell('Due to farrow date'), cell('Alt ID'), cell('Arrival date'), cell('Genetics'), cell('Location'), cell('Mating group'), cell('Status'), cell('Parity'));
        hist.appendChild(h('p.hint.sc2-hint', 'Click a sow in the Available list on the right to show her card. Use the arrows to build a list of cards to print, or the buttons at the bottom to pick sows by mating or due date.'));
        return;
      }
      const r = A(a);
      const gest = S.store.settings.gestationLength;
      quick.forEach(([, k, d], i) => {
        const base = r.status === 'Served' && r.lastService ? (k === 'mate' ? r.lastService.date : U.addDays(r.lastService.date, gest)) : '';
        quickBtns[i].querySelector('.sc2-qd').textContent = base ? dayDate(U.addDays(base, d)) : '';
      });
      const lastEv = r.events.length ? r.events[r.events.length - 1].date : (a.entryDate || a.arrivalDate);
      title.textContent = `Sow card - ${a.id}`;
      lastEntry.textContent = `Last data entry: ${U.fmt(lastEv) || '–'}`;
      const s = stats(a);
      const heads = ['Farr interval', 'Gest length', 'Born alive', 'Born dead', 'Mumm -ified', 'Pig deaths', 'Net foster', 'Pigs weaned'];
      const fmt = (k, v, last) => (Number.isFinite(v) ? (last || ['fi', 'gest'].includes(k) ? U.num(v, 0) : U.num(v, 1)) : '');
      statBox.appendChild(h('table.sc2-st',
        h('tr', h('th'), heads.map((t) => h('th', t))),
        h('tr', h('td.l', 'Average:'), s.keys.map((k) => h('td', h('span', fmt(k, s.avg[k]))))),
        h('tr', h('td.l', 'Last litter:'), s.keys.map((k) => h('td', h('span', s.last ? fmt(k, s.last[k], true) : ''))))));
      const svcN = r.lastService ? r.services.filter((x) => x.parity === r.lastService.parity).length : 0;
      boarRow.append(h('span.l', 'Last service boar:'), h('span.sc2-boarbox', r.lastService ? r.lastService.boars.join(', ') : ''), h('span', `${svcN} Service(s)`));

      if (st.view === 'lt') {
        hist.appendChild(ui().grid({ cls: 'sc2-grid', rows: S.entry.ltSummaryRows(a), emptyText: 'No litters yet', columns: [
          { label: 'Par', num: true, value: (x) => x.par }, { label: 'Service', value: (x) => U.fmt(x.svc) }, { label: 'Boar', value: (x) => x.boar }, { label: 'Farrowed', value: (x) => U.fmt(x.farrow) },
          { label: 'Gest', num: true, value: (x) => x.gest ?? '' }, { label: 'BA', num: true, value: (x) => x.ba }, { label: 'BD', num: true, value: (x) => x.sb }, { label: 'BM', num: true, value: (x) => x.mm },
          { label: 'Deaths', num: true, value: (x) => x.dead }, { label: 'Foster', num: true, value: (x) => x.fost }, { label: 'Weaned', num: true, value: (x) => x.weaned }, { label: 'Weaned on', value: (x) => U.fmt(x.wean) }, { label: 'Lact', num: true, value: (x) => x.lact }, { label: '', value: () => '' },
        ] }));
      } else {
        let rows = cardRows(a);
        if (st.view === 'selected') rows = rows.filter((x) => ['mate', 'farrow', 'wean'].includes(x.type) || ['Birth', 'Arrival', 'Herd entry'].includes(x.event));
        if (st.view === 'comments') {
          rows = r.events.filter((e) => e.remarks || e.type === 'disease').map((e) => ({ par: '', date: e.date, interval: '', event: S.EVENTS[e.type].label, n: '', rem: [S.entry.describe(e), e.remarks].filter(Boolean).join(' – ') }));
          if (a.remarks) rows.unshift({ par: '', date: '', interval: '', event: 'Animal remark', n: '', rem: a.remarks });
        }
        hist.appendChild(ui().grid({ cls: 'sc2-grid', rows, rowClass: (x) => (x.type === 'farrow' ? 'farrow' : ''), emptyText: st.view === 'comments' ? 'No remarks recorded' : 'No events', columns: [
          { label: 'Par', num: true, value: (x) => x.par }, { label: 'Date', value: (x) => U.fmt(x.date), sort: (x) => x.date }, { label: 'Interval', num: true, value: (x) => x.interval },
          { label: 'Event', value: (x) => x.event }, { label: '#', num: true, value: (x) => x.n }, { label: 'Remarks', value: (x) => x.rem },
        ] }));
      }
      info.append(
        cell('Due to farrow date', r.status === 'Served' ? U.fmt(U.addDays(r.lastService.date, gest)) : ''), cell('Alt ID', a.altId || ''),
        cell('Arrival date', U.fmt(a.arrivalDate)), cell('Genetics', a.breed || ''),
        cell('Location', r.location || ''), cell('Mating group', r.lastService ? mgroup(r.lastService.date) : ''),
        cell('Status', r.status), cell('Parity', String(r.parity)));
    }

    win.refresh = () => { if (st.current) st.current = S.store.get(st.current.uid) || null; renderLists(); renderCard(); };
    if (initial) st.current = S.store.get(initial.uid) || initial;
    else { const p = pool(); st.current = p[0] || null; }
    renderLists(); renderCard();
    S.app.mount(win, null, () => open(st.current || initial));
    return win;
  }

  /**
   * Print sow cards two to a letter page from a page of their own, so the app's page settings, zoom and the
   * printer's default margins cannot push the second card onto another sheet.
   */
  const PAGE_CSS = `
@page { size: 8.5in 11in; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pw-page { width: 8.5in; height: 10.96in; box-sizing: border-box; padding: 0.42in 0.5in 0.4in; display: flex; flex-direction: column; justify-content: space-between; align-items: center;
  overflow: hidden; break-after: page; page-break-after: always; }
.pw-page:last-child { break-after: auto; page-break-after: auto; }
.pw-page .pw { margin: 0 !important; break-after: auto !important; page-break-after: auto !important; }
.pw-page.one { justify-content: flex-start; }
@media screen { body { background: #8a8a8a; } .pw-page { background: #fff; margin: 12px auto; } }`;
  function printFrame(root) {
    const cards = [...root.querySelectorAll('.pw')];
    if (!cards.length) return false;
    const pages = [];
    for (let i = 0; i < cards.length; i += 2) pages.push(`<div class="pw-page${cards[i + 1] ? '' : ' one'}">${cards[i].outerHTML}${cards[i + 1] ? cards[i + 1].outerHTML : ''}</div>`);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sow cards</title><style>${PW_CSS}${PAGE_CSS}</style></head><body>${pages.join('')}</body></html>`;
    U.$$('iframe.pw-print-frame').forEach((f) => f.remove());
    const frame = h('iframe.pw-print-frame', { title: 'Sow cards', 'aria-hidden': 'true', style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { ui().toast('Printing is not available here.', 'error'); } }, 250);
    return true;
  }

  S.sowCard = { open, cardRows, card, printCardsPreview, printFrame, PW_CSS, PAGE_CSS };
})(window.SOS);
