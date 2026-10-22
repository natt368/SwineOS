/* SwineOS – Action list entry: type results for a whole list of sows, then save them at once. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  const TABS = [['farrow', 'Farrowing'], ['wean', 'Weaning'], ['mate', 'Mating'], ['preg', 'Preg. check'], ['abort', 'Abortion'], ['remove', 'Herd removal'], ['mixed', 'Mixed entry']];

  function longDate(iso) {
    const d = new Date(U.d2n(iso) * U.DAY);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }

  function listDates() {
    const al = S.store.settings.actionLists || {};
    const set = new Set((al.history || []).slice(-20));
    if (al.lastPrinted) set.add(U.addDays(al.lastPrinted, -6));
    set.add(U.weekStart(U.today()));
    set.add(U.addDays(U.weekStart(U.today()), -7));
    return [...set].filter(Boolean).sort().reverse();
  }

  /** Columns per tab: key, label, kind (text|num|date|sel|ro), width */
  function columns(tab) {
    const L = S.store.settings.lists;
    const base = [['id', 'Sow ID', 'ro'], ['alt', 'Alt ID', 'ro'], ['par', 'Parity', 'ro']];
    switch (tab) {
      case 'farrow': return base.concat([['date', 'Farrowing date', 'date'], ['ba', 'BA', 'num'], ['bd', 'BD', 'num'], ['fos', '+/-', 'num'], ['dead', 'Piglet death', 'num'], ['bm', 'BM', 'num']]);
      case 'wean': return base.concat([['farrowed', 'Farrowed', 'ro'], ['onSow', 'On sow', 'ro'], ['date', 'Weaning date', 'date'], ['n', 'Weaned', 'num'], ['kg', 'Weight', 'num']]);
      case 'mate': return base.concat([['status', 'Status', 'ro'], ['date', 'Mating date', 'date'], ['b1', 'Boar 1', 'boar'], ['b2', 'Boar 2', 'boar'], ['b3', 'Boar 3', 'boar'], ['tech', 'Technician', ['', ...L.technicians.filter(Boolean)]]]);
      case 'preg': return base.concat([['served', 'Served', 'ro'], ['days', 'Days', 'ro'], ['date', 'Check date', 'date'], ['res', 'Result', ['', '+', '-']]]);
      case 'abort': return base.concat([['served', 'Served', 'ro'], ['days', 'Days', 'ro'], ['date', 'Abortion date', 'date']]);
      case 'remove': return base.concat([['status', 'Status', 'ro'], ['date', 'Removal date', 'date'], ['kind', 'Type', [['cull', 'Culled'], ['death', 'Died'], ['sold', 'Sold']]], ['reason', 'Reason', ['', ...new Set(L.cullReasons.concat(L.deathReasons))]]]);
      default: return base.concat([['ev', 'Event', [['heat', 'Heat'], ['preg', 'Pregnancy check –'], ['abort', 'Abortion'], ['location', 'Location'], ['disease', 'Disease / treatment'], ['vaccinate', 'Vaccination']]], ['date', 'Date', 'date'], ['text', 'Location / treatment / vaccine', 'text']]);
    }
  }

  function rowsFor(tab, from, to) {
    const st = S.store.settings; const gest = st.gestationLength;
    const fem = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed);
    const mk = (a, extra = {}) => ({ uid: a.uid, id: a.id, alt: a.altId || '', par: A(a).parity, ...extra });
    const byId = (x, y) => U.natCmp(x.id, y.id);
    switch (tab) {
      case 'farrow': return fem.filter((a) => A(a).status === 'Served' && U.diff(U.addDays(A(a).lastService.date, gest), to) <= 7 && A(a).lastService.pregCheck !== '-').sort(byId).map((a) => mk(a));
      case 'wean': return fem.filter((a) => A(a).lactating && U.diff(to, A(a).currentLitter.farrowDate) >= 14).sort(byId).map((a) => mk(a, { farrowed: U.fmt(A(a).currentLitter.farrowDate), onSow: A(a).piglets }));
      case 'mate': return fem.filter((a) => ['Open', 'Gilt'].includes(A(a).status) && (A(a).status === 'Open' || !a.birthDate || U.diff(to, a.birthDate) >= (st.actionLists.giltAge || 200))).sort(byId).map((a) => mk(a, { status: A(a).status }));
      case 'preg': return fem.filter((a) => A(a).status === 'Served' && U.inRange(U.addDays(A(a).lastService.date, 21), U.addDays(from, -21), to)).sort(byId).map((a) => mk(a, { served: U.fmt(A(a).lastService.date), days: U.diff(to, A(a).lastService.date) }));
      case 'abort': return fem.filter((a) => A(a).status === 'Served').sort(byId).map((a) => mk(a, { served: U.fmt(A(a).lastService.date), days: U.diff(to, A(a).lastService.date) }));
      case 'remove': return fem.sort(byId).map((a) => mk(a, { status: A(a).status }));
      default: return [];
    }
  }

  function open() {
    const dates = listDates();
    const st = { from: dates[0], tab: 'farrow', rows: {}, sel: null, extra: {} };
    const win = ui().appWindow({ title: 'Action list entry', cls: 'ale-win', toolbar: [
      { icon: 'enter', label: 'Enter', onClick: save },
      { icon: 'edit', label: 'Edit', onClick: editSel },
      { icon: 'del', label: 'Delete', onClick: delSel },
      '|',
      { icon: 'enter', label: 'Add animal', onClick: addAnimal },
      '|',
      { icon: 'close', label: 'Close', onClick: () => S.app.home() },
    ] });
    const sel = ui().select('ale-from', dates.map((d) => [d, longDate(d)]), st.from, { onchange: (e) => { st.from = e.target.value; st.rows = {}; render(); } });
    const bar = h('div.ale-bar', h('span', 'Action list from:'), sel, h('span.ale-period'));
    const tabs = h('div.ale-tabs', TABS.map(([k, l]) => h('button.subtab', { type: 'button', 'data-k': k, onclick: () => { st.tab = k; render(); } }, l)));
    const host = h('div.ale-host');
    const note = h('div.ale-note', 'Type the results in the white cells. Rows you leave empty are not saved. Press Enter on the toolbar to save all filled rows.');
    win.append(bar, tabs, host, note);

    function to() { return U.addDays(st.from, 6); }
    function data() {
      const key = st.tab;
      if (!st.rows[key]) st.rows[key] = rowsFor(key, st.from, to()).concat(st.extra[key] || []);
      return st.rows[key];
    }
    function render() {
      U.$$('.subtab', tabs).forEach((b) => b.classList.toggle('active', b.dataset.k === st.tab));
      bar.querySelector('.ale-period').textContent = `${U.fmt(st.from)} – ${U.fmt(to())}`;
      const cols = columns(st.tab);
      const rows = data();
      const boars = S.store.animals().filter((b) => b.sex === 'M' && !A(b).removed && !b.blocked).map((b) => b.id).sort(U.natCmp);
      const t = h('table.grid.ale-grid',
        h('thead', h('tr', cols.map(([, l, k]) => h('th', { class: k === 'num' ? 'num' : null }, l)))),
        h('tbody', rows.length ? rows.map((r, i) => {
          const tr = h('tr', { class: st.sel === i ? 'sel' : null, onclick: () => { st.sel = i; U.$$('tr.sel', host).forEach((x) => x.classList.remove('sel')); tr.classList.add('sel'); } });
          cols.forEach(([key, , kind]) => {
            if (kind === 'ro') { tr.appendChild(h('td', { class: typeof r[key] === 'number' ? 'num' : null }, r[key] ?? '')); return; }
            let inp;
            const onIn = (e) => { r[key] = e.target.value; if (key !== 'date' && e.target.value !== '' && !r.date) { r.date = defaultDate(); const d = tr.querySelector('input.dt'); if (d) d.value = r.date; } tr.classList.toggle('filled', isFilled(r)); };
            if (kind === 'date') inp = ui().dateInput(null, r.date || '', { max: S.entry.maxDate(st.tab === 'mixed' ? r.type || 'wean' : st.tab), oninput: onIn, onchange: onIn });
            else if (kind === 'num') inp = h('input', { type: 'number', inputmode: 'numeric', value: r[key] ?? '', placeholder: '0', oninput: onIn, step: key === 'kg' ? '0.1' : '1' });
            else if (kind === 'boar') inp = h('input', { value: r[key] || '', list: 'ale-boars', oninput: onIn, autocomplete: 'off' });
            else if (Array.isArray(kind)) inp = ui().select(null, kind, r[key] ?? (key === 'kind' ? 'cull' : key === 'ev' ? 'heat' : ''), { onchange: onIn });
            else inp = h('input', { value: r[key] || '', oninput: onIn });
            if (Array.isArray(kind) && r[key] === undefined) r[key] = inp.value;
            tr.appendChild(h('td', { class: 'cell' + (kind === 'num' ? ' num' : '') }, inp));
          });
          tr.classList.toggle('filled', isFilled(r));
          return tr;
        }) : h('tr.empty', h('td', { colspan: cols.length }, st.tab === 'mixed' ? 'Use Add animal to add sows to this list.' : 'No sows on this list for the selected week.'))));
      host.innerHTML = '';
      host.append(h('datalist#ale-boars', boars.map((b) => h('option', { value: b }))), t);
    }
    function defaultDate() { const t = U.today(); return t < st.from ? st.from : t > to() ? to() : t; }
    function isFilled(r) {
      switch (st.tab) {
        case 'farrow': return !!r.date && r.ba !== undefined && r.ba !== '';
        case 'wean': return !!r.date && r.n !== undefined && r.n !== '';
        case 'mate': return !!r.date && !!r.b1;
        case 'preg': return !!r.date && !!r.res;
        default: return !!r.date;
      }
    }
    function eventsFor(r) {
      const n = (v) => (v === '' || v === undefined ? 0 : Number(v));
      switch (st.tab) {
        case 'farrow': {
          const ev = [{ type: 'farrow', date: r.date, liveBorn: n(r.ba), stillborn: n(r.bd), mummies: n(r.bm) }];
          if (n(r.fos)) ev.push({ type: 'foster', date: r.date, count: n(r.fos) });
          if (n(r.dead)) ev.push({ type: 'pigdeath', date: r.date, count: n(r.dead), cause: 'Unknown' });
          return ev;
        }
        case 'wean': return [{ type: 'wean', date: r.date, count: n(r.n), weight: r.kg ? n(r.kg) : undefined }];
        case 'mate': return [r.b1, r.b2, r.b3].map((b, i) => (b ? { type: 'mate', date: U.addDays(r.date, i), boar: b.trim(), method: 'AI', tech: r.tech || undefined } : null)).filter((e) => e && e.date <= U.today());
        case 'preg': return [{ type: 'preg', date: r.date, result: r.res, method: 'Ultrasound' }];
        case 'abort': return [{ type: 'abort', date: r.date }];
        case 'remove': return [{ type: 'remove', date: r.date, kind: r.kind || 'cull', reason: r.reason || undefined }];
        default: {
          const t = r.ev || 'heat';
          if (t === 'preg') return [{ type: 'preg', date: r.date, result: '-' }];
          if (t === 'location') return [{ type: 'location', date: r.date, location: r.text || '' }];
          if (t === 'disease') return [{ type: 'disease', date: r.date, treatment: r.text || '' }];
          if (t === 'vaccinate') return [{ type: 'vaccinate', date: r.date, vaccine: r.text || '' }];
          return [{ type: t, date: r.date }];
        }
      }
    }
    async function save() {
      const rows = data().filter(isFilled);
      if (!rows.length) { ui().toast('Nothing to save: fill in the date and result for at least one sow.'); return; }
      const done = []; const skipped = []; const warn = [];
      for (const r of rows) {
        const a = S.store.get(r.uid);
        if (!a) { skipped.push(`${r.id}: animal not found`); continue; }
        const evs = eventsFor(r).map((e) => { Object.keys(e).forEach((k) => e[k] === undefined && delete e[k]); return e; });
        // eslint-disable-next-line no-await-in-loop
        const res = await S.entry.addEvents(a, evs);
        if (res.errors.length) skipped.push(`${r.id}: ${res.errors.join(' ')}`);
        else { done.push(r); res.warnings.forEach((w) => warn.push(`${r.id}: ${w}`)); }
      }
      st.rows[st.tab] = data().filter((r) => !done.includes(r));
      render();
      const msg = [`Saved ${done.length} of ${rows.length} rows.`];
      if (skipped.length) msg.push('', 'Not saved:', ...skipped);
      if (warn.length) msg.push('', 'Saved, but please check:', ...warn);
      if (skipped.length || warn.length) ui().alertBox('Action list entry', msg.join('\n')); else ui().toast(msg[0], 'ok');
    }
    function editSel() {
      const r = data()[st.sel];
      if (!r) { ui().toast('Click a row first.'); return; }
      const a = S.store.get(r.uid);
      const type = st.tab === 'mixed' ? (r.ev || 'heat') : st.tab;
      S.entry.openEventDialog(type, a, null, () => { st.rows[st.tab] = null; render(); });
    }
    function delSel() {
      const rows = data();
      if (st.sel === null || !rows[st.sel]) { ui().toast('Click a row first.'); return; }
      rows.splice(st.sel, 1); st.sel = null; render();
    }
    function addAnimal() {
      const q = ui().input('ale-add', '', { placeholder: 'Sow ID' });
      ui().modal({ title: 'Add animal', width: 360, body: h('div.form', ui().field('Sow ID', q)), buttons: [
        { label: 'Add', primary: true, onClick: () => {
          const a = S.store.findById(q.value);
          if (!a) { ui().toast(`No animal with ID ${q.value}.`); return true; }
          const r = A(a);
          const row = { uid: a.uid, id: a.id, alt: a.altId || '', par: r.parity, status: r.status, farrowed: r.currentLitter ? U.fmt(r.currentLitter.farrowDate) : '', onSow: r.piglets, served: r.lastService ? U.fmt(r.lastService.date) : '', days: r.lastService ? U.diff(to(), r.lastService.date) : '' };
          (st.extra[st.tab] = st.extra[st.tab] || []).push(row);
          data().push(row);
          render();
        } },
        { label: 'Cancel' },
      ] });
    }
    win.refresh = () => { /* keep typed values; lists refresh when the week or tab changes */ };
    render();
    return win;
  }

  S.actionEntry = { open };
})(window.SOS);
