/* SwineOS – Moved to Finisher: groups of pigs moved from the nursery rooms to the Finisher, in place of the
 * MOVED TO FINISHER sheet of the Expense & Income workbook. Opened from Herd records → Data Entry.
 * Records are kept in the store beside the finance records (kind 'move'), so they are backed up the same way. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const K = () => S.finance.kit;

  const view = { year: null, f: { month: '', q: '' } };
  const moves = () => S.store.fin().filter((r) => r.kind === 'move' && r.date);
  function years() {
    const ys = new Set(moves().map((r) => +r.date.slice(0, 4)));
    ys.add(+U.today().slice(0, 4));
    return [...ys].sort((a, b) => a - b);
  }

  function open() {
    const { ico } = K();
    const ys = years();
    if (!view.year || !ys.includes(view.year)) view.year = [...ys].reverse().find((y) => moves().some((r) => r.date.startsWith(String(y)))) || ys[ys.length - 1];
    const win = ui().appWindow({ title: 'Moved to Finisher', cls: 'fin-win mf-win', onClose: () => S.app.home() });
    const head = h('header.fin-head');
    const main = h('main.fin-main');
    win.append(head, main);
    let current = null;

    function render() {
      const ys2 = years(); const i = ys2.indexOf(view.year);
      head.innerHTML = '';
      head.append(
        h('button.fin-home', { type: 'button', title: 'Back to Herd Records', onclick: () => S.app.home() }, ico('back'), h('span', 'Herd Records')),
        h('div.fin-titles', h('h1', 'Moved to Finisher'), h('p', [S.store.settings.farmName, `Pigs moved to the Finisher in ${view.year}`].filter(Boolean).join('  ·  '))),
        h('div.fin-year', { role: 'group', 'aria-label': 'Year' },
          h('button', { type: 'button', title: 'Previous year', 'aria-label': 'Previous year', disabled: i <= 0, onclick: () => { view.year = ys2[i - 1]; render(); } }, ico('back')),
          h('select', { 'aria-label': 'Year', onchange: (e) => { view.year = +e.target.value; render(); } }, ys2.map((y) => h('option', { value: y, selected: y === view.year ? 'selected' : null }, String(y)))),
          h('button', { type: 'button', title: 'Next year', 'aria-label': 'Next year', disabled: i >= ys2.length - 1, onclick: () => { view.year = ys2[i + 1]; render(); } }, ico('next'))),
        h('div.fin-actions',
          h('button.fin-btn.solid', { type: 'button', onclick: () => edit(null, render) }, ico('plus'), 'Move'),
          h('button.fin-btn.icon', { type: 'button', title: 'Print', 'aria-label': 'Print', onclick: () => current && ui().printPreview(current.printTitle, current.printNode()) }, ico('print')),
          h('button.fin-btn.icon', { type: 'button', title: 'Export to Excel (CSV)', 'aria-label': 'Export to Excel (CSV)', onclick: () => current && ui().saveFile(`moved-to-finisher-${view.year}-${U.today()}.csv`, current.csv(), 'text/csv') }, ico('download'))));
      main.innerHTML = '';
      current = page(render);
      main.appendChild(current);
    }
    render();
    win.refresh = render;
    return win;
  }

  function page(render) {
    const { n, kpi, barList, filterBar, tableOf, ico } = K();
    const y = view.year;
    const all = moves().filter((r) => r.date.startsWith(String(y)));
    const wrap = h('div.fin-page');
    if (!all.length) {
      wrap.appendChild(h('div.fin-empty',
        h('div.fin-empty-ico', { html: S.ui.ICONS.piglets }),
        h('h2', `No pigs moved to the Finisher in ${y} yet`),
        h('p', 'Import the MOVED TO FINISHER sheet from the Expense & Income workbook (.xls or .xlsx), or add each group as it moves.'),
        h('div.fin-empty-btns',
          h('button.fin-btn.solid', { type: 'button', onclick: () => importDialog(render) }, ico('upload'), 'Import Excel workbook'),
          h('button.fin-btn', { type: 'button', onclick: () => edit(null, render) }, ico('plus'), 'Add a move'))));
      wrap.printNode = () => h('p', 'Nothing recorded.'); wrap.printTitle = `Moved to Finisher ${y}`; wrap.csv = () => '';
      return wrap;
    }
    const total = U.sum(all.map((r) => r.head));
    const byMonth = Array.from({ length: 12 }, (_, m) => ({ m, head: 0, n: 0 }));
    all.forEach((r) => { const b = byMonth[+r.date.slice(5, 7) - 1]; b.head += r.head; b.n++; });
    const last = [...all].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const lastM = Math.max(...all.map((r) => +r.date.slice(5, 7) - 1));
    const months = byMonth.filter((b) => b.m <= lastM);
    const daysOf = all.filter((r) => r.date === last.date);
    wrap.appendChild(h('section.fin-kpis',
      kpi('Pigs moved', n(total), `${y}${lastM < 11 ? `, ${U.MONTHS[0]}–${U.MONTHS[lastM]}` : ''}`, '.hero'),
      kpi('Groups moved', n(all.length), `${n(new Set(all.map((r) => r.date)).size)} moving days`),
      kpi('Average group', n(total / all.length), 'pigs per room'),
      kpi('Average month', n(total / (lastM + 1)), 'pigs per month'),
      kpi('Last move', U.fmt(last.date), `${n(U.sum(daysOf.map((r) => r.head)))} pigs from ${daysOf.length} room${daysOf.length === 1 ? '' : 's'}`),
      kpi('This month', n(byMonth[+U.today().slice(5, 7) - 1].head && U.today().startsWith(String(y)) ? byMonth[+U.today().slice(5, 7) - 1].head : 0), U.today().startsWith(String(y)) ? U.MONTHS[+U.today().slice(5, 7) - 1] : '—')));

    const monthTable = h('table.fin-table',
      h('thead', h('tr', h('th', 'Month'), h('th.num', 'Groups'), h('th.num', 'Pigs moved'))),
      h('tbody', months.map((b) => h('tr', { class: b.n ? null : 'dim' }, h('td', U.MONTHS[b.m]), h('td.num', n(b.n)), h('td.num', n(b.head))))),
      h('tfoot', h('tr', h('td', 'Total'), h('td.num', n(all.length)), h('td.num', n(total)))));
    wrap.appendChild(h('div.fin-two',
      h('section.fin-card', h('div.fin-card-head', h('h2', 'Pigs moved by month')),
        barList(months.filter((b) => b.head).map((b) => ({ label: U.MONTHS[b.m], value: b.head, note: `${b.n} group${b.n === 1 ? '' : 's'}`, onClick: () => { view.f.month = String(b.m); render(); } })), total, (v) => n(v))),
      h('section.fin-card', h('div.fin-card-head', h('h2', 'Monthly totals')), h('div.fin-scroll', monthTable))));

    const f = view.f;
    const columns = [
      { label: 'Date', value: (r) => r.date, render: (r) => U.fmt(r.date) },
      { label: 'Pigs', num: true, value: (r) => r.head, render: (r) => n(r.head) },
      { label: 'From room', value: (r) => r.room || '' },
      { label: 'Finisher room', value: (r) => r.finRoom || '' },
      { label: 'Note', value: (r) => r.note || '' },
    ];
    const stats = h('div.fin-stats');
    const grid = ui().grid({ columns, rows: [], cls: 'fin-grid', rowKey: (r) => r.id, emptyText: 'No moves match these filters.', onRowClick: (r) => show(r, render) });
    const months2 = [...new Set(all.map((r) => +r.date.slice(5, 7) - 1))].sort((a, b) => a - b);
    const filters = filterBar(f, { placeholder: 'Room or note', months: months2 }, (typing) => { if (typing) update(); else render(); });
    function rows() {
      const q = f.q.trim().toLowerCase();
      return all.filter((r) => (!f.month || +r.date.slice(5, 7) - 1 === +f.month) && (!q || [r.room, r.finRoom, r.note].some((x) => String(x || '').toLowerCase().includes(q))))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : U.natCmp(a.room || '', b.room || '')));
    }
    function update() {
      const list = rows(); grid.update(list);
      stats.innerHTML = '';
      stats.append(h('span', h('b', n(list.length)), list.length === 1 ? ' group' : ' groups'), h('span', h('b', n(U.sum(list.map((r) => r.head)))), ' pigs'));
    }
    update();
    wrap.appendChild(h('section.fin-card.fin-list-card', filters, stats, grid));
    wrap.printTitle = `Moved to Finisher ${y}`;
    wrap.printNode = () => h('div', monthTable.cloneNode(true), h('h4', 'Moves'), tableOf(columns, rows()));
    wrap.csv = () => U.csv([columns.map((c) => c.label), ...rows().map((r) => columns.map((c) => c.value(r)))]);
    return wrap;
  }

  /** One move, read-only; the pencil opens the form. */
  function show(r, render) {
    const { n, viewDialog, changedLine } = K();
    viewDialog('Moved to Finisher', [
      ['Date', U.fmt(r.date)], ['Pigs', h('b', n(r.head))], ['From room', r.room], ['Finisher room', r.finRoom], ['Note', r.note], ['Last changed', changedLine(r)],
    ], () => edit(r, render));
  }

  function edit(rec, render, preset) {
    const { num, moneyInput, dialogFoot, remove, datalist, n } = K();
    const isNew = !rec;
    const r = rec || { kind: 'move', date: (preset && preset.date) || U.today(), head: null };
    const past = moves();
    const date = ui().dateInput('mf-date', r.date);
    const head = moneyInput('mf-head', r.head);
    const room = ui().input('mf-room', r.room || '', { autocomplete: 'off', list: 'mf-rooms' });
    const finRoom = ui().input('mf-fin', r.finRoom || '', { autocomplete: 'off', list: 'mf-finrooms' });
    const note = ui().input('mf-note', r.note || '', { autocomplete: 'off' });
    const form = h('div.form.fin-form',
      ui().field('Date', date), ui().field('Pigs moved', head),
      h('div.fin-row2', ui().field('From room', room), ui().field('Finisher room', finRoom)),
      ui().field('Note', note),
      datalist('mf-rooms', past.map((x) => x.room)), datalist('mf-finrooms', past.map((x) => x.finRoom)));
    async function save(again) {
      const d = date.value; const hd = num(head.value);
      if (!d) { ui().toast('Type the date the pigs moved.', 'error'); date.focus(); return true; }
      if (!hd || hd < 0) { ui().toast('Type how many pigs moved.', 'error'); head.focus(); return true; }
      const out = { ...r, kind: 'move', date: d, head: Math.round(hd) };
      if (!isNew) out.hand = true; // changed in SwineOS: a later Excel import leaves it alone
      const set = (k, v) => { if (v === '' || v === null || v === undefined) delete out[k]; else out[k] = v; };
      set('room', room.value.trim()); set('finRoom', finRoom.value.trim()); set('note', note.value.trim());
      await S.store.saveFin(out);
      view.year = +d.slice(0, 4);
      render();
      S.store.log(`${isNew ? 'Added' : 'Edited'} move to Finisher: ${n(out.head)} pigs on ${U.fmt(d)}${out.room ? ' from room ' + out.room : ''}`);
      ui().toast(`${isNew ? 'Added' : 'Saved'}: ${n(out.head)} pigs moved ${U.fmt(d)}.`, 'ok');
      if (again) setTimeout(() => edit(null, render, { date: d }), 0);
      return false;
    }
    ui().modal({ title: isNew ? 'New move to Finisher' : 'Edit move to Finisher', width: 560, cls: 'fin-dlg', body: form,
      buttons: dialogFoot(isNew, save, isNew ? null : () => remove(r, `the move of ${n(r.head)} pigs on ${U.fmt(r.date)}`, render)) });
  }

  function importDialog(render) {
    const { ico, n } = K();
    const status = h('div.fin-import-status');
    const pick = h('label.fin-drop',
      h('input', { type: 'file', accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', onchange: (e) => read(e.target.files[0]) }),
      ico('upload'), h('b', 'Choose an Excel file'), h('span', 'The Expense & Income workbook with the MOVED TO FINISHER sheet (.xls or .xlsx)'));
    const m = ui().modal({ title: 'Import moves to Finisher', width: 560, cls: 'fin-dlg', body: h('div', pick, status), buttons: [{ label: 'Close' }] });
    async function read(file) {
      if (!file) return;
      status.innerHTML = ''; status.append(h('p', `Reading ${file.name}…`));
      let res;
      try { res = S.finImport.convertMoves(await S.xls.readWorkbook(await file.arrayBuffer(), S.pigwin && S.pigwin.unzip), view.year); } catch (e) { status.innerHTML = ''; status.append(h('p.fin-err', e.message || String(e))); return; }
      status.innerHTML = '';
      if (!res.records.length) { status.append(h('p.fin-err', 'No moves were found. The workbook needs a sheet named MOVED TO FINISHER with MONTH, DATE and AMOUNT columns.')); return; }
      const total = U.sum(res.records.map((r) => r.head));
      // only moves from an earlier Excel import are replaced; moves typed or changed in SwineOS stay
      const same = moves().filter((r) => r.date.startsWith(String(res.year)));
      const imported = (r) => String(r.id || '').startsWith('x') && !r.hand;
      const replaced = same.filter(imported);
      const kept = same.filter((r) => !imported(r));
      const keptIds = new Set(kept.map((r) => r.id));
      const incoming = res.records.filter((r) => !keptIds.has(r.id));
      const replace = h('input', { type: 'checkbox', checked: true });
      status.append(
        h('p', h('b', file.name), `  ·  ${res.year}`),
        h('table.fin-table', h('tbody', h('tr', h('td', 'Moves to Finisher'), h('td.num', `${n(res.records.length)} groups`), h('td.num', `${n(total)} pigs`)))),
        replaced.length ? h('label.fin-check', replace, ` Replace the ${n(replaced.length)} moves of ${res.year} from an earlier Excel import (recommended, so nothing is counted twice)`) : null,
        kept.length ? h('p.fin-hint', `${n(kept.length)} ${kept.length === 1 ? 'move' : 'moves'} of ${res.year} typed or changed in SwineOS ${kept.length === 1 ? 'stays' : 'stay'} as ${kept.length === 1 ? 'it is' : 'they are'}. If one of them is also a line in this workbook, delete one of the two after importing.`) : null,
        h('div.fin-import-go', h('button.fin-btn.solid', { type: 'button', onclick: go }, ico('upload'), `Import ${n(incoming.length)} moves`)));
      async function go(e) {
        e.target.disabled = true;
        await S.store.putFin(incoming, replaced.length && replace.checked ? replaced.map((r) => r.id) : []);
        S.store.log(`Imported ${incoming.length} moves to Finisher from ${file.name}`);
        view.year = res.year; view.f = { month: '', q: '' };
        m.close();
        render();
        ui().toast(`Imported ${n(res.records.length)} moves (${n(total)} pigs) from ${file.name}.`, 'ok');
      }
    }
  }

  S.finisher = { open, importDialog: (done) => importDialog(done || (() => {})) };
})(window.SOS);
