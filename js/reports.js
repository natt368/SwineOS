/* SwineOS – Reports menu and report windows. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);
  const n1 = (v) => U.num(v, 1); const n2 = (v) => U.num(v, 2); const n0 = (v) => U.num(v, 0);

  /* ---------- small table helper ---------- */
  function table(head, rows, opts = {}) {
    const t = h('table.rtable' + (opts.cls ? '.' + opts.cls : ''),
      h('thead', h('tr', head.map((c, i) => h('th', { class: i ? 'num' : null }, c)))),
      h('tbody', rows.map((r) => h('tr', { class: r._cls || null }, r.map((c, i) => h('td', { class: i ? 'num' : null }, c instanceof Node ? c : (c ?? '')))))));
    const wrap = h('div.rtable-wrap', t);
    wrap.csv = [head, ...rows.map((r) => r.map((c) => (c instanceof Node ? c.textContent : c)))];
    return wrap;
  }
  const parGroup = (p) => (p >= 7 ? '7+' : String(p));
  const PAR_KEYS = ['1', '2', '3', '4', '5', '6', '7+'];
  const svcParKey = (p) => (p === 0 ? '0 (gilt)' : p >= 7 ? '7+' : String(p));

  /* ---------- report window frame ---------- */
  function reportWindow({ title, subtitle, build, params = {}, extra, noDates, defaults }) {
    const today = U.today();
    const p = { begin: U.addDays(today, -365), end: today, parity: '', ...(defaults || {}) };
    let last = null;
    const win = ui().appWindow({ title, cls: 'report-win', toolbar: [
      { icon: 'update', label: 'Update', onClick: () => run() },
      { icon: 'info', label: 'Cell info', onClick: () => ui().alertBox('About this report', (last && last.info) || 'Figures are calculated from the event records for the analysis period shown. Change the dates or selection at the bottom and press Update.') },
      { icon: 'settings', label: 'Settings', onClick: () => S.settingsUI.open('report') },
      '|',
      { icon: 'graph', label: 'Graph', onClick: () => { if (last && last.chart) ui().modal({ title: 'Graph – ' + title, body: last.chart(), width: 860, buttons: [{ label: 'Close', primary: true }] }); else ui().toast('This report has no graph.'); } },
      '|',
      { icon: 'print', label: 'Print', onClick: () => last && ui().printPreview(title, last.node.cloneNode(true)) },
      { icon: 'export', label: 'Export', onClick: () => last && last.csv && ui().saveFile(title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv', U.csv(last.csv), 'text/csv') },
      '|',
      { icon: 'close', label: 'Close', onClick: () => S.app.reports() },
    ] });
    const head = h('div.rep-head', h('div.rep-logo', ui().icon('sow'), h('span', 'Swine', h('b', 'OS'))), h('div.rep-titles', h('div.rep-title', title), h('div.rep-period'), h('div.rep-sub', subtitle || '')));
    const body = h('div.rep-body');
    const shadeNote = h('div.rep-note', h('i.shade-key'), 'Results in shaded area may be biased by incomplete data for some breeding females');
    const panel = h('div.rep-panel');
    if (!noDates) {
      panel.append(
        ui().field('Begin date', ui().dateInput('r-begin', p.begin, { onchange: (e) => { p.begin = e.target.value; run(); } })),
        ui().field('End date', ui().dateInput('r-end', p.end, { onchange: (e) => { p.end = e.target.value; run(); } })),
        ui().field('Parity', ui().input('r-par', p.parity, { placeholder: 'all, or 1 / 2-5 / 6+', onchange: (e) => { p.parity = e.target.value; run(); } })),
        h('div.quick', ['30 d', '13 wk', '6 mo', '1 yr', 'YTD'].map((q) => h('button.wbtn.sm', { type: 'button', onclick: () => {
          const e = U.today(); let b;
          if (q === '30 d') b = U.addDays(e, -29); else if (q === '13 wk') b = U.addDays(e, -90); else if (q === '6 mo') b = U.addDays(U.addMonths(e, -6), 1); else if (q === '1 yr') b = U.addDays(U.addMonths(e, -12), 1); else b = e.slice(0, 4) + '-01-01';
          p.begin = b; p.end = e; U.$('#r-begin').value = b; U.$('#r-end').value = e; run();
        } }, q))));
    }
    if (extra) extra(panel, p, () => run());
    win.append(head, body, shadeNote, panel);
    function run() {
      if (!noDates && p.begin > p.end) { ui().toast('Begin date is after end date.', 'error'); return; }
      const per = noDates ? (p.periodText || '') : `Analysis period from ${U.fmt(p.begin)} to ${U.fmt(p.end)} [ ${U.diff(p.end, p.begin) + 1} Day(s) ]`;
      head.querySelector('.rep-period').textContent = per;
      body.innerHTML = '';
      try {
        last = build(p);
      } catch (err) { console.error(err); last = { node: h('p.msg', 'Could not build this report: ' + err.message) }; }
      body.appendChild(last.node);
      shadeNote.hidden = !last.shaded;
    }
    win.refresh = run;
    win.params = p;
    run();
    return win;
  }

  /* ================= HERD PERFORMANCE ================= */
  function herdPerformance() {
    const today = U.today();
    const p = { tab: 'K', option: 'Seasonal', cols: 1, len: 1, unit: 'Year(s)', end: today, begin: U.addDays(U.addMonths(today, -12), 1), parity: '' };
    let last = null;
    const win = ui().appWindow({ title: 'Herd performance', cls: 'report-win hp-win', toolbar: [
      { icon: 'update', label: 'Update', onClick: () => run() },
      { icon: 'info', label: 'Cell info', onClick: () => cellInfo() },
      { icon: 'settings', label: 'Settings', onClick: () => S.settingsUI.open('targets') },
      '|',
      { icon: 'graph', label: 'Graph', onClick: () => graph() },
      '|',
      { icon: 'print', label: 'Print', onClick: () => last && ui().printPreview('Herd performance', last.node.cloneNode(true)) },
      { icon: 'export', label: 'Export', onClick: () => last && ui().saveFile('herd-performance.csv', U.csv(last.csv), 'text/csv') },
      '|',
      { icon: 'close', label: 'Close', onClick: () => S.app.reports() },
    ] });
    const head = h('div.rep-head', h('div.rep-logo', ui().icon('sow'), h('span', 'Swine', h('b', 'OS'))), h('div.rep-titles', h('div.rep-title', 'Herd performance'), h('div.rep-period'), h('div.rep-sub', 'Seasonal trends in Key indicators')));
    const body = h('div.rep-body');
    const note = h('div.rep-note', h('i.shade-key'), 'Results in shaded area may be biased by incomplete data for some breeding females');
    const tabs = h('div.rep-tabs', S.calc.TABS.map(([k, l]) => h('button.rtab', { type: 'button', 'data-k': k, onclick: () => { p.tab = k; run(); } }, l)));
    const begin = ui().dateInput('hp-begin', p.begin, { onchange: (e) => { p.begin = e.target.value; p.option = 'Period'; U.$('#hp-opt').value = 'Period'; run(); } });
    const end = ui().dateInput('hp-end', p.end, { onchange: (e) => { p.end = e.target.value; run(); } });
    const panel = h('div.rep-panel.hp-panel',
      ui().field('Report Option', ui().select('hp-opt', [['Seasonal', 'Seasonal'], ['Period', 'Begin – end period']], p.option, { onchange: (e) => { p.option = e.target.value; run(); } })),
      ui().field('Columns', ui().input('hp-cols', p.cols, { type: 'number', min: 1, max: 24, onchange: (e) => { p.cols = Math.max(1, Math.min(24, +e.target.value || 1)); run(); } }), 'periods'),
      ui().field('No. / period length', h('span.inline', ui().input('hp-len', p.len, { type: 'number', min: 1, max: 99, onchange: (e) => { p.len = Math.max(1, +e.target.value || 1); run(); } }),
        ui().select('hp-unit', ['Day(s)', 'Week(s)', 'Month(s)', 'Quarter(s)', 'Year(s)'], p.unit, { onchange: (e) => { p.unit = e.target.value; run(); } }))),
      ui().field('Begin date', begin), ui().field('End date', end),
      ui().field('Detailed selection (parity)', ui().input('hp-par', '', { placeholder: 'all, or 1 / 2-5 / 6+', onchange: (e) => { p.parity = e.target.value; run(); } })),
      h('div.quick', [['13 × 4 wk', () => { p.option = 'Seasonal'; p.cols = 13; p.len = 4; p.unit = 'Week(s)'; }], ['12 months', () => { p.option = 'Seasonal'; p.cols = 12; p.len = 1; p.unit = 'Month(s)'; }], ['4 quarters', () => { p.option = 'Seasonal'; p.cols = 4; p.len = 1; p.unit = 'Quarter(s)'; }], ['Last year', () => { p.option = 'Seasonal'; p.cols = 1; p.len = 1; p.unit = 'Year(s)'; }]]
        .map(([l, f]) => h('button.wbtn.sm', { type: 'button', onclick: () => { f(); U.$('#hp-opt').value = p.option; U.$('#hp-cols').value = p.cols; U.$('#hp-len').value = p.len; U.$('#hp-unit').value = p.unit; run(); } }, l))));
    win.append(head, body, note, tabs, panel);

    function run() {
      if (p.option === 'Period') { p.periods = [[p.begin, p.end]]; }
      else {
        p.periods = S.calc.periods(p.end, p.cols, p.len, p.unit);
        p.begin = p.periods[0][0]; begin.value = p.begin;
      }
      const pp = U.parityFilter(p.parity);
      const stats = p.periods.map(([b, e]) => S.calc.periodStats(b, e, pp));
      const total = p.periods.length > 1 ? S.calc.periodStats(p.periods[0][0], p.end, pp) : null;
      head.querySelector('.rep-period').textContent = `Analysis period from ${U.fmt(p.begin)} to ${U.fmt(p.end)} [ ${U.diff(p.end, p.begin) + 1} Day(s) ]` + (p.parity ? `  ·  parity ${p.parity}` : '');
      head.querySelector('.rep-sub').textContent = (p.option === 'Seasonal' ? 'Seasonal trends in ' : 'Period results – ') + (S.calc.TABS.find((t) => t[0] === p.tab)[1]) + ' indicators';
      U.$$('.rtab', tabs).forEach((b) => b.classList.toggle('active', b.dataset.k === p.tab));
      const metrics = S.calc.METRICS.filter((m) => p.tab === 'A' || m.tabs.includes(p.tab));
      const cols = stats.map((x) => x);
      if (total) cols.push(total);
      const tgt = S.store.settings.targets;
      let shaded = false;
      const t = h('table.hp-table',
        h('thead',
          h('tr', h('th.lbl', 'Begin date'), cols.map((x, i) => h('th', { class: i === stats.length ? 'tot' : null }, U.fmt(x.begin))), h('th.tgt', 'Target')),
          h('tr', h('th.lbl', 'End date'), cols.map((x, i) => h('th', { class: i === stats.length ? 'tot' : null }, U.fmt(x.end))), h('th.tgt', ''))),
        h('tbody', metrics.map((m) => h('tr', { 'data-m': m.id },
          h('td.lbl', m.label),
          cols.map((x, i) => {
            const sh = m.shade && m.shade(x);
            const v = m.v(x);
            if (sh) shaded = true;
            let cls = sh ? 'shade' : '';
            if (m.target && Number.isFinite(v) && tgt[m.target] !== undefined && !sh) {
              const good = m.lower ? v <= tgt[m.target] : v >= tgt[m.target];
              cls += good ? ' good' : ' bad';
            }
            if (i === stats.length) cls += ' tot';
            return h('td', { class: cls.trim() || null, 'data-i': i, onclick: (ev) => selectCell(m, i, ev.currentTarget) }, m.f(v));
          }),
          h('td.tgt', m.target && tgt[m.target] !== undefined ? String(tgt[m.target]) : '')))));
      body.innerHTML = '';
      body.appendChild(h('div.hp-scroll', t));
      note.hidden = !shaded;
      last = {
        node: t, metrics, stats: cols,
        csv: [['Indicator', ...cols.map((x) => `${U.fmt(x.begin)} - ${U.fmt(x.end)}`), 'Target'], ...metrics.map((m) => [m.label, ...cols.map((x) => m.f(m.v(x))), m.target ? tgt[m.target] : ''])],
      };
    }
    let selCell = null;
    function selectCell(m, i, td) {
      U.$$('.hp-table td.cellsel').forEach((x) => x.classList.remove('cellsel'));
      td.classList.add('cellsel');
      selCell = { m, i };
    }
    function cellInfo() {
      const info = {
        endBF: 'Females with a herd entry date (or first service) on or before the end date that were not removed by then.',
        weanedMbf: 'Pigs weaned in the period ÷ average mated female inventory, scaled to 365 days. Mated females are females served at least once.',
        weanedBf: 'Pigs weaned in the period ÷ average breeding female inventory (incl. entered gilts not yet served), scaled to 365 days.',
        littersMbf: 'Litters farrowed in the period ÷ average mated female inventory, scaled to 365 days.',
        fr: 'Of the services made in the period with a known outcome, the % that farrowed. Shaded while some services are still waiting for their outcome.',
        npd: 'Days a breeding female is neither pregnant (with a pregnancy that ended in farrowing) nor lactating, per female per year.',
        pwm: 'Piglet deaths in the period ÷ (deaths + pigs weaned in the period).',
        wsi: 'Average days from weaning to the first service after it, for services in the period.',
        fi: 'Average days between consecutive farrowings, for litters farrowed in the period.',
        cullRate: 'Females culled or sold in the period ÷ average breeding female inventory, annualised, in %.',
        mortRate: 'Females that died in the period ÷ average breeding female inventory, annualised, in %.',
      };
      if (!selCell) { ui().alertBox('Cell info', 'Click a figure in the table first, then press Cell info to see how it is calculated and which numbers it uses.'); return; }
      const x = last.stats[selCell.i];
      const parts = [
        `${selCell.m.label}: ${selCell.m.f(selCell.m.v(x)) || '–'}`,
        `Period ${U.fmt(x.begin)} – ${U.fmt(x.end)} (${x.days} days)`,
        info[selCell.m.id] || '',
        `Avg. BF ${n1(x.avgBF)} · Avg. MBF ${n1(x.avgMBF)} · Services ${x.services} (${x.frPending} pending) · Litters ${x.litters} · Pigs weaned ${x.pigsWeaned} · Piglet deaths ${x.deaths}`,
      ];
      ui().alertBox('Cell info', parts.filter(Boolean).join('\n\n'));
    }
    function graph() {
      if (!last) return;
      const m = selCell ? selCell.m : last.metrics.find((x) => x.id === 'weanedMbf') || last.metrics[0];
      const st = last.stats.slice(0, p.periods.length);
      const pick = ui().select('g-m', last.metrics.map((x) => [x.id, x.label]), m.id);
      const host = h('div');
      const draw = () => {
        const mm = last.metrics.find((x) => x.id === pick.value);
        host.innerHTML = '';
        host.appendChild(ui().lineChart({ labels: st.map((x) => U.fmt(x.end)), series: [{ name: mm.label, values: st.map((x) => mm.v(x)) }], bars: st.length < 3, yLabel: mm.label, target: mm.target ? S.store.settings.targets[mm.target] : undefined }));
      };
      pick.addEventListener('change', draw);
      ui().modal({ title: 'Graph – Herd performance', body: h('div', ui().field('Indicator', pick), host), width: 880, buttons: [{ label: 'Close', primary: true }] });
      draw();
    }
    win.refresh = run;
    run();
    return win;
  }

  /* ================= LITTER PERFORMANCE ================= */
  function littersIn(p) {
    const pp = U.parityFilter(p.parity);
    return S.calc.collect().litters.filter((l) => U.inRange(l.farrowDate, p.begin, p.end) && pp(l.parity));
  }
  function weanedIn(p) {
    const pp = U.parityFilter(p.parity);
    return S.calc.collect().litters.filter((l) => l.weanDate && l.lactLen !== null && U.inRange(l.weanDate, p.begin, p.end) && pp(l.parity));
  }
  function byParity(list, key = (l) => parGroup(l.parity), keys = PAR_KEYS) {
    const g = {}; keys.forEach((k) => { g[k] = []; });
    list.forEach((l) => { const k = key(l); (g[k] = g[k] || []).push(l); });
    return g;
  }

  function pigsBorn() {
    return reportWindow({ title: 'Pigs born', subtitle: 'Litter size at birth by parity', build: (p) => {
      const L = littersIn(p); const g = byParity(L);
      const row = (k, ls) => [k, ls.length, n1(U.avg(ls.map((l) => l.totalBorn))), n1(U.avg(ls.map((l) => l.liveBorn))), n2(U.avg(ls.map((l) => l.stillborn))), n2(U.avg(ls.map((l) => l.mummies))), n1(U.pct(U.sum(ls.map((l) => l.stillborn)), U.sum(ls.map((l) => l.totalBorn)))), n1(U.pct(ls.filter((l) => l.liveBorn < 7).length, ls.length)), n1(U.avg(ls.map((l) => l.gestLen)))];
      const rows = PAR_KEYS.filter((k) => g[k].length).map((k) => row(k, g[k]));
      const tot = row('Total', L); tot._cls = 'total';
      const t1 = table(['Parity', 'Litters', 'Total born', 'Born alive', 'Stillborn', 'Mummies', 'Stillborn %', '< 7 BA %', 'Gestation'], [...rows, tot]);
      const dist = {}; L.forEach((l) => { const k = Math.min(l.totalBorn, 25); dist[k] = (dist[k] || 0) + 1; });
      const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
      const t2 = table(['Total born', 'Litters', '%', 'Cumulative %'], (() => { let c = 0; return keys.map((k) => { c += dist[k]; return [k === 25 ? '25+' : k, dist[k], n1(U.pct(dist[k], L.length)), n1(U.pct(c, L.length))]; }); })());
      return { node: h('div', t1, h('h4', 'Distribution of total born'), t2), csv: t1.csv,
        chart: () => ui().lineChart({ labels: rows.map((r) => 'P' + r[0]), series: [{ name: 'Total born', values: rows.map((r) => +r[2]) }, { name: 'Born alive', values: rows.map((r) => +r[3]) }], bars: true }) };
    } });
  }

  function preWeaningMortality() {
    return reportWindow({ title: 'Pre-weaning mortality', subtitle: 'Piglet losses for litters weaned in the period', build: (p) => {
      const L = weanedIn(p); const g = byParity(L);
      const row = (k, ls) => { const ba = U.sum(ls.map((l) => l.liveBorn + l.fosterIn - l.fosterOut)); const d = U.sum(ls.map((l) => l.deaths)); return [k, ls.length, U.sum(ls.map((l) => l.liveBorn)), U.sum(ls.map((l) => l.fosterIn - l.fosterOut)), d, n1(U.pct(d, ba)), n2(d / (ls.length || 1))]; };
      const rows = PAR_KEYS.filter((k) => g[k].length).map((k) => row(k, g[k]));
      const tot = row('Total', L); tot._cls = 'total';
      const t1 = table(['Parity', 'Litters', 'Born alive', 'Net fostered', 'Deaths', 'Mortality %', 'Deaths / litter'], [...rows, tot]);
      const causes = {}; L.forEach((l) => Object.entries(l.deathsByCause).forEach(([c, n]) => { causes[c] = (causes[c] || 0) + n; }));
      const totD = U.sum(Object.values(causes));
      const cr = Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([c, n]) => [c, n, n1(U.pct(n, totD))]);
      // by age at death (events)
      const age = { '0-1 d': 0, '2-3 d': 0, '4-7 d': 0, '8-14 d': 0, '15+ d': 0 };
      const pp = U.parityFilter(p.parity);
      S.store.animals().forEach((a) => { const r = A(a); r.litters.forEach((l) => { if (!pp(l.parity)) return; r.events.forEach((e) => { if (e.type !== 'pigdeath' || !U.inRange(e.date, p.begin, p.end) || e.date < l.farrowDate || (l.weanDate && e.date > l.weanDate)) return; const d = U.diff(e.date, l.farrowDate); const k = d <= 1 ? '0-1 d' : d <= 3 ? '2-3 d' : d <= 7 ? '4-7 d' : d <= 14 ? '8-14 d' : '15+ d'; age[k] += Number(e.count) || 0; }); }); });
      const totA = U.sum(Object.values(age));
      return { node: h('div', t1, h('div.two', h('div', h('h4', 'Deaths by cause'), table(['Cause', 'Deaths', '%'], cr)), h('div', h('h4', 'Deaths by piglet age (deaths dated in period)'), table(['Age', 'Deaths', '%'], Object.entries(age).map(([k, v]) => [k, v, n1(U.pct(v, totA))]))))), csv: t1.csv,
        chart: () => ui().lineChart({ labels: cr.map((r) => r[0]), series: [{ name: 'Deaths', values: cr.map((r) => r[1]) }], bars: true }) };
    } });
  }

  function pigsWeaned() {
    return reportWindow({ title: 'Pigs weaned', subtitle: 'Litters weaned in the period', build: (p) => {
      const L = weanedIn(p); const g = byParity(L);
      const row = (k, ls) => [k, ls.length, U.sum(ls.map((l) => l.weaned)), n1(U.avg(ls.map((l) => l.weaned))), n1(U.avg(ls.map((l) => l.liveBorn))), n1(U.avg(ls.map((l) => l.lactLen))), n1(U.pct(ls.filter((l) => l.weaned < 10).length, ls.length))];
      const rows = PAR_KEYS.filter((k) => g[k].length).map((k) => row(k, g[k]));
      const tot = row('Total', L); tot._cls = 'total';
      const t1 = table(['Parity', 'Litters weaned', 'Pigs weaned', 'Weaned / litter', 'Born alive / litter', 'Lactation length', '< 10 weaned %'], [...rows, tot]);
      const wk = {}; L.forEach((l) => { const k = U.weekStart(l.weanDate); (wk[k] = wk[k] || []).push(l); });
      const wr = Object.keys(wk).sort().map((k) => [U.fmt(k), wk[k].length, U.sum(wk[k].map((l) => l.weaned)), n1(U.avg(wk[k].map((l) => l.weaned))), n1(U.avg(wk[k].map((l) => l.lactLen)))]);
      return { node: h('div', t1, h('h4', 'By week of weaning'), table(['Week of', 'Litters', 'Pigs weaned', 'Per litter', 'Lactation'], wr)), csv: t1.csv,
        chart: () => ui().lineChart({ labels: wr.map((r) => r[0]), series: [{ name: 'Pigs weaned / litter', values: wr.map((r) => +r[3]) }] }) };
    } });
  }

  function weaningWeights() {
    return reportWindow({ title: 'Litter weaning weights', subtitle: 'Litters weaned in the period with a recorded weight', build: (p) => {
      const L = weanedIn(p).filter((l) => l.weanWeightCount);
      const g = byParity(L);
      const row = (k, ls) => [k, ls.length, n1(U.avg(ls.map((l) => l.weanWeight))), n2(U.sum(ls.map((l) => l.weanWeight)) / (U.sum(ls.map((l) => l.weanWeightCount)) || 1)), n1(U.avg(ls.map((l) => l.weaned))), n1(U.avg(ls.map((l) => l.lactLen)))];
      const rows = PAR_KEYS.filter((k) => g[k].length).map((k) => row(k, g[k]));
      const tot = row('Total', L); tot._cls = 'total';
      const t1 = table(['Parity', 'Litters', 'Litter weight (kg)', 'Weight / pig (kg)', 'Pigs weaned', 'Lactation'], [...rows, tot]);
      const ll = byParity(L, (l) => (l.lactLen <= 17 ? '≤ 17 d' : l.lactLen <= 20 ? '18-20 d' : l.lactLen <= 23 ? '21-23 d' : '24+ d'), ['≤ 17 d', '18-20 d', '21-23 d', '24+ d']);
      const t2 = table(['Lactation length', 'Litters', 'Litter weight (kg)', 'Weight / pig (kg)', 'Pigs weaned', 'Lactation'], Object.keys(ll).filter((k) => ll[k].length).map((k) => row(k, ll[k])));
      return { node: h('div', t1, h('h4', 'By lactation length'), t2), csv: t1.csv };
    } });
  }

  /* ================= MATING PERFORMANCE ================= */
  function servicesIn(p) {
    const pp = U.parityFilter(p.parity);
    return S.calc.collect().services.filter((s) => U.inRange(s.date, p.begin, p.end) && (p.parity ? pp(s.parity) : true));
  }
  function matingsPerService() {
    return reportWindow({ title: 'Matings per service', subtitle: 'Number of matings per service and the effect on results', build: (p) => {
      const sv = servicesIn(p);
      const g = byParity(sv, (s) => (s.matings >= 3 ? '3+' : String(s.matings)), ['1', '2', '3+']);
      const row = (k, ss) => { const done = ss.filter((s) => s.outcome !== 'pending' && s.outcome !== 'unknown'); const f = done.filter((s) => s.outcome === 'farrow'); return [k, ss.length, n1(U.pct(ss.length, sv.length)), done.length, n1(U.pct(f.length, done.length)), n1(U.avg(f.map((s) => { const l = s.r.litters.find((x) => x.service && x.service.date === s.date); return l ? l.liveBorn : NaN; })))]; };
      const rows = Object.keys(g).filter((k) => g[k].length).map((k) => row(k, g[k]));
      const tot = row('Total', sv); tot._cls = 'total';
      const t = table(['Matings', 'Services', '% of services', 'Known outcome', 'Farrowing rate %', 'Next litter born alive'], [...rows, tot]);
      const bp = byParity(sv, (s) => svcParKey(s.parity), ['0 (gilt)', ...PAR_KEYS]);
      const t2 = table(['Parity at service', 'Services', 'Matings / service'], Object.keys(bp).filter((k) => bp[k].length).map((k) => [k, bp[k].length, n2(U.avg(bp[k].map((s) => s.matings)))]));
      return { node: h('div', t, h('h4', 'By parity at service'), t2), csv: t.csv };
    } });
  }

  function wsiReport() {
    return reportWindow({ title: 'Wean to service interval', subtitle: 'First services after weaning in the period', build: (p) => {
      const sv = servicesIn(p).filter((s) => s.wsi !== null && s.wsi !== undefined);
      const bins = ['0-3', '4', '5', '6', '7', '8-14', '15-21', '22-35', '36+'];
      const bin = (d) => (d <= 3 ? '0-3' : d <= 7 ? String(d) : d <= 14 ? '8-14' : d <= 21 ? '15-21' : d <= 35 ? '22-35' : '36+');
      const g = byParity(sv, (s) => bin(s.wsi), bins);
      let c = 0;
      const rows = bins.map((k) => { const ss = g[k]; c += ss.length; const done = ss.filter((s) => !['pending', 'unknown'].includes(s.outcome)); return [k, ss.length, n1(U.pct(ss.length, sv.length)), n1(U.pct(c, sv.length)), n1(U.pct(done.filter((s) => s.outcome === 'farrow').length, done.length))]; });
      const t = table(['Days', 'Services', '%', 'Cumulative %', 'Farrowing rate %'], rows);
      const bp = byParity(sv, (s) => parGroup(s.parity));
      const t2 = table(['Weaned parity', 'Services', 'Avg. WSI', '% ≤ 7 days'], PAR_KEYS.filter((k) => bp[k].length).map((k) => [k, bp[k].length, n1(U.avg(bp[k].map((s) => s.wsi))), n1(U.pct(bp[k].filter((s) => s.wsi <= 7).length, bp[k].length))]));
      return { node: h('div', h('div.vsum', `${sv.length} services · average ${n1(U.avg(sv.map((s) => s.wsi)))} days · median ${n1(U.median(sv.map((s) => s.wsi)))} days`), t, h('h4', 'By parity'), t2), csv: t.csv,
        chart: () => ui().lineChart({ labels: bins, series: [{ name: 'Services', values: rows.map((r) => r[1]) }], bars: true }) };
    } });
  }

  function returnsReport() {
    return reportWindow({ title: 'Returns to service', subtitle: 'Outcome of services made in the period', build: (p) => {
      const sv = servicesIn(p);
      const done = sv.filter((s) => !['pending', 'unknown'].includes(s.outcome));
      const ret = done.filter((s) => s.outcome === 'return' || s.outcome === 'neg');
      const iv = (s) => U.diff(s.outcomeDate, s.date);
      const cls = (d) => (d < 18 ? '< 18 d (early)' : d <= 24 ? '18-24 d (regular)' : d <= 38 ? '25-38 d (irregular)' : d <= 45 ? '39-45 d (double)' : '46+ d (late)');
      const keys = ['< 18 d (early)', '18-24 d (regular)', '25-38 d (irregular)', '39-45 d (double)', '46+ d (late)'];
      const g = byParity(ret, (s) => cls(iv(s)), keys);
      const t = table(['Return interval', 'Returns', '% of returns', '% of services'], keys.map((k) => [k, g[k].length, n1(U.pct(g[k].length, ret.length)), n1(U.pct(g[k].length, done.length))]));
      const out = {}; done.forEach((s) => { out[s.outcome] = (out[s.outcome] || 0) + 1; });
      const names = { farrow: 'Farrowed', return: 'Returned to heat', neg: 'Negative pregnancy check', abort: 'Aborted', removed: 'Removed while pregnant / served' };
      const t2 = table(['Outcome', 'Services', '%'], Object.entries(out).map(([k, v]) => [names[k] || k, v, n1(U.pct(v, done.length))]).concat([['Outcome still unknown', sv.length - done.length, '']]));
      const bp = byParity(done, (s) => svcParKey(s.parity), ['0 (gilt)', ...PAR_KEYS]);
      const t3 = table(['Parity at service', 'Services', 'Returns %', 'Farrowing rate %'], Object.keys(bp).filter((k) => bp[k].length).map((k) => [k, bp[k].length, n1(U.pct(bp[k].filter((s) => s.outcome === 'return' || s.outcome === 'neg').length, bp[k].length)), n1(U.pct(bp[k].filter((s) => s.outcome === 'farrow').length, bp[k].length))]));
      return { node: h('div', h('div.two', h('div', h('h4', 'Outcome of services'), t2), h('div', h('h4', 'Return intervals'), t)), h('h4', 'By parity'), t3), csv: t2.csv, shaded: sv.length > done.length };
    } });
  }

  function lactationEffect() {
    return reportWindow({ title: 'Effect of lactation length', subtitle: 'Litters weaned in the period: lactation length vs. what followed', build: (p) => {
      const L = weanedIn(p);
      const svByKey = new Map();
      S.calc.collect().services.forEach((s) => { if (s.prev === 'wean') svByKey.set(s.sow.uid + '|' + s.prevDate, s); });
      const keys = ['≤ 14 d', '15-17 d', '18-20 d', '21-23 d', '24-27 d', '28+ d'];
      const k = (d) => (d <= 14 ? keys[0] : d <= 17 ? keys[1] : d <= 20 ? keys[2] : d <= 23 ? keys[3] : d <= 27 ? keys[4] : keys[5]);
      const g = byParity(L, (l) => k(l.lactLen), keys);
      const rows = keys.filter((x) => g[x].length).map((x) => {
        const ls = g[x];
        const sv = ls.map((l) => svByKey.get(l.sowUid + '|' + l.weanDate)).filter(Boolean);
        const done = sv.filter((s) => !['pending', 'unknown'].includes(s.outcome));
        const next = sv.map((s) => { const nl = s.r.litters.find((y) => y.service && y.service.date === s.date); return nl ? nl.liveBorn : NaN; });
        return [x, ls.length, n1(U.avg(ls.map((l) => l.weaned))), n1(U.avg(sv.map((s) => s.wsi))), n1(U.pct(sv.filter((s) => s.wsi <= 7).length, sv.length)), n1(U.pct(done.filter((s) => s.outcome === 'farrow').length, done.length)), n1(U.avg(next))];
      });
      const t = table(['Lactation length', 'Litters', 'Pigs weaned', 'Avg. WSI', 'Served ≤ 7 d %', 'Next farrowing rate %', 'Next litter born alive'], rows);
      return { node: t, csv: t.csv };
    } });
  }

  /* ================= SPECIFIC REPORTS ================= */
  function herdInventory() {
    return reportWindow({ title: 'Herd inventory', subtitle: 'Animals by status and parity on the end date', build: (p) => {
      const d = p.end;
      const statuses = ['Gilt', 'Open', 'Served', 'Lactating'];
      const counts = {}; statuses.forEach((s) => { counts[s] = {}; });
      let boars = 0; let unentered = 0;
      S.store.animals().forEach((a) => {
        const s = S.model.statusAt(a, d);
        if (!s || ['Culled', 'Dead', 'Sold'].includes(s)) return;
        if (a.sex === 'M') { boars++; return; }
        if (!S.model.isBreedingFemale(a, d)) { unentered++; return; }
        const k = parGroup(S.model.parityAt(a, d));
        counts[s][k] = (counts[s][k] || 0) + 1;
      });
      const keys = ['0', ...PAR_KEYS];
      const rows = statuses.map((s) => [s, ...keys.map((k) => counts[s][k] || ''), U.sum(Object.values(counts[s]))]);
      const colTot = keys.map((k) => U.sum(statuses.map((s) => counts[s][k] || 0)));
      const grand = U.sum(colTot);
      const tot = ['Total', ...colTot, grand]; tot._cls = 'total';
      const pctRow = ['% of females', ...colTot.map((c) => n1(U.pct(c, grand))), '100'];
      const t = table(['Status', ...keys.map((k) => 'P' + k), 'Total'], [...rows, tot, pctRow]);
      return { node: h('div', t, h('div.vsum', `Boars: ${boars}   ·   Females not yet entered: ${unentered}   ·   Avg. parity: ${n2(U.sum(keys.map((k, i) => (k === '7+' ? 7.5 : +k) * colTot[i])) / (grand || 1))}`)), csv: t.csv,
        chart: () => ui().lineChart({ labels: keys.map((k) => 'P' + k), series: [{ name: 'Females', values: colTot }], bars: true }) };
    }, extra: (panel) => { const b = U.$('#r-begin', panel); if (b) b.closest('label').hidden = true; } });
  }

  function populationDynamics() {
    return reportWindow({ title: 'Population dynamics', subtitle: 'Breeding female flow in the period', build: (p) => {
      const begin = U.addDays(p.begin, -1);
      let bInv = 0; let eInv = 0; let entries = 0; let culled = 0; let died = 0; let sold = 0; let bB = 0; let eB = 0; let bIn = 0; let bOut = 0;
      S.store.animals().forEach((a) => {
        const r = A(a);
        if (a.sex === 'M') {
          const arr = a.arrivalDate || a.entryDate || '';
          const alive = (d) => arr && arr <= d && !(r.removed && r.removedDate <= d);
          if (alive(begin)) bB++; if (alive(p.end)) eB++;
          if (U.inRange(arr, p.begin, p.end)) bIn++; if (r.removed && U.inRange(r.removedDate, p.begin, p.end)) bOut++;
          return;
        }
        if (S.model.isBreedingFemale(a, begin)) bInv++;
        if (S.model.isBreedingFemale(a, p.end)) eInv++;
        const ent = r.entryDate || r.firstServiceDate;
        if (U.inRange(ent, p.begin, p.end)) entries++;
        if (r.removed && U.inRange(r.removedDate, p.begin, p.end) && ent && ent <= r.removedDate) { if (r.removalKind === 'death') died++; else if (r.removalKind === 'sold') sold++; else culled++; }
      });
      const t = table(['', 'Breeding females', 'Boars'], [
        ['Beginning inventory (' + U.fmt(begin) + ')', bInv, bB], ['+ Entries / arrivals', entries, bIn], ['– Culled', culled, ''], ['– Sold', sold, ''], ['– Died', died, ''], ['– Removed (boars)', '', bOut],
        Object.assign(['Ending inventory (' + U.fmt(p.end) + ')', eInv, eB], { _cls: 'total' }),
      ]);
      return { node: t, csv: t.csv };
    } });
  }

  function sowProductivity() {
    return reportWindow({ title: 'Sow productivity', subtitle: 'Lifetime production per sow, and litters farrowed in the analysis period', build: (p) => {
      const pp = U.parityFilter(p.parity);
      const showRemoved = p.inclRemoved;
      const rows = S.store.animals().filter((a) => a.sex === 'F' && (showRemoved || !A(a).removed) && pp(A(a).parity) && A(a).litters.length).map((a) => {
        const r = A(a); const lt = S.entry.lifetime(a);
        const per = r.litters.filter((l) => U.inRange(l.farrowDate, p.begin, p.end));
        const herdDays = U.diff(r.removed ? r.removedDate : U.today(), r.entryDate || r.firstServiceDate || U.today()) || 1;
        return { a, r, lt, per, herdDays };
      });
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'Sow', value: (x) => x.a.id }, { label: 'Status', value: (x) => x.r.status }, { label: 'Par', num: true, value: (x) => x.r.parity },
        { label: 'Litters', num: true, value: (x) => x.lt.litters }, { label: 'Tot. born', num: true, value: (x) => x.lt.tb }, { label: 'Born alive', num: true, value: (x) => x.lt.ba },
        { label: 'BA / litter', num: true, value: (x) => +n1(x.lt.ba / x.lt.litters) }, { label: 'Weaned', num: true, value: (x) => x.lt.weaned },
        { label: 'Wnd / litter', num: true, value: (x) => +n1(x.lt.weaned / x.lt.litters) }, { label: 'PWM %', num: true, value: (x) => +n1(U.pct(x.lt.deaths, x.lt.ba)) || 0 },
        { label: 'Litters in period', num: true, value: (x) => x.per.length }, { label: 'BA in period', num: true, value: (x) => U.sum(x.per.map((l) => l.liveBorn)) },
        { label: 'Weaned / yr in herd', num: true, value: (x) => +n1(x.lt.weaned / x.herdDays * 365) },
        { label: 'Repeats', num: true, value: (x) => x.r.services.filter((s) => !s.isFirst).length },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      return { node: h('div', h('div.vsum', `${rows.length} sows · double-click a sow to open her history · click a heading to sort`), g), csv: U.csv ? [[...g.querySelectorAll('th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim()), ...[...g.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))] : null };
    }, extra: (panel, p, run) => panel.appendChild(ui().field('Include removed', h('input', { type: 'checkbox', onchange: (e) => { p.inclRemoved = e.target.checked; run(); } }))) });
  }

  function removalsManager() {
    return reportWindow({ title: 'Removals manager', subtitle: 'Breeding animals removed in the period', build: (p) => {
      const pp = U.parityFilter(p.parity);
      const rows = S.store.animals().filter((a) => { const r = A(a); return r.removed && U.inRange(r.removedDate, p.begin, p.end) && (a.sex === 'M' || pp(r.parity)); }).map((a) => ({ a, r: A(a) }));
      const by = {}; rows.forEach((x) => { const k = (x.a.sex === 'M' ? 'Boar – ' : '') + (x.r.removalKind === 'death' ? 'Died' : x.r.removalKind === 'sold' ? 'Sold' : 'Culled') + ' · ' + (x.r.removalReason || 'no reason'); (by[k] = by[k] || []).push(x); });
      const sum = table(['Reason', 'Animals', '%', 'Avg. parity', 'Avg. days in herd'], Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, v.length, n1(U.pct(v.length, rows.length)), n2(U.avg(v.map((x) => x.r.parity))), n0(U.avg(v.map((x) => U.diff(x.r.removedDate, x.r.entryDate || x.a.arrivalDate || x.r.removedDate))))]));
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'ID', value: (x) => x.a.id }, { label: 'Type', value: (x) => (x.a.sex === 'M' ? 'Boar' : 'Female') }, { label: 'Par', num: true, value: (x) => x.r.parity },
        { label: 'Removed', value: (x) => U.fmt(x.r.removedDate), sort: (x) => x.r.removedDate }, { label: 'Kind', value: (x) => x.r.status }, { label: 'Reason', value: (x) => x.r.removalReason },
        { label: 'Litters', num: true, value: (x) => x.r.litters.length }, { label: 'Lifetime BA', num: true, value: (x) => U.sum(x.r.litters.map((l) => l.liveBorn)) },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      const parT = byParity(rows.filter((x) => x.a.sex === 'F'), (x) => parGroup(x.r.parity), ['0', ...PAR_KEYS]);
      const t3 = table(['Parity', ...Object.keys(parT).map((k) => 'P' + k)], [['Removed', ...Object.values(parT).map((v) => v.length)]]);
      return { node: h('div', h('h4', 'Summary by reason'), sum, h('h4', 'By parity at removal'), t3, h('h4', 'Animals'), g), csv: sum.csv,
        chart: () => ui().lineChart({ labels: Object.keys(by), series: [{ name: 'Removals', values: Object.values(by).map((v) => v.length) }], bars: true }) };
    } });
  }

  function parityReport() {
    return reportWindow({ title: 'Parity', subtitle: 'Performance by parity', build: (p) => {
      const L = littersIn(p); const W = weanedIn(p); const sv = servicesIn(p);
      const gl = byParity(L); const gw = byParity(W); const gs = byParity(sv, (s) => parGroup(s.parity + 1));
      const inv = {}; S.store.animals().forEach((a) => { if (S.model.isBreedingFemale(a, p.end)) { const k = parGroup(S.model.parityAt(a, p.end)); inv[k] = (inv[k] || 0) + 1; } });
      const totInv = U.sum(Object.values(inv));
      const rows = PAR_KEYS.map((k) => {
        const done = gs[k].filter((s) => !['pending', 'unknown'].includes(s.outcome));
        return [k, inv[k] || 0, n1(U.pct(inv[k] || 0, totInv)), gl[k].length, n1(U.avg(gl[k].map((l) => l.totalBorn))), n1(U.avg(gl[k].map((l) => l.liveBorn))), n1(U.avg(gw[k].map((l) => l.weaned))), n1(U.pct(done.filter((s) => s.outcome === 'farrow').length, done.length)), n1(U.avg(gs[k].filter((s) => s.wsi !== null).map((s) => s.wsi)))];
      });
      const t = table(['Parity', 'Inventory', '% of herd', 'Litters', 'Total born', 'Born alive', 'Weaned / litter', 'Farrowing rate % (services → this parity)', 'WSI'], rows);
      return { node: h('div', h('div.vsum', `Inventory on ${U.fmt(p.end)}: ${inv['0'] || 0} gilts not yet farrowed are counted as P0 and are not shown below.`), t), csv: t.csv,
        chart: () => ui().lineChart({ labels: PAR_KEYS.map((k) => 'P' + k), series: [{ name: '% of herd', values: rows.map((r) => +r[2]) }], bars: true }) };
    } });
  }

  function farrLoc() {
    return reportWindow({ title: 'Farrowing location', subtitle: 'Results by farrowing room / location (litters weaned in the period)', build: (p) => {
      const W = weanedIn(p);
      const g = {}; W.forEach((l) => { const k = l.location || '(none)'; (g[k] = g[k] || []).push(l); });
      const rows = Object.keys(g).sort(U.natCmp).map((k) => { const ls = g[k]; const ba = U.sum(ls.map((l) => l.liveBorn + l.fosterIn - l.fosterOut)); return [k, ls.length, n1(U.avg(ls.map((l) => l.totalBorn))), n1(U.avg(ls.map((l) => l.liveBorn))), n1(U.avg(ls.map((l) => l.weaned))), n1(U.pct(U.sum(ls.map((l) => l.deaths)), ba)), n1(U.avg(ls.map((l) => l.lactLen))), n2(U.sum(ls.map((l) => l.weanWeight)) / (U.sum(ls.map((l) => l.weanWeightCount)) || 1))]; });
      const t = table(['Location', 'Litters', 'Total born', 'Born alive', 'Weaned', 'PWM %', 'Lactation', 'Wean wt / pig'], rows);
      return { node: t, csv: t.csv, chart: () => ui().lineChart({ labels: rows.map((r) => r[0]), series: [{ name: 'PWM %', values: rows.map((r) => +r[5]) }], bars: true }) };
    } });
  }

  function benchmarking() {
    return reportWindow({ title: 'Benchmarking', subtitle: 'Your herd against your targets (edit targets under Settings)', build: (p) => {
      const x = S.calc.periodStats(p.begin, p.end, U.parityFilter(p.parity));
      const prevE = U.addDays(p.begin, -1); const prevB = U.addDays(prevE, -(U.diff(p.end, p.begin)));
      const y = S.calc.periodStats(prevB, prevE, U.parityFilter(p.parity));
      const tg = S.store.settings.targets;
      const ms = S.calc.METRICS.filter((m) => m.target);
      const rows = ms.map((m) => {
        const v = m.v(x); const t = tg[m.target]; const pv = m.v(y);
        const good = Number.isFinite(v) ? (m.lower ? v <= t : v >= t) : null;
        const gap = Number.isFinite(v) ? v - t : NaN;
        const chip = h('span.chip.' + (good === null ? 'na' : good ? 'ok' : 'bad'), good === null ? 'no data' : good ? 'on target' : 'below target');
        return [m.label, m.f(v), String(t), (gap > 0 ? '+' : '') + m.f(gap), m.f(pv), chip];
      });
      const t = table(['Indicator', 'This period', 'Target', 'Difference', `Previous period`, 'Status'], rows);
      return { node: h('div', h('div.vsum', `Previous period: ${U.fmt(prevB)} – ${U.fmt(prevE)}`), t), csv: t.csv };
    } });
  }

  function cohortAnalysis() {
    return reportWindow({ title: 'Cohort analysis', subtitle: 'Females grouped by quarter of herd entry: retention and lifetime production', defaults: { begin: U.addDays(U.addMonths(U.today(), -36), 1) }, build: (p) => {
      const g = {};
      S.store.animals().filter((a) => a.sex === 'F' && !(Number(a.entryParity) > 0)).forEach((a) => {
        const r = A(a); const ent = r.entryDate || r.firstServiceDate;
        if (!U.inRange(ent, p.begin, p.end)) return;
        const q = ent.slice(0, 4) + '-Q' + (Math.floor((+ent.slice(5, 7) - 1) / 3) + 1);
        (g[q] = g[q] || []).push({ a, r });
      });
      const rows = Object.keys(g).sort().map((q) => {
        const xs = g[q]; const n = xs.length;
        const reached = (k) => n1(U.pct(xs.filter((x) => x.r.litters.length >= k).length, n));
        return [q, n, n1(U.pct(xs.filter((x) => x.r.services.length).length, n)), reached(1), reached(2), reached(3), reached(5), n1(U.pct(xs.filter((x) => !x.r.removed).length, n)), n1(U.avg(xs.map((x) => U.sum(x.r.litters.map((l) => l.weaned))))), n2(U.avg(xs.map((x) => x.r.litters.length)))];
      });
      const t = table(['Entry quarter', 'Females', 'Served %', 'Farrowed P1 %', 'Reached P2 %', 'Reached P3 %', 'Reached P5 %', 'Still in herd %', 'Pigs weaned / female', 'Litters / female'], rows);
      return { node: t, csv: t.csv, chart: () => ui().lineChart({ labels: rows.map((r) => r[0]), series: [{ name: 'Reached P3 %', values: rows.map((r) => +r[5]) }, { name: 'Farrowed P1 %', values: rows.map((r) => +r[3]) }] }) };
    } });
  }

  function farrowingRateMonitor() {
    return reportWindow({ title: 'Farrowing rate monitor', subtitle: 'Services grouped by week: how many farrowed, failed, or are still pending', defaults: { begin: U.addDays(U.today(), -26 * 7) }, build: (p) => {
      const sv = servicesIn(p);
      const g = {}; sv.forEach((s) => { const k = U.weekStart(s.date); (g[k] = g[k] || []).push(s); });
      const rows = Object.keys(g).sort().map((k) => {
        const ss = g[k]; const f = ss.filter((s) => s.outcome === 'farrow').length; const pend = ss.filter((s) => s.outcome === 'pending' || s.outcome === 'unknown').length; const fail = ss.length - f - pend;
        const r = [U.fmt(k), U.isoWeek(k), ss.length, ss.filter((s) => s.isGilt).length, ss.filter((s) => !s.isFirst).length, f, fail, pend, n1(U.pct(f, ss.length - pend)), n1(U.pct(ss.length - fail, ss.length))];
        if (pend) r._cls = 'pending';
        return r;
      });
      const t = table(['Week of', 'Week', 'Services', 'Gilts', 'Repeats', 'Farrowed', 'Failed', 'Pending', 'Farrowing rate %', 'Max. possible %'], rows);
      return { node: h('div', h('div.vsum', 'Rows in yellow still have services waiting for their outcome. Max. possible % = rate if all pending services farrow.'), t), csv: t.csv, shaded: rows.some((r) => r._cls),
        chart: () => ui().lineChart({ labels: rows.map((r) => r[1]), series: [{ name: 'Farrowing rate %', values: rows.map((r) => +r[8]) }, { name: 'Max. possible %', values: rows.map((r) => +r[9]) }], target: S.store.settings.targets.farrowRate }) };
    } });
  }

  function sowInventory() {
    return reportWindow({ title: 'Sow inventory', subtitle: 'Current breeding females with days in status', noDates: true, build: () => {
      const rows = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed).map((a) => ({ a, r: A(a) }));
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'ID', value: (x) => x.a.id }, { label: 'Par', num: true, value: (x) => x.r.parity }, { label: 'Status', value: (x) => x.r.status },
        { label: 'Since', value: (x) => U.fmt(x.r.statusDate), sort: (x) => x.r.statusDate }, { label: 'Days', num: true, value: (x) => x.r.daysInStatus ?? '' },
        { label: 'Location', value: (x) => x.r.location || '' }, { label: 'Expected farrowing', value: (x) => (x.r.status === 'Served' ? U.fmt(U.addDays(x.r.lastService.date, S.store.settings.gestationLength)) : ''), sort: (x) => (x.r.status === 'Served' ? x.r.lastService.date : '') },
        { label: 'Piglets', num: true, value: (x) => (x.r.lactating ? x.r.piglets : '') }, { label: 'Age', num: true, value: (x) => x.r.ageDays ?? '' },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      const cnt = {}; rows.forEach((x) => { cnt[x.r.status] = (cnt[x.r.status] || 0) + 1; });
      return { node: h('div', h('div.vsum', `${rows.length} females · ` + Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(' · ')), g), csv: [[...g.querySelectorAll('th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim()), ...[...g.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))] };
    } });
  }

  function sowSelection() {
    const c = { parity: '', maxBA: '', minNpd: '', returns: '', status: '', age: '' };
    return reportWindow({ title: 'Sow selection', subtitle: 'Find sows that match culling or selection criteria', noDates: true, build: () => {
      const pp = U.parityFilter(c.parity);
      const today = U.today();
      const rows = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed).map((a) => {
        const r = A(a); const lt = S.entry.lifetime(a);
        const last = r.litters[r.litters.length - 1];
        const openDays = ['Open', 'Gilt'].includes(r.status) ? r.daysInStatus : 0;
        return { a, r, lt, avgBA: lt.litters ? lt.ba / lt.litters : NaN, lastBA: last ? last.liveBorn : NaN, lastWeaned: last && last.weanDate ? last.weaned : NaN, repeats: r.services.filter((s) => s.parity === r.parity && !s.isFirst).length, openDays, age: r.ageDays };
      }).filter((x) => pp(x.r.parity) && (!c.status || x.r.status === c.status) && (c.maxBA === '' || x.avgBA <= +c.maxBA) && (c.returns === '' || x.repeats >= +c.returns) && (c.minNpd === '' || x.openDays >= +c.minNpd) && (c.age === '' || (x.age ?? 0) >= +c.age));
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'ID', value: (x) => x.a.id }, { label: 'Par', num: true, value: (x) => x.r.parity }, { label: 'Status', value: (x) => x.r.status }, { label: 'Days', num: true, value: (x) => x.r.daysInStatus ?? '' },
        { label: 'Avg BA', num: true, value: (x) => +n1(x.avgBA) || '' }, { label: 'Last BA', num: true, value: (x) => (Number.isFinite(x.lastBA) ? x.lastBA : '') }, { label: 'Last weaned', num: true, value: (x) => (Number.isFinite(x.lastWeaned) ? x.lastWeaned : '') },
        { label: 'Repeats this parity', num: true, value: (x) => x.repeats }, { label: 'Days open', num: true, value: (x) => x.openDays || '' }, { label: 'Age', num: true, value: (x) => x.age ?? '' }, { label: 'Location', value: (x) => x.r.location || '' },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      void today;
      return { node: h('div', h('div.vsum', `${rows.length} sows match`), g), csv: [[...g.querySelectorAll('th')].map((t) => t.textContent.replace(/[▲▼]/g, '').trim()), ...[...g.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))] };
    }, extra: (panel, p, run) => {
      const f = (label, key, attrs) => ui().field(label, ui().input('sel-' + key, '', { ...attrs, onchange: (e) => { c[key] = e.target.value; run(); } }));
      panel.append(f('Parity', 'parity', { placeholder: 'e.g. 6+' }), f('Avg. born alive ≤', 'maxBA', { type: 'number', step: '0.5' }), f('Repeat services ≥', 'returns', { type: 'number' }), f('Days open ≥', 'minNpd', { type: 'number' }), f('Age (days) ≥', 'age', { type: 'number' }),
        ui().field('Status', ui().select('sel-status', ['', 'Gilt', 'Open', 'Served', 'Lactating'], '', { onchange: (e) => { c.status = e.target.value; run(); } })));
    } });
  }

  /* ---- vaccinations / periodical actions ---- */
  function dueVaccinations(b, e) {
    const out = [];
    const vac = (S.store.settings.vaccinations || []).filter((v) => v.active);
    S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed).forEach((a) => {
      const r = A(a);
      vac.forEach((v) => {
        let ref = null;
        if (v.target === 'served' && r.status === 'Served' && v.ref === 'service') ref = r.lastService.date;
        if (v.target === 'lactating' && r.status === 'Lactating' && v.ref === 'farrow') ref = r.currentLitter.farrowDate;
        if (v.target === 'gilt' && r.status === 'Gilt' && v.ref === 'birth') ref = a.birthDate;
        if (v.target === 'open' && r.status === 'Open' && v.ref === 'wean') ref = r.lastWeanDate;
        if (!ref) return;
        const due = U.addDays(ref, +v.day);
        const done = r.events.some((x) => x.type === 'vaccinate' && x.vaccine === v.name && x.date >= ref);
        if (!done && U.inRange(due, b, e)) out.push({ a, r, v, due });
      });
    });
    return out.sort((x, y) => (x.due < y.due ? -1 : x.due > y.due ? 1 : U.natCmp(x.a.id, y.a.id)));
  }
  function vaccinations() {
    return reportWindow({ title: 'Vaccinations', subtitle: 'Vaccinations and periodical treatments due (set the schedule under Settings)', defaults: { begin: U.today(), end: U.addDays(U.today(), 7) }, build: (p) => {
      const rows = dueVaccinations(p.begin, p.end);
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'Due', value: (x) => U.fmt(x.due), sort: (x) => x.due }, { label: 'Vaccine / action', value: (x) => x.v.name }, { label: 'Sow', value: (x) => x.a.id },
        { label: 'Par', num: true, value: (x) => x.r.parity }, { label: 'Status', value: (x) => x.r.status }, { label: 'Location', value: (x) => x.r.location || '' },
        { label: 'Record', render: (x) => h('button.wbtn.sm', { type: 'button', onclick: async () => {
          const ev = { type: 'vaccinate', date: U.today(), vaccine: x.v.name };
          const cur = S.store.get(x.a.uid);
          const seq = (cur.events || []).reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1;
          await S.store.saveAnimal({ ...cur, events: [...cur.events, { ...ev, eid: U.uid('e'), seq }] });
          ui().toast(`${x.v.name} recorded for ${x.a.id}.`, 'ok');
          S.app.current && S.app.current.refresh && S.app.current.refresh();
        } }, 'Done today'), value: () => '' },
      ] });
      const sum = {}; rows.forEach((x) => { sum[x.v.name] = (sum[x.v.name] || 0) + 1; });
      return { node: h('div', h('div.vsum', rows.length ? Object.entries(sum).map(([k, v]) => `${k}: ${v}`).join(' · ') : 'Nothing due in this period.'), g), csv: [['Due', 'Vaccine', 'Sow', 'Parity', 'Status', 'Location'], ...rows.map((x) => [U.fmt(x.due), x.v.name, x.a.id, x.r.parity, x.r.status, x.r.location || ''])] };
    } });
  }

  /* ---- sow cards & sheets ---- */
  function sowCard(a) {
    const r = A(a);
    const hist = S.entry.historyRows(a);
    const lt = S.entry.lifetime(a);
    return h('div.sowcard',
      h('div.sc-head', h('div', h('span.sc-id', a.id), ` ${a.sex === 'M' ? 'Boar' : 'Sow'} · ${a.breed || ''}`), h('div', `Status: ${r.status} · Parity ${r.parity} · ${r.location || ''}`)),
      h('div.sc-meta', `Born ${U.fmt(a.birthDate) || '–'} · Arrived ${U.fmt(a.arrivalDate) || '–'} · Entered ${U.fmt(a.entryDate) || '–'}` + (a.sex === 'F' ? ` · Lifetime ${lt.litters} litters, ${lt.ba} BA, ${lt.weaned} weaned` : '')),
      table(['Date', 'Par', 'Event', '#', 'Remarks'], hist.map((x) => [U.fmt(x.date), x.par, x.event, x.count ?? '', x.remarks]).map((rw) => [rw[0], ...rw.slice(1)]), { cls: 'sc-table' }),
      h('div.sc-lines', Array.from({ length: 4 }, () => h('div.sc-line'))));
  }
  function sowCards() {
    const ids = { text: '', status: 'Served', due: true };
    return reportWindow({ title: 'Sow cards', subtitle: 'Printable cards with full history', noDates: true, build: () => {
      let list;
      if (ids.text.trim()) list = ids.text.split(/[\s,;]+/).filter(Boolean).map((t) => S.store.findById(t)).filter(Boolean);
      else list = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed && A(a).status === ids.status).filter((a) => !ids.due || ids.status !== 'Served' || U.diff(U.addDays(A(a).lastService.date, S.store.settings.gestationLength), U.today()) <= 10).sort((x, y) => U.natCmp(x.id, y.id));
      return { node: h('div.cards', list.length ? list.slice(0, 200).map(sowCard) : h('p.msg', 'No sows selected. Type IDs or pick a status below.')) };
    }, extra: (panel, p, run) => {
      panel.append(ui().field('Sow IDs', ui().input('sc-ids', '', { placeholder: 'e.g. 1001 1002 1003', onchange: (e) => { ids.text = e.target.value; run(); } })),
        ui().field('or status', ui().select('sc-st', ['Served', 'Lactating', 'Open', 'Gilt'], 'Served', { onchange: (e) => { ids.status = e.target.value; run(); } })),
        ui().field('Served: due to farrow in ≤ 10 days', h('input', { type: 'checkbox', checked: true, onchange: (e) => { ids.due = e.target.checked; run(); } })));
    } });
  }
  function additionalSheets() {
    const sheet = { type: 'breeding' };
    return reportWindow({ title: 'Additional sheets', subtitle: 'Blank record sheets for the barn', noDates: true, build: () => {
      const blank = (cols, n = 22) => table(cols, Array.from({ length: n }, () => cols.map(() => ' ')), { cls: 'blank' });
      const sheets = {
        breeding: ['Date', 'Sow ID', 'Par', 'Heat', 'Boar 1', 'Boar 2', 'Boar 3', 'Tech', 'Remarks'],
        farrowing: ['Date', 'Sow ID', 'Crate', 'Born alive', 'Stillborn', 'Mummies', 'Weight', 'Fostered +/–', 'Remarks'],
        deaths: ['Date', 'Sow ID', 'Crate', 'No.', 'Cause', 'Remarks'],
        weaning: ['Date', 'Sow ID', 'Crate', 'Pigs weaned', 'Weight', 'Moved to', 'Remarks'],
        treatment: ['Date', 'ID', 'Problem', 'Product', 'Dose', 'Withdrawal until', 'By'],
      };
      return { node: blank(sheets[sheet.type]) };
    }, extra: (panel, p, run) => panel.append(ui().field('Sheet', ui().select('sh-type', [['breeding', 'Breeding / mating record'], ['farrowing', 'Farrowing record'], ['deaths', 'Piglet death record'], ['weaning', 'Weaning record'], ['treatment', 'Treatment record']], 'breeding', { onchange: (e) => { sheet.type = e.target.value; run(); } }))) });
  }

  function logReport() {
    return reportWindow({ title: 'Log', subtitle: 'Recent changes to the records', noDates: true, build: () => {
      const rows = [...S.store.state.log].reverse();
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [{ label: 'Time', value: (x) => new Date(x.t).toLocaleString() }, { label: 'Change', value: (x) => x.text }], emptyText: 'No changes logged yet' });
      return { node: g, csv: [['Time', 'Change'], ...rows.map((x) => [x.t, x.text])] };
    } });
  }

  function exportData() {
    const body = h('div',
      h('p', 'Export the herd records as files you can open in Excel or keep as a backup.'),
      h('div.btn-col',
        h('button.wbtn', { type: 'button', onclick: () => ui().saveFile(`swineos-backup-${U.today()}.json`, S.store.exportJSON(), 'application/json') }, 'Full backup (JSON – can be restored)'),
        h('button.wbtn', { type: 'button', onclick: () => {
          const rows = [['Sow ID', 'Sex', 'Breed', 'Birth date', 'Arrival date', 'Entry date', 'Date', 'Event', 'Count', 'Details', 'Remarks']];
          S.store.animals().forEach((a) => A(a).events.forEach((e) => rows.push([a.id, a.sex, a.breed || '', a.birthDate || '', a.arrivalDate || '', a.entryDate || '', e.date, S.EVENTS[e.type].label, e.count ?? e.liveBorn ?? '', S.entry.describe(e), e.remarks || ''])));
          ui().saveFile(`swineos-events-${U.today()}.csv`, U.csv(rows), 'text/csv');
        } }, 'All events (CSV)'),
        h('button.wbtn', { type: 'button', onclick: () => {
          const rows = [['Sow ID', 'Parity', 'Service date', 'Boar', 'Farrow date', 'Gestation', 'Total born', 'Born alive', 'Stillborn', 'Mummies', 'Deaths', 'Net fostered', 'Weaned', 'Wean date', 'Lactation', 'Wean weight', 'Location']];
          S.calc.collect().litters.forEach((l) => rows.push([l.sowId, l.parity, l.serviceDate, l.boar, l.farrowDate, l.gestLen ?? '', l.totalBorn, l.liveBorn, l.stillborn, l.mummies, l.deaths, l.fosterIn - l.fosterOut, l.weanDate ? l.weaned : '', l.weanDate || '', l.lactLen ?? '', l.weanWeight || '', l.location || '']));
          ui().saveFile(`swineos-litters-${U.today()}.csv`, U.csv(rows), 'text/csv');
        } }, 'Litters (CSV)'),
        h('button.wbtn', { type: 'button', onclick: () => {
          const rows = [['ID', 'Sex', 'Status', 'Parity', 'Status date', 'Location', 'Breed', 'Birth date', 'Arrival date', 'Entry date', 'Removed', 'Removal reason']];
          S.store.animals().forEach((a) => { const r = A(a); rows.push([a.id, a.sex, r.status, r.parity, r.statusDate, r.location || '', a.breed || '', a.birthDate || '', a.arrivalDate || '', a.entryDate || '', r.removedDate, r.removalReason]); });
          ui().saveFile(`swineos-animals-${U.today()}.csv`, U.csv(rows), 'text/csv');
        } }, 'Animal list (CSV)')));
    ui().modal({ title: 'Export data', body, width: 460, buttons: [{ label: 'Close', primary: true }] });
  }

  /* ================= APPLICATION TOOLS ================= */
  function toolWindow(title, subtitle, controls, render) {
    const sel = {};
    return reportWindow({ title, subtitle: subtitle + ' (one record per litter farrowed in the period)', build: (p) => render(S.calc.litterRecords(p.begin, p.end).filter((r) => U.parityFilter(p.parity)(r.parity)), sel), extra: (panel, p, run) => {
      controls.forEach(([key, label, kind, def]) => {
        const opts = S.calc.LITTER_FIELDS.filter((f) => !kind || f[2] === kind).map((f) => [f[0], f[1]]);
        sel[key] = def;
        panel.appendChild(ui().field(label, ui().select('tool-' + key, opts, def, { onchange: (e) => { sel[key] = e.target.value; run(); } })));
      });
    } });
  }
  const fieldLabel = (k) => (S.calc.LITTER_FIELDS.find((f) => f[0] === k) || [k, k])[1];
  const isCat = (k) => (S.calc.LITTER_FIELDS.find((f) => f[0] === k) || [])[2] === 'c';
  function catKey(rec, k) { const v = rec[k]; if (v === null || v === undefined || v === '') return null; if (isCat(k)) return String(v); return k === 'parity' ? parGroup(v) : String(Math.round(v)); }
  const sortKeys = (keys) => keys.sort((a, b) => U.natCmp(a, b));

  const tools = {
    breakdown: () => toolWindow('Breakdown', 'Average of a value broken down by groups', [['by', 'Break down by', null, 'parity'], ['val', 'Value', 'n', 'bornAlive']], (recs, s) => {
      const g = {}; recs.forEach((r) => { const k = catKey(r, s.by); if (k !== null && r[s.val] !== null && r[s.val] !== undefined) (g[k] = g[k] || []).push(r[s.val]); });
      const keys = sortKeys(Object.keys(g));
      const rows = keys.map((k) => [k, g[k].length, n2(U.avg(g[k])), n2(U.sd(g[k])), n1(Math.min(...g[k])), n1(Math.max(...g[k]))]);
      const all = Object.values(g).flat(); const tot = ['Total', all.length, n2(U.avg(all)), n2(U.sd(all)), n1(Math.min(...all)), n1(Math.max(...all))]; tot._cls = 'total';
      const t = table([fieldLabel(s.by), 'N', 'Mean ' + fieldLabel(s.val), 'SD', 'Min', 'Max'], [...rows, tot]);
      return { node: t, csv: t.csv, chart: () => ui().lineChart({ labels: keys, series: [{ name: fieldLabel(s.val), values: rows.map((r) => +r[2]) }], bars: true }) };
    }),
    crosstab: () => toolWindow('Cross tabulation', 'Counts of litters for two classifications', [['row', 'Rows', null, 'parity'], ['col', 'Columns', null, 'bornAlive']], (recs, s) => {
      const g = {}; const cols = new Set();
      recs.forEach((r) => { const a = catKey(r, s.row); const b = catKey(r, s.col); if (a === null || b === null) return; cols.add(b); g[a] = g[a] || {}; g[a][b] = (g[a][b] || 0) + 1; });
      const ck = sortKeys([...cols]); const rk = sortKeys(Object.keys(g));
      const rows = rk.map((k) => [k, ...ck.map((c) => g[k][c] || ''), U.sum(Object.values(g[k]))]);
      const tot = ['Total', ...ck.map((c) => U.sum(rk.map((k) => g[k][c] || 0))), U.sum(rows.map((r) => r[r.length - 1]))]; tot._cls = 'total';
      const t = table([fieldLabel(s.row) + ' \\ ' + fieldLabel(s.col), ...ck, 'Total'], [...rows, tot]);
      return { node: t, csv: t.csv };
    }),
    histogram: () => toolWindow('Histogram', 'Distribution of one value', [['val', 'Value', 'n', 'totalBorn']], (recs, s) => {
      const vals = recs.map((r) => r[s.val]).filter((v) => v !== null && v !== undefined);
      const g = {}; vals.forEach((v) => { const k = Math.round(v); g[k] = (g[k] || 0) + 1; });
      const keys = Object.keys(g).map(Number).sort((a, b) => a - b);
      return { node: h('div', h('div.vsum', `n = ${vals.length} · mean ${n2(U.avg(vals))} · SD ${n2(U.sd(vals))}`), ui().lineChart({ labels: keys.map(String), series: [{ name: 'Litters', values: keys.map((k) => g[k]) }], bars: true, yLabel: 'Litters' })), csv: [[fieldLabel(s.val), 'Litters'], ...keys.map((k) => [k, g[k]])] };
    }),
    scatter: () => toolWindow('Scatter table', 'Two values against each other, as a table of counts', [['x', 'Columns (X)', 'n', 'parity'], ['y', 'Rows (Y)', 'n', 'bornAlive']], (recs, s) => {
      const g = {}; const xs = new Set();
      recs.forEach((r) => { if (r[s.x] === null || r[s.y] === null || r[s.x] === undefined || r[s.y] === undefined) return; const x = Math.round(r[s.x]); const y = Math.round(r[s.y]); xs.add(x); g[y] = g[y] || {}; g[y][x] = (g[y][x] || 0) + 1; });
      const xk = [...xs].sort((a, b) => a - b); const yk = Object.keys(g).map(Number).sort((a, b) => b - a);
      const max = Math.max(1, ...yk.flatMap((y) => Object.values(g[y])));
      const t = h('table.rtable.scatter-t', h('thead', h('tr', h('th', fieldLabel(s.y) + ' \\ ' + fieldLabel(s.x)), xk.map((x) => h('th.num', x)))), h('tbody', yk.map((y) => h('tr', h('th', y), xk.map((x) => { const n = (g[y] || {})[x] || 0; return h('td.num', { style: n ? { background: `rgba(31,63,191,${0.1 + 0.6 * n / max})`, color: n / max > 0.5 ? '#fff' : null } : null }, n || ''); })))));
      return { node: h('div.rtable-wrap', t), csv: [[fieldLabel(s.y), ...xk], ...yk.map((y) => [y, ...xk.map((x) => (g[y] || {})[x] || 0)])] };
    }),
    statistics: () => toolWindow('Statistics', 'Summary statistics for every value', [], (recs) => {
      const rows = S.calc.LITTER_FIELDS.filter((f) => f[2] === 'n').map(([k, l]) => { const v = recs.map((r) => r[k]).filter((x) => x !== null && x !== undefined && Number.isFinite(x)); return [l, v.length, n2(U.avg(v)), n2(U.sd(v)), v.length ? n1(Math.min(...v)) : '', n1(U.median(v)), v.length ? n1(Math.max(...v)) : '', n1(U.sum(v))]; });
      const t = table(['Value', 'N', 'Mean', 'SD', 'Min', 'Median', 'Max', 'Sum'], rows);
      return { node: t, csv: t.csv };
    }),
    frequency: () => toolWindow('Frequency distribution', 'How often each value occurs', [['val', 'Value', null, 'bornAlive']], (recs, s) => {
      const g = {}; let n = 0; recs.forEach((r) => { const k = catKey(r, s.val); if (k === null) return; g[k] = (g[k] || 0) + 1; n++; });
      let c = 0;
      const rows = sortKeys(Object.keys(g)).map((k) => { c += g[k]; return [k, g[k], n1(U.pct(g[k], n)), c, n1(U.pct(c, n))]; });
      const t = table([fieldLabel(s.val), 'Frequency', '%', 'Cumulative', 'Cumulative %'], rows);
      return { node: t, csv: t.csv };
    }),
    timeplot: () => toolWindow('Time plot', 'Average of a value by month of farrowing', [['val', 'Value', 'n', 'bornAlive']], (recs, s) => {
      const g = {}; recs.forEach((r) => { if (r[s.val] !== null && r[s.val] !== undefined) (g[r.month] = g[r.month] || []).push(r[s.val]); });
      const keys = Object.keys(g).sort();
      const rows = keys.map((k) => [k, g[k].length, n2(U.avg(g[k]))]);
      return { node: h('div', ui().lineChart({ labels: keys, series: [{ name: fieldLabel(s.val), values: rows.map((r) => +r[2]) }], yLabel: fieldLabel(s.val) }), table(['Month', 'Litters', 'Mean'], rows)), csv: [['Month', 'Litters', 'Mean'], ...rows] };
    }),
    xyplot: () => toolWindow('X - Y plot', 'One value plotted against another with a trend line', [['x', 'X axis', 'n', 'lactLen'], ['y', 'Y axis', 'n', 'weaned']], (recs, s) => {
      const pts = recs.filter((r) => Number.isFinite(r[s.x]) && Number.isFinite(r[s.y])).map((r) => [r[s.x], r[s.y]]);
      return { node: ui().scatter({ points: pts, xLabel: fieldLabel(s.x), yLabel: fieldLabel(s.y) }), csv: [[fieldLabel(s.x), fieldLabel(s.y)], ...pts] };
    }),
  };

  /* ================= PIGLETS & BOARS ================= */
  function pigletDeaths() {
    return reportWindow({ title: 'Piglet deaths', subtitle: 'Piglet death records in the period', build: (p) => {
      const rows = [];
      S.store.animals().forEach((a) => { const r = A(a); r.events.forEach((e) => { if (e.type === 'pigdeath' && U.inRange(e.date, p.begin, p.end)) { const l = [...r.litters].reverse().find((x) => x.farrowDate <= e.date); rows.push({ a, e, age: l ? U.diff(e.date, l.farrowDate) : '', loc: l ? l.location : '' }); } }); });
      const byWeek = {}; rows.forEach((x) => { const k = U.weekStart(x.e.date); byWeek[k] = (byWeek[k] || 0) + (Number(x.e.count) || 0); });
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'Date', value: (x) => U.fmt(x.e.date), sort: (x) => x.e.date }, { label: 'Sow', value: (x) => x.a.id }, { label: 'No.', num: true, value: (x) => Number(x.e.count) || 0 },
        { label: 'Cause', value: (x) => x.e.cause || '' }, { label: 'Piglet age (d)', num: true, value: (x) => x.age }, { label: 'Location', value: (x) => x.loc || '' },
      ] });
      const wk = Object.keys(byWeek).sort();
      return { node: h('div', h('div.vsum', `${U.sum(rows.map((x) => x.e.count))} piglets in ${rows.length} records`), g), csv: [['Date', 'Sow', 'No', 'Cause', 'Age'], ...rows.map((x) => [x.e.date, x.a.id, x.e.count, x.e.cause, x.age])],
        chart: () => ui().lineChart({ labels: wk.map(U.fmt), series: [{ name: 'Piglet deaths per week', values: wk.map((k) => byWeek[k]) }], bars: true }) };
    } });
  }
  function littersOnHand() {
    return reportWindow({ title: 'Piglet inventory', subtitle: 'Litters currently on lactating sows', noDates: true, build: () => {
      const rows = S.store.animals().filter((a) => A(a).lactating).map((a) => ({ a, r: A(a), l: A(a).currentLitter }));
      const byAge = {}; rows.forEach((x) => { const d = U.diff(U.today(), x.l.farrowDate); const k = d <= 7 ? '0-7 d' : d <= 14 ? '8-14 d' : d <= 21 ? '15-21 d' : '22+ d'; byAge[k] = (byAge[k] || 0) + x.r.piglets; });
      const g = ui().grid({ rows, cls: 'rep-grid', columns: [
        { label: 'Sow', value: (x) => x.a.id }, { label: 'Par', num: true, value: (x) => x.r.parity }, { label: 'Farrowed', value: (x) => U.fmt(x.l.farrowDate), sort: (x) => x.l.farrowDate },
        { label: 'Age (d)', num: true, value: (x) => U.diff(U.today(), x.l.farrowDate) }, { label: 'Born alive', num: true, value: (x) => x.l.liveBorn }, { label: 'Deaths', num: true, value: (x) => x.l.deaths },
        { label: 'Fostered', num: true, value: (x) => x.l.fosterIn - x.l.fosterOut }, { label: 'On sow', num: true, value: (x) => x.r.piglets }, { label: 'Location', value: (x) => x.r.location || '' },
        { label: 'Wean due', value: (x) => U.fmt(U.addDays(x.l.farrowDate, S.store.settings.targetLactation)), sort: (x) => x.l.farrowDate },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      return { node: h('div', h('div.vsum', `${rows.length} litters · ${U.sum(rows.map((x) => x.r.piglets))} piglets · ` + Object.entries(byAge).map(([k, v]) => `${k}: ${v}`).join(' · ')), g) };
    } });
  }
  function fosteringReport() {
    return reportWindow({ title: 'Fostering', subtitle: 'Cross-fostering for litters farrowed in the period', build: (p) => {
      const L = littersIn(p);
      const bins = { 'No fostering': [], 'Received pigs': [], 'Gave pigs': [] };
      L.forEach((l) => { const n = l.fosterIn - l.fosterOut; (n > 0 ? bins['Received pigs'] : n < 0 ? bins['Gave pigs'] : bins['No fostering']).push(l); });
      const rows = Object.entries(bins).map(([k, ls]) => [k, ls.length, n1(U.pct(ls.length, L.length)), n1(U.avg(ls.map((l) => l.liveBorn))), n1(U.avg(ls.map((l) => l.fosterIn - l.fosterOut))), n1(U.avg(ls.filter((l) => l.weanDate).map((l) => l.weaned))), n1(U.pct(U.sum(ls.map((l) => l.deaths)), U.sum(ls.map((l) => l.liveBorn + l.fosterIn - l.fosterOut))))]);
      const t = table(['Group', 'Litters', '%', 'Born alive', 'Net fostered', 'Weaned', 'PWM %'], rows);
      return { node: t, csv: t.csv };
    } });
  }
  function weaningList() {
    return reportWindow({ title: 'Weaning list', subtitle: 'Sows to wean, by farrowing date', noDates: true, build: () => {
      const lact = S.store.settings.targetLactation;
      const rows = S.store.animals().filter((a) => A(a).lactating).map((a) => ({ a, r: A(a), l: A(a).currentLitter })).sort((x, y) => (x.l.farrowDate < y.l.farrowDate ? -1 : 1));
      const g = ui().grid({ rows, cls: 'rep-grid', rowClass: (x) => (U.diff(U.today(), x.l.farrowDate) >= lact ? 'due' : ''), columns: [
        { label: 'Sow', value: (x) => x.a.id }, { label: 'Location', value: (x) => x.r.location || '' }, { label: 'Farrowed', value: (x) => U.fmt(x.l.farrowDate), sort: (x) => x.l.farrowDate },
        { label: 'Lactation days', num: true, value: (x) => U.diff(U.today(), x.l.farrowDate) }, { label: 'Pigs on sow', num: true, value: (x) => x.r.piglets }, { label: 'Par', num: true, value: (x) => x.r.parity },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      return { node: h('div', h('div.vsum', `Highlighted: at or past the ${lact}-day target lactation.`), g) };
    } });
  }

  function boarList() {
    return reportWindow({ title: 'Boar inventory', subtitle: 'Boars on the farm', noDates: true, build: () => {
      const svc = S.calc.collect().services;
      const use = {}; svc.forEach((s) => s.boars.forEach((b) => { use[b] = use[b] || { n: 0, last: '' }; use[b].n++; if (s.date > use[b].last) use[b].last = s.date; }));
      const rows = S.store.animals().filter((a) => a.sex === 'M').map((a) => ({ a, r: A(a), u: use[a.id] || { n: 0, last: '' } }));
      const g = ui().grid({ rows, cls: 'rep-grid', rowClass: (x) => (x.r.removed ? 'st-removed' : ''), columns: [
        { label: 'ID', value: (x) => x.a.id }, { label: 'Status', value: (x) => x.r.status }, { label: 'Breed', value: (x) => x.a.breed || '' },
        { label: 'Birth date', value: (x) => U.fmt(x.a.birthDate), sort: (x) => x.a.birthDate || '' }, { label: 'Arrival', value: (x) => U.fmt(x.a.arrivalDate), sort: (x) => x.a.arrivalDate || '' },
        { label: 'Age (d)', num: true, value: (x) => x.r.ageDays ?? '' }, { label: 'Services (all time)', num: true, value: (x) => x.u.n }, { label: 'Last used', value: (x) => U.fmt(x.u.last), sort: (x) => x.u.last },
        { label: 'Removed', value: (x) => U.fmt(x.r.removedDate), sort: (x) => x.r.removedDate },
      ], onRowDblClick: (x) => S.app.openSow(x.a) });
      return { node: h('div', h('div.vsum', `${rows.filter((x) => !x.r.removed).length} active boars`), g) };
    } });
  }
  function boarPerformance() {
    return reportWindow({ title: 'Boar performance', subtitle: 'Results of services by first boar used (services made in the period)', build: (p) => {
      const sv = servicesIn(p);
      const g = {}; sv.forEach((s) => { const b = s.boars[0] || '(none)'; (g[b] = g[b] || []).push(s); });
      const rows = Object.keys(g).sort(U.natCmp).map((b) => {
        const ss = g[b]; const done = ss.filter((s) => !['pending', 'unknown'].includes(s.outcome));
        const lit = ss.map((s) => s.r.litters.find((l) => l.service && l.service.date === s.date)).filter(Boolean);
        return [b, ss.length, ss.filter((s) => s.isGilt).length, done.length, n1(U.pct(done.filter((s) => s.outcome === 'farrow').length, done.length)), lit.length, n1(U.avg(lit.map((l) => l.totalBorn))), n1(U.avg(lit.map((l) => l.liveBorn)))];
      });
      const t = table(['Boar', 'Services', 'Gilt services', 'Known outcome', 'Farrowing rate %', 'Litters', 'Total born', 'Born alive'], rows);
      return { node: t, csv: t.csv, shaded: sv.some((s) => s.outcome === 'pending'), chart: () => ui().lineChart({ labels: rows.map((r) => r[0]), series: [{ name: 'Farrowing rate %', values: rows.map((r) => +r[4]) }], bars: true }) };
    } });
  }
  function boarUsage() {
    return reportWindow({ title: 'Boar usage', subtitle: 'Matings per boar per week', defaults: { begin: U.addDays(U.today(), -12 * 7) }, build: (p) => {
      const g = {}; const weeks = new Set();
      S.store.animals().forEach((a) => A(a).events.forEach((e) => { if (e.type === 'mate' && U.inRange(e.date, p.begin, p.end)) { const w = U.isoWeek(e.date); weeks.add(w); const b = e.boar || '(none)'; g[b] = g[b] || {}; g[b][w] = (g[b][w] || 0) + 1; } }));
      const wk = [...weeks].sort();
      const rows = Object.keys(g).sort(U.natCmp).map((b) => [b, ...wk.map((w) => g[b][w] || ''), U.sum(Object.values(g[b]))]);
      const t = table(['Boar', ...wk.map((w) => w.slice(5)), 'Total'], rows);
      return { node: t, csv: t.csv };
    } });
  }

  /* ================= REPORTS MENU ================= */
  function menu(section = 'sows') {
    const win = ui().appWindow({ title: 'Reports', cls: 'menu-win', toolbar: [
      { icon: 'sow', label: 'Sows / gilts', active: section === 'sows', onClick: () => S.app.reports('sows') },
      { icon: 'piglets', label: 'Piglets', active: section === 'piglets', onClick: () => S.app.reports('piglets') },
      { icon: 'boar', label: 'Boars', active: section === 'boars', onClick: () => S.app.reports('boars') },
      '|',
      { icon: 'help', label: 'Help', onClick: () => S.app.help('reports') },
      '|',
      { icon: 'close', label: 'Close', onClick: () => S.app.home() },
    ] });
    const go = (fn) => () => S.app.show(fn);
    const B = (label, fn, opts = {}) => h('button.navy-btn' + (opts.disabled ? '.disabled' : '') + (opts.small ? '.small' : ''), { type: 'button', disabled: opts.disabled, title: opts.title || label, onclick: fn ? (opts.direct ? fn : go(fn)) : null }, label);
    const sec = (title, rows) => h('div.msec', h('h3', title), h('div.mrule'), rows.map((r) => h('div.mrow', r)));
    let content;
    if (section === 'sows') {
      content = [
        h('h1.menu-title', 'Sow / gilt reports'),
        sec('Litter performance', [[B('Pigs born', pigsBorn), B('Pre-weaning mortality', preWeaningMortality), B('Pigs weaned', pigsWeaned), B('Litter weaning weights', weaningWeights)]]),
        sec('Mating performance', [[B('Matings per service', matingsPerService), B('Wean to service interval', wsiReport), B('Returns to service', returnsReport), B('Effect of lactation length', lactationEffect)]]),
        sec('Specific reports', [
          [B('Herd performance', herdPerformance), B('Herd inventory', herdInventory), B('Sow productivity', sowProductivity), B('Removals manager', removalsManager), h('span.mgap'), B('Cohort analysis', cohortAnalysis)],
          [B('Parity', parityReport), B('BLUP', null, { disabled: true, title: 'Genetic evaluation (BLUP) is not available' }), B('Farr. Loc.', farrLoc), B('Benchmarking', benchmarking), h('span.mgap'), B('Export data', exportData, { direct: true })],
          [h('span.mspacer'), B('Log', logReport, { small: true })],
        ]),
        sec('Sow information', [
          [B('Action lists', () => S.actionLists.open(), { direct: true }), B('Additional sheets', additionalSheets), B('Sow cards', sowCards)],
          [B('Farrowing rate monitor', farrowingRateMonitor), B('Sow inventory', sowInventory), B('Sow selection', sowSelection), B('Vaccinations', vaccinations)],
        ]),
        sec('Application tools', [
          [B('Breakdown', tools.breakdown), B('Cross tabulation', tools.crosstab), B('Histogram', tools.histogram), B('Scatter table', tools.scatter)],
          [B('Statistics', tools.statistics), B('Frequency distribution', tools.frequency), B('Time plot', tools.timeplot), B('X - Y plot', tools.xyplot)],
        ]),
      ];
    } else if (section === 'piglets') {
      content = [
        h('h1.menu-title', 'Piglet reports'),
        sec('Piglet performance', [[B('Pre-weaning mortality', preWeaningMortality), B('Piglet deaths', pigletDeaths), B('Fostering', fosteringReport), B('Litter weaning weights', weaningWeights)]]),
        sec('Piglet information', [[B('Piglet inventory', littersOnHand), B('Weaning list', weaningList), B('Pigs weaned', pigsWeaned)]]),
      ];
    } else {
      content = [
        h('h1.menu-title', 'Boar reports'),
        sec('Boar information', [[B('Boar inventory', boarList), B('Boar usage', boarUsage), B('Boar performance', boarPerformance)]]),
      ];
    }
    win.appendChild(h('div.menu-body', content));
    return win;
  }

  S.reports = { menu, herdPerformance, populationDynamics: () => S.app.show(populationDynamics), dueVaccinations, sowCard, table };
})(window.SOS);
