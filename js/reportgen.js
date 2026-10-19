/* SwineOS – Report generator: saved lists the farm defines once and runs for any end date. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  const KINDS = [
    ['events', 'Events in the period'], ['entries', 'Herd entries in the period'], ['lifetime', 'Lifetime production of active sows'],
    ['repeats', 'Active repeat breeder sows'], ['servicegroup', 'Service group list'], ['inventory', 'Animals by status'],
  ];
  const EVENT_TYPES = ['mate', 'heat', 'preg', 'abort', 'farrow', 'pigdeath', 'foster', 'partwean', 'wean', 'nurse', 'location', 'disease', 'vaccinate', 'remove'];
  const DEFAULTS = [
    { no: 1, name: 'Herd Entry last year', kind: 'entries', n: 1, unit: 'years' },
    { no: 2, name: 'Sows culled or died or destroyed last year', kind: 'events', events: ['remove'], n: 1, unit: 'years' },
    { no: 3, name: 'Data validation Matings last 90 days', kind: 'events', events: ['mate'], n: 90, unit: 'days' },
    { no: 4, name: 'Data validation Farrowing last month', kind: 'events', events: ['farrow'], n: 1, unit: 'months' },
    { no: 5, name: 'Data validation weaning last month', kind: 'events', events: ['wean', 'partwean'], n: 1, unit: 'months' },
    { no: 6, name: 'Average Born Alive per Sows (lifetime)', kind: 'lifetime', n: 1, unit: 'years' },
    { no: 7, name: 'Active repeat breeder sows', kind: 'repeats', minRepeats: 1, n: 1, unit: 'years' },
    { no: 8, name: 'Service group List last week', kind: 'servicegroup', n: 1, unit: 'weeks' },
  ];

  function defs() {
    const r = S.store.settings.reports;
    return Array.isArray(r) && r.length ? r : DEFAULTS.map((d) => ({ ...d, id: 'r' + d.no }));
  }
  async function saveDefs(list) { await S.store.saveSettings({ ...S.store.settings, reports: list }); }

  function beginOf(d, end) {
    const n = Math.max(1, +d.n || 1);
    if (d.unit === 'days') return U.addDays(end, -n + 1);
    if (d.unit === 'weeks') return U.addDays(end, -7 * n + 1);
    if (d.unit === 'months') return U.addDays(U.addMonths(end, -n), 1);
    return U.addDays(U.addMonths(end, -12 * n), 1);
  }

  /** Run a report definition. Returns { title, head, rows }. */
  function run(d, end) {
    const b = beginOf(d, end);
    const title = `${d.no} ${d.name}  ·  ${U.fmt(b)} – ${U.fmt(end)}`;
    const all = S.store.animals();
    if (d.kind === 'events') {
      const rows = [];
      all.forEach((a) => {
        let par = Number(a.entryParity) || 0;
        A(a).events.forEach((e) => {
          if (e.type === 'farrow') par++;
          if (!(d.events || []).includes(e.type) || !U.inRange(e.date, b, end)) return;
          rows.push([a.id, par, U.fmt(e.date), S.EVENTS[e.type].label, e.count ?? e.liveBorn ?? '', [S.entry.describe(e), e.remarks].filter(Boolean).join(' – '), e.date]);
        });
      });
      rows.sort((x, y) => (x[6] < y[6] ? -1 : x[6] > y[6] ? 1 : U.natCmp(x[0], y[0])));
      return { title, head: ['ID', 'Par', 'Date', 'Event', '#', 'Remarks'], rows: rows.map((r) => r.slice(0, 6)), total: `${rows.length} records` };
    }
    if (d.kind === 'entries') {
      const rows = all.filter((a) => U.inRange(A(a).entryDate || a.arrivalDate, b, end)).sort((x, y) => ((A(x).entryDate || '') < (A(y).entryDate || '') ? -1 : 1))
        .map((a) => [a.id, a.sex === 'M' ? 'Boar' : 'Female', U.fmt(a.birthDate), U.fmt(a.arrivalDate), U.fmt(A(a).entryDate), a.breed || '', a.origin || '', A(a).status]);
      return { title, head: ['ID', 'Type', 'Birth date', 'Arrival', 'Herd entry', 'Genetics', 'Origin', 'Status now'], rows, total: `${rows.length} animals` };
    }
    if (d.kind === 'lifetime') {
      const rows = all.filter((a) => a.sex === 'F' && !A(a).removed && A(a).litters.length).map((a) => { const lt = S.entry.lifetime(a); return [a.id, A(a).parity, lt.litters, lt.ba, +(lt.ba / lt.litters).toFixed(1), lt.weaned, +(lt.weaned / lt.litters).toFixed(1)]; })
        .sort((x, y) => y[4] - x[4]);
      const avg = U.avg(rows.map((r) => r[4]));
      return { title: `${d.no} ${d.name}`, head: ['Sow', 'Par', 'Litters', 'Born alive', 'BA / litter', 'Weaned', 'Weaned / litter'], rows, total: `${rows.length} sows · herd average ${U.num(avg, 2)} born alive per litter` };
    }
    if (d.kind === 'repeats') {
      const min = +d.minRepeats || 1;
      const rows = all.filter((a) => a.sex === 'F' && !A(a).removed).map((a) => {
        const r = A(a); const cur = r.services.filter((s) => s.parity === r.parity); const reps = cur.filter((s) => !s.isFirst).length;
        return { a, r, cur, reps };
      }).filter((x) => x.reps >= min).map((x) => [x.a.id, x.r.parity, x.r.status, x.cur.length, x.reps, x.cur.map((s) => U.fmt(s.date)).join(', ')]);
      return { title: `${d.no} ${d.name}`, head: ['Sow', 'Par', 'Status', 'Services this parity', 'Repeats', 'Service dates'], rows, total: `${rows.length} sows` };
    }
    if (d.kind === 'servicegroup') {
      const gest = S.store.settings.gestationLength;
      const rows = [];
      all.forEach((a) => A(a).services.forEach((s) => { if (U.inRange(s.date, b, end)) rows.push([U.matingGroup(s.date), a.id, s.parity, U.fmt(s.date), s.matings, s.boars.join(', '), s.tech || '', U.fmt(U.addDays(s.date, gest)), s.date]); }));
      rows.sort((x, y) => (x[8] < y[8] ? -1 : x[8] > y[8] ? 1 : U.natCmp(x[1], y[1])));
      return { title, head: ['Group', 'Sow', 'Par', 'Served', 'Matings', 'Boar(s)', 'Technician', 'Due'], rows: rows.map((r) => r.slice(0, 8)), total: `${rows.length} services` };
    }
    const sts = d.status && d.status.length ? d.status : ['Gilt', 'Open', 'Served', 'Lactating'];
    const rows = all.filter((a) => sts.includes(A(a).status)).map((a) => [a.id, A(a).parity, A(a).status, U.fmt(A(a).statusDate), A(a).daysInStatus ?? '', A(a).location || '']);
    return { title: `${d.no} ${d.name}`, head: ['ID', 'Par', 'Status', 'Since', 'Days', 'Location'], rows, total: `${rows.length} animals` };
  }

  function editor(d, onSave) {
    const x = JSON.parse(JSON.stringify(d));
    x.events = x.events || [];
    const evBox = h('div.rg-events', EVENT_TYPES.map((t) => h('label', h('input', { type: 'checkbox', checked: x.events.includes(t), onchange: (e) => { x.events = e.target.checked ? [...x.events, t] : x.events.filter((y) => y !== t); } }), ' ', S.EVENTS[t].label)));
    const stBox = h('div.rg-events', ['Gilt', 'Open', 'Served', 'Lactating', 'Boar'].map((t) => h('label', h('input', { type: 'checkbox', checked: (x.status || []).includes(t), onchange: (e) => { x.status = e.target.checked ? [...(x.status || []), t] : (x.status || []).filter((y) => y !== t); } }), ' ', t)));
    const kind = ui().select('rg-kind', KINDS, x.kind, { onchange: (e) => { x.kind = e.target.value; vis(); } });
    const evRow = ui().field('Events', evBox); const stRow = ui().field('Status', stBox); const repRow = ui().field('Repeat services ≥', h('input', { type: 'number', min: 1, value: x.minRepeats || 1, onchange: (e) => { x.minRepeats = +e.target.value; } }));
    const vis = () => { evRow.hidden = x.kind !== 'events'; stRow.hidden = x.kind !== 'inventory'; repRow.hidden = x.kind !== 'repeats'; };
    vis();
    ui().modal({ title: d.id ? 'Edit report' : 'Add report', width: 620, body: h('div.form',
      ui().field('Number', h('input', { type: 'number', value: x.no, onchange: (e) => { x.no = +e.target.value; } })),
      ui().field('Description', h('input', { value: x.name || '', onchange: (e) => { x.name = e.target.value; } })),
      ui().field('Contents', kind),
      ui().field('Period before end date', h('span.inline', h('input', { type: 'number', min: 1, value: x.n || 1, style: { width: '70px' }, onchange: (e) => { x.n = +e.target.value; } }),
        ui().select('rg-unit', [['days', 'Day(s)'], ['weeks', 'Week(s)'], ['months', 'Month(s)'], ['years', 'Year(s)']], x.unit || 'months', { onchange: (e) => { x.unit = e.target.value; } }))),
      evRow, stRow, repRow), buttons: [
      { label: 'OK', primary: true, onClick: () => { if (!x.name) { ui().toast('Enter a description.'); return true; } onSave(x); } },
      { label: 'Cancel' },
    ] });
  }

  function open() {
    let list = defs();
    let selId = list[0] && list[0].id;
    const end = ui().dateInput('rg-end', U.today());
    const box = h('div.rg-list');
    const render = () => {
      box.innerHTML = '';
      box.appendChild(h('div.rg-head', 'Description'));
      list.forEach((d) => {
        box.appendChild(h('div.rg-row' + (d.id === selId ? '.sel' : ''), { onclick: () => { selId = d.id; render(); }, ondblclick: () => { selId = d.id; preview(); } }, `${d.no} ${d.name}`));
      });
    };
    const cur = () => list.find((d) => d.id === selId);
    const persist = async () => { await saveDefs(list); render(); };
    const preview = () => {
      const d = cur(); if (!d) return;
      const res = run(d, end.value);
      ui().printPreview(res.title, h('div', h('div.vsum', res.total), S.reports.table(res.head, res.rows)));
    };
    const tb = (ic, label, fn) => h('button.tb-btn', { type: 'button', onclick: fn }, ui().icon(ic), h('span', label));
    const bar = h('div.toolbar.rg-tb',
      tb('enter', 'Add…', () => editor({ no: Math.max(0, ...list.map((d) => d.no || 0)) + 1, name: '', kind: 'events', events: ['mate'], n: 1, unit: 'months' }, (x) => { x.id = U.uid('r'); list = [...list, x]; selId = x.id; persist(); })),
      tb('enter', 'Duplicate…', () => { const d = cur(); if (d) editor({ ...d, id: undefined, no: Math.max(...list.map((y) => y.no || 0)) + 1, name: d.name + ' (copy)' }, (x) => { x.id = U.uid('r'); list = [...list, x]; selId = x.id; persist(); }); }),
      tb('edit', 'Edit…', () => { const d = cur(); if (d) editor(d, (x) => { list = list.map((y) => (y.id === d.id ? { ...x, id: d.id } : y)); persist(); }); }),
      tb('del', 'Delete', async () => { const d = cur(); if (!d) return; if (await ui().confirmBox('Delete report', `Delete "${d.name}"?`, 'Delete')) { list = list.filter((y) => y.id !== d.id); selId = list[0] && list[0].id; persist(); } }),
      h('span.tb-sep'),
      tb('find', 'Preview', preview),
      tb('print', 'Print', preview),
      tb('export', 'Export report', () => { const d = cur(); if (!d) return; const res = run(d, end.value); ui().saveFile(d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv', U.csv([res.head, ...res.rows]), 'text/csv'); }),
      h('span.tb-sep'),
      tb('export', 'Export', () => ui().saveFile('swineos-reports.json', JSON.stringify(list, null, 1), 'application/json')),
      h('label.tb-btn.file', ui().icon('backup'), h('span', 'Import'), h('input', { type: 'file', accept: '.json', onchange: async (e) => {
        try { const arr = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(arr)) throw new Error('not a list'); list = [...list, ...arr.map((d) => ({ ...d, id: U.uid('r') }))]; persist(); ui().toast(`${arr.length} reports imported.`, 'ok'); } catch (err) { ui().alertBox('Import', 'This file is not a SwineOS report list.'); }
      } })));
    ui().modal({ title: 'Report generator', width: 760, cls: 'rg-modal', body: h('div', bar, h('div.rg-end', h('span', 'End date'), end), box), buttons: [{ label: 'Close', primary: true }] });
    render();
  }

  S.reportGen = { open, run, DEFAULTS };
})(window.SOS);
