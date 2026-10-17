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
  const mgroup = (iso) => { const w = U.isoWeek(iso); return w.slice(2, 4) + '-' + w.slice(6); };

  /** Card history rows in the old program's style. */
  function cardRows(a) {
    const r = A(a);
    const gest = S.store.settings.gestationLength;
    const gap = S.store.settings.serviceGapDays || 3;
    const rows = [];
    if (a.birthDate) rows.push({ par: 0, date: a.birthDate, interval: '', event: 'Birth', n: '', rem: '' });
    if (a.arrivalDate) rows.push({ par: Number(a.entryParity) || 0, date: a.arrivalDate, interval: a.birthDate ? U.diff(a.arrivalDate, a.birthDate) : '', event: 'Arrival', n: '', rem: a.origin || '' });
    if (a.entryDate) rows.push({ par: Number(a.entryParity) || 0, date: a.entryDate, interval: '', event: 'Herd entry', n: '', rem: '' });
    let par = Number(a.entryParity) || 0;
    let lastWean = null; let lastSvc = null; let lastFarrow = null; let prevMate = null;
    for (const e of r.events) {
      const row = { par, date: e.date, interval: '', event: (S.EVENTS[e.type] || {}).label || e.type, n: '', rem: [S.entry.describe(e), e.remarks].filter(Boolean).join(' – '), type: e.type };
      if (e.type === 'mate') {
        const repeatMating = prevMate && U.diff(e.date, prevMate) <= gap;
        prevMate = e.date;
        if (repeatMating) { row.interval = U.diff(e.date, lastSvc); }
        else {
          row.interval = lastWean && (!lastSvc || lastSvc < lastWean) ? U.diff(e.date, lastWean) : lastSvc ? U.diff(e.date, lastSvc) : a.birthDate ? U.diff(e.date, a.birthDate) : '';
          lastSvc = e.date;
        }
        row.n = mgroup(lastSvc);
        row.rem = `Boar: ${e.boar || '–'}  Due: ${U.fmt(U.addDays(lastSvc, gest))}` + (e.tech ? `  ${e.tech}` : '') + (e.remarks ? '  ' + e.remarks : '');
      } else if (e.type === 'farrow') {
        par++;
        row.par = par;
        row.interval = lastSvc ? U.diff(e.date, lastSvc) : '';
        row.event = 'Farrowing';
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
    const selSelect = ui().select('sc2-sel', SELECTIONS, st.sel, { onchange: (e) => { st.sel = e.target.value; renderLists(); } });
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
    const from = ui().dateInput('sc2-from', st.from, { onchange: (e) => { st.from = e.target.value; } });
    const to = ui().dateInput('sc2-to', st.to, { onchange: (e) => { st.to = e.target.value; } });
    const quick = [['Mating +21', 'mate', 21], ['Mating +35', 'mate', 35], ['Mating +42', 'mate', 42], ['Mating +60', 'mate', 60], ['Due date -15', 'due', -15], ['Due date -10', 'due', -10], ['Due date -5', 'due', -5]];
    const bottom = h('div.sc2-bottom',
      h('div.sc2-quick', quick.map(([l, k, d]) => h('button.sc2-q', { type: 'button', title: k === 'mate' ? `Sows served ${d} days before a day in From – To` : `Sows due to farrow ${-d} days after a day in From – To`, onclick: () => quickPick(k, d, l) }, l))),
      h('div.sc2-filter',
        h('label', h('span', 'Filter type'), ui().select('sc2-ft', [['all', 'All'], ['gilts', 'Gilts (parity 0)'], ['sows', 'Sows (parity 1+)']], st.filter, { onchange: (e) => { st.filter = e.target.value; } })),
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
    function renderLists() {
      const p = pool();
      const selSet = new Set(st.selected);
      avail.innerHTML = '';
      p.filter((a) => !selSet.has(a.uid)).forEach((a) => avail.appendChild(h('option', { value: a.uid, selected: st.current && st.current.uid === a.uid ? 'selected' : null }, a.id)));
      chosen.innerHTML = '';
      st.selected.map((u) => S.store.get(u)).filter(Boolean).forEach((a) => chosen.appendChild(h('option', { value: a.uid }, a.id)));
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
      if (st.from > st.to) { ui().toast('From is after To.', 'error'); return; }
      const gest = S.store.settings.gestationLength;
      const ft = st.filter;
      const hits = S.store.animals().filter((a) => {
        const r = A(a);
        if (a.sex !== 'F' || r.status !== 'Served' || !r.lastService) return false;
        if (ft === 'gilts' && r.parity > 0) return false;
        if (ft === 'sows' && r.parity === 0) return false;
        const ref = kind === 'mate' ? U.addDays(r.lastService.date, d) : U.addDays(U.addDays(r.lastService.date, gest), d);
        return U.inRange(ref, st.from, st.to);
      }).sort((x, y) => U.natCmp(x.id, y.id));
      st.selected = hits.map((a) => a.uid);
      renderLists();
      if (hits.length) show(hits[0].uid);
      ui().toast(`${label}: ${hits.length} sows selected.`);
    }
    function printCards() {
      const list = (st.selected.length ? st.selected.map((u) => S.store.get(u)) : [st.current]).filter(Boolean);
      if (!list.length) { ui().toast('Pick a sow, or move sows to the Selected list.'); return; }
      ui().printPreview(`Sow cards (${list.length})`, h('div.cards', list.slice(0, 300).map((a) => S.reports.sowCard(a))));
    }

    function cell(label, value) { return h('div.sc2-cell', h('div.sc2-cl', label), h('div.sc2-cv', value || ' ')); }
    function renderCard() {
      const a = st.current;
      statBox.innerHTML = ''; hist.innerHTML = ''; info.innerHTML = ''; boarRow.innerHTML = '';
      if (!a) {
        title.textContent = 'Sow card';
        lastEntry.textContent = 'Pick a sow from the Available list';
        info.append(cell('Due to farrow date'), cell('Alt ID'), cell('Arrival date'), cell('Genetics'), cell('Location'), cell('Mating group'), cell('Status'), cell('Parity'));
        hist.appendChild(h('p.hint.sc2-hint', 'Click a sow in the Available list on the right to show her card. Use the arrows to build a list of cards to print, or the buttons at the bottom to pick sows by mating or due date.'));
        return;
      }
      const r = A(a);
      const gest = S.store.settings.gestationLength;
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
    S.app.mount(win, null);
    return win;
  }

  S.sowCard = { open, cardRows };
})(window.SOS);
