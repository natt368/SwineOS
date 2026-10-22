/* SwineOS – Finances: income and expenses of the barn, in place of the "Expense & Income" and
 * Excel workbook. Tabs: Overview, Expenses, Income (hog sales, cripples, cull sows & boars)
 * and Year end (the workbook's REPORT and Year End sheets).
 * Records live in S.store (fin) and go into the same backups as the herd. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;

  const STREAMS = {
    hogs: { label: 'Hog sales', one: 'hog sale', unit: 'HOGS' },
    cripples: { label: 'Cripples', one: 'cripple sale', unit: 'CRIPPLES' },
    culls: { label: 'Cull sows & boars', one: 'cull sale', unit: 'SOWS' },
  };
  const INCOME = '#2f56d6'; const EXPENSE = '#d97a1e';

  /* ---------- formatting ---------- */
  function money(v, dec = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '';
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return (v < 0 ? '−$' : '$') + s;
  }
  function n(v, dec = 0) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '';
    return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  const pct = (v) => (Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '');
  const monthName = (m) => U.MONTHS[m];
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : null; };

  /* ---------- settings ---------- */
  const finSettings = () => (S.store.settings && S.store.settings.fin) || S.DEFAULT_SETTINGS.fin;
  function cats() { return [...finSettings().cats].sort((a, b) => a.code - b.code); }
  function catName(code) { const c = cats().find((x) => x.code === Number(code)); return c ? c.name : code ? `Type ${code}` : 'No type'; }
  async function saveFinSettings(patch) {
    await S.store.saveSettings({ ...S.store.settings, fin: { ...finSettings(), ...patch } });
  }
  /** Breeding females on the last day of the year (or today), counted from the herd records. */
  function herdSows(year) {
    const end = `${year}-12-31` < U.today() ? `${year}-12-31` : U.today();
    return S.store.animals().filter((a) => S.model.isBreedingFemale(a, end)).length;
  }
  function sowsFor(year) { return Number(finSettings().sows[year]) || herdSows(year); }

  /* ---------- calculations (the workbook's REPORT sheet) ---------- */
  function years() {
    const ys = new Set(S.store.fin().filter((r) => r.kind !== 'part' && r.date).map((r) => +r.date.slice(0, 4)));
    ys.add(+U.today().slice(0, 4));
    return [...ys].sort((a, b) => a - b);
  }
  function recsOf(year, kind) { const y = String(year); return S.store.fin().filter((r) => r.kind === kind && r.date && r.date.startsWith(y)); }

  /** Everything the overview and year-end report show, for one year (optionally only up to a month, 0-based). */
  function summarize(year, uptoMonth = 11) {
    const inMonths = (r) => +r.date.slice(5, 7) - 1 <= uptoMonth;
    const exp = recsOf(year, 'exp').filter(inMonths);
    const inc = recsOf(year, 'inc').filter(inMonths);
    const feed = new Set(cats().filter((c) => c.feed).map((c) => c.code));
    const months = Array.from({ length: 12 }, (_, m) => ({ m, income: 0, expense: 0, shipped: 0, hogHead: 0, hogTotal: 0, idx: 0, idxHead: 0, wt: 0, wtHead: 0, recs: 0 }));
    const byCat = new Map();
    let feedCost = 0;
    for (const r of exp) {
      const mo = months[+r.date.slice(5, 7) - 1];
      mo.expense += r.total || 0; mo.recs++;
      if (feed.has(Number(r.cat))) feedCost += r.total || 0;
      const k = Number(r.cat) || 0;
      const c = byCat.get(k) || { code: k, name: catName(k), feed: feed.has(k), total: 0, n: 0, units: {} };
      c.total += r.total || 0; c.n++;
      if (r.qty) { const u = (r.unit || '').toUpperCase(); c.units[u] = (c.units[u] || 0) + r.qty; }
      byCat.set(k, c);
    }
    const streams = {}; for (const k of Object.keys(STREAMS)) streams[k] = { head: 0, total: 0, n: 0 };
    const hog = { head: 0, total: 0, wt: 0, wtHead: 0, idx: 0, idxHead: 0, prices: [], lean: 0, leanHead: 0, fat: 0, fatHead: 0, bonus: 0, bonusHead: 0, leanInc: 0, leanIncHead: 0 };
    for (const r of inc) {
      const mo = months[+r.date.slice(5, 7) - 1];
      mo.income += r.total || 0; mo.recs++;
      const st = streams[r.stream] || (streams[r.stream] = { head: 0, total: 0, n: 0 });
      st.head += r.head || 0; st.total += r.total || 0; st.n++;
      if (r.stream === 'hogs' || r.stream === 'cripples') mo.shipped += r.head || 0;
      if (r.stream !== 'hogs') continue;
      const hd = r.head || 0;
      hog.head += hd; hog.total += r.total || 0; mo.hogHead += hd; mo.hogTotal += r.total || 0;
      const wt = Number.isFinite(r.totalWt) ? r.totalWt : Number.isFinite(r.avgWt) ? r.avgWt * hd : null;
      if (wt !== null) { hog.wt += wt; hog.wtHead += hd; mo.wt += wt; mo.wtHead += hd; }
      if (Number.isFinite(r.index)) { hog.idx += r.index * hd; hog.idxHead += hd; mo.idx += r.index * hd; mo.idxHead += hd; }
      if (Number.isFinite(r.price)) hog.prices.push(r.price);
      for (const k of ['lean', 'fat', 'bonus', 'leanInc']) if (Number.isFinite(r[k])) { hog[k] += r[k] * hd; hog[k + 'Head'] += hd; }
    }
    const income = U.sum(months.map((m) => m.income)); const expense = U.sum(months.map((m) => m.expense));
    const shipped = U.sum(months.map((m) => m.shipped));
    const sows = sowsFor(year);
    const per = (a, b) => (b ? a / b : NaN);
    return {
      year, uptoMonth, months, income, expense, balance: income - expense, margin: per(income - expense, income), shipped, sows,
      feedCost, feedPerHog: per(feedCost, shipped), incomePerHog: per(income, shipped), costPerHog: per(expense, shipped), profitPerHog: per(income - expense, shipped),
      incomePerSow: per(income, sows), shippedPerSow: per(shipped, sows), byCat: [...byCat.values()].sort((a, b) => b.total - a.total), streams,
      hog: { head: hog.head, total: hog.total, perHog: per(hog.total, hog.head), avgWt: per(hog.wt, hog.wtHead), totalWt: hog.wt, index: per(hog.idx, hog.idxHead),
        // average price is the average of the loads, as the workbook works it out
        price: hog.prices.length ? U.avg(hog.prices) : NaN, lean: per(hog.lean, hog.leanHead), fat: per(hog.fat, hog.fatHead),
        bonusTotal: hog.bonus, bonus: per(hog.bonus, hog.bonusHead), leanInc: per(hog.leanInc, hog.leanIncHead) },
      nExp: exp.length, nInc: inc.length,
    };
  }
  /** Last month (0-based) with any income or expense in the year, or -1. */
  function lastMonth(year) {
    let m = -1;
    for (const r of S.store.fin()) if (r.kind !== 'part' && r.date && r.date.startsWith(String(year))) m = Math.max(m, +r.date.slice(5, 7) - 1);
    return m;
  }

  /* ---------- window state ---------- */
  const view = { tab: 'overview', year: null, stream: 'hogs', exp: { month: '', cat: '', company: '', q: '' }, inc: { month: '', company: '', q: '' } };

  const SVG = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 7l4 4" stroke="currentColor" stroke-width="2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  };
  const ico = (name) => h('span.fin-i', { html: SVG[name] });

  /* ---------- the window ---------- */
  function open() {
    const ys = years();
    if (!view.year || !ys.includes(view.year)) view.year = [...ys].reverse().find((y) => lastMonth(y) >= 0) || ys[ys.length - 1];
    const win = ui().appWindow({ title: 'Finances', cls: 'fin-win', onClose: () => S.app.landing() });
    const head = h('header.fin-head');
    const tabs = h('nav.fin-tabs', { role: 'tablist' });
    const main = h('main.fin-main');
    win.append(head, tabs, main);

    function render() {
      const ys2 = years();
      const i = ys2.indexOf(view.year);
      head.innerHTML = '';
      head.append(
        h('button.fin-home', { type: 'button', title: 'Back to the SwineOS start screen', onclick: () => S.app.landing() }, ico('back'), h('span', 'SwineOS')),
        h('div.fin-titles', h('h1', 'Finances'), h('p', [S.store.settings.farmName, `Income and expenses ${view.year}`].filter(Boolean).join('  ·  '))),
        h('div.fin-year', { role: 'group', 'aria-label': 'Year' },
          h('button', { type: 'button', title: 'Previous year', 'aria-label': 'Previous year', disabled: i <= 0, onclick: () => { view.year = ys2[i - 1]; render(); } }, ico('back')),
          h('select', { 'aria-label': 'Year', onchange: (e) => { view.year = +e.target.value; render(); } }, ys2.map((y) => h('option', { value: y, selected: y === view.year ? 'selected' : null }, String(y)))),
          h('button', { type: 'button', title: 'Next year', 'aria-label': 'Next year', disabled: i >= ys2.length - 1, onclick: () => { view.year = ys2[i + 1]; render(); } }, ico('next'))),
        h('div.fin-actions',
          h('button.fin-btn.solid', { type: 'button', onclick: () => editExpense(null, render) }, ico('plus'), 'Expense'),
          h('button.fin-btn.solid', { type: 'button', onclick: () => editIncome(null, render) }, ico('plus'), 'Income'),
          h('button.fin-btn', { type: 'button', onclick: () => importDialog(render) }, ico('upload'), 'Import Excel'),
          h('button.fin-btn.icon', { type: 'button', title: 'Print', 'aria-label': 'Print', onclick: () => printTab() }, ico('print')),
          h('button.fin-btn.icon', { type: 'button', title: 'Export to Excel (CSV)', 'aria-label': 'Export to Excel (CSV)', onclick: () => exportTab() }, ico('download')),
          h('button.fin-btn.icon', { type: 'button', title: 'Finance settings', 'aria-label': 'Finance settings', onclick: () => settingsDialog(render) }, ico('gear'))));
      tabs.innerHTML = '';
      [['overview', 'Overview'], ['exp', 'Expenses'], ['inc', 'Income'], ['year', 'Year end']].forEach(([k, label]) => {
        tabs.appendChild(h('button.fin-tab' + (view.tab === k ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': view.tab === k ? 'true' : 'false', onclick: () => { view.tab = k; render(); main.scrollTop = 0; } }, label));
      });
      main.innerHTML = '';
      current = VIEWS[view.tab](render);
      main.appendChild(current);
    }
    // what Print and Export act on: the open tab
    let current = null;
    function printTab() {
      const node = current && current.printNode ? current.printNode() : null;
      if (!node) { ui().toast('Nothing to print on this tab.'); return; }
      ui().printPreview(current.printTitle, node);
    }
    function exportTab() {
      const csv = current && current.csv ? current.csv() : null;
      if (!csv) { ui().toast('Nothing to export on this tab.'); return; }
      ui().saveFile(`${current.fileName}-${U.today()}.csv`, csv, 'text/csv');
    }
    render();
    win.refresh = render;
    return win;
  }

  /* ---------- Overview ---------- */
  function kpi(label, value, sub, cls = '') {
    return h('div.fin-kpi' + cls, h('span.fin-kpi-l', label), h('b.fin-kpi-v', value || '—'), sub ? h('span.fin-kpi-s', sub) : null);
  }
  function change(cur, prev, upGood = true) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || !prev) return null;
    const d = (cur - prev) / Math.abs(prev);
    const good = d === 0 ? null : (d > 0) === upGood;
    return h('span.fin-chg' + (good === null ? '' : good ? '.good' : '.bad'), `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d * 100).toFixed(1)}%`);
  }

  function overviewView(render) {
    const y = view.year;
    const last = lastMonth(y);
    const wrap = h('div.fin-page');
    if (last < 0) {
      wrap.appendChild(emptyState(y, render));
      return wrap;
    }
    const s = summarize(y);
    const hasPrev = lastMonth(y - 1) >= 0;
    const p = hasPrev ? summarize(y - 1, last) : null;
    const vs = hasPrev ? `vs ${monthName(0)}–${monthName(last)} ${y - 1}` : '';
    const sub = (cur, prev, upGood, extra) => h('span', change(cur, prev, upGood), (prev !== undefined && hasPrev && Number.isFinite(prev) && prev) ? ' ' + vs : '', extra || '');

    wrap.appendChild(h('section.fin-kpis',
      kpi('Balance', money(s.balance, 0), h('span', `Profit ${pct(s.margin)} of income`), s.balance >= 0 ? '.hero' : '.hero.neg'),
      kpi('Income', money(s.income, 0), sub(s.income, p && p.income, true)),
      kpi('Expenses', money(s.expense, 0), sub(s.expense, p && p.expense, false)),
      kpi('Hogs shipped', n(s.shipped), sub(s.shipped, p && p.shipped, true, hasPrev ? '' : 'Hog sales and cripples')),
      kpi('Profit / hog', money(s.profitPerHog), sub(s.profitPerHog, p && p.profitPerHog, true)),
      kpi('Feed cost / hog', money(s.feedPerHog), sub(s.feedPerHog, p && p.feedPerHog, false, hasPrev ? '' : `${money(s.feedCost, 0)} feed in total`))));

    // monthly chart
    const chart = h('section.fin-card.fin-chart-card',
      h('div.fin-card-head', h('h2', 'Income and expenses by month'),
        h('div.fin-legend', h('span', h('i', { style: { background: INCOME } }), 'Income'), h('span', h('i', { style: { background: EXPENSE } }), 'Expenses'))),
      monthChart(s.months));
    const catCard = h('section.fin-card',
      h('div.fin-card-head', h('h2', 'Where the money went'), h('span.fin-muted', `${money(s.expense, 0)} in ${s.nExp} bills`)),
      barList(s.byCat.map((c) => ({ label: c.name, value: c.total, tag: c.feed ? 'feed' : '', onClick: () => { view.tab = 'exp'; view.exp = { month: '', cat: String(c.code), company: '', q: '' }; render(); } })), s.expense));
    const incCard = h('section.fin-card',
      h('div.fin-card-head', h('h2', 'Where the money came from'), h('span.fin-muted', `${money(s.income, 0)} from ${s.nInc} cheques`)),
      barList(Object.entries(STREAMS).map(([k, st]) => ({ label: st.label, value: s.streams[k].total, note: `${n(s.streams[k].head)} head`, onClick: () => { view.tab = 'inc'; view.stream = k; render(); } })).filter((x) => x.value), s.income),
      h('div.fin-mini-grid',
        mini('Average $ / hog sold', money(s.hog.perHog)), mini('Average weight', n(s.hog.avgWt, 1) + ' kg'), mini('Average index', n(s.hog.index, 1)),
        mini('Average price', s.hog.price ? money(s.hog.price, 3) + ' / kg' : ''), mini('Income / sow / year', s.sows ? money(s.incomePerSow, 0) : ''), mini('Hogs / sow / year', s.sows ? n(s.shippedPerSow, 1) : '')));
    wrap.append(chart, h('div.fin-two', catCard, incCard));

    // monthly report table (REPORT sheet: Month, Balance, Income, Expense, $/hog, index, weight, hogs, profit / hog, cost / hog)
    const months = s.months.filter((m) => m.m <= last);
    const cols = [
      ['Month', (m) => monthName(m.m)], ['Income', (m) => money(m.income)], ['Expenses', (m) => money(m.expense)], ['Balance', (m) => money(m.income - m.expense)],
      ['Hogs shipped', (m) => n(m.shipped)], ['Income / hog', (m) => (m.shipped ? money(m.income / m.shipped) : '')], ['Cost / hog', (m) => (m.shipped ? money(m.expense / m.shipped) : '')],
      ['Profit / hog', (m) => (m.shipped ? money((m.income - m.expense) / m.shipped) : '')], ['Avg index', (m) => (m.idxHead ? n(m.idx / m.idxHead, 1) : '')], ['Avg weight', (m) => (m.wtHead ? n(m.wt / m.wtHead, 1) : '')],
    ];
    const tot = { m: -1, income: s.income, expense: s.expense, shipped: s.shipped, idx: U.sum(months.map((m) => m.idx)), idxHead: U.sum(months.map((m) => m.idxHead)), wt: U.sum(months.map((m) => m.wt)), wtHead: U.sum(months.map((m) => m.wtHead)) };
    const table = h('table.fin-table',
      h('thead', h('tr', cols.map(([l], i) => h('th', { class: i ? 'num' : null }, l)))),
      h('tbody', months.map((m) => h('tr', { class: m.recs ? null : 'dim' }, cols.map(([, f], i) => h('td', { class: (i ? 'num' : '') + (i === 3 && m.income - m.expense < 0 ? ' neg' : '') }, f(m)))))),
      h('tfoot', h('tr', cols.map(([, f], i) => h('td', { class: i ? 'num' : null }, i ? f(tot) : 'Total')))));
    wrap.appendChild(h('section.fin-card', h('div.fin-card-head', h('h2', 'Monthly report'), h('span.fin-muted', 'Hogs shipped = hog sales and cripples')), h('div.fin-scroll', table)));
    wrap.printNode = () => table.cloneNode(true);
    wrap.printTitle = `Monthly finance report ${y}`;
    wrap.fileName = `finance-monthly-${y}`;
    wrap.csv = () => U.csv([cols.map(([l]) => l), ...months.map((m) => cols.map(([, f]) => f(m))), cols.map(([, f], i) => (i ? f(tot) : 'Total'))]);
    return wrap;
  }
  function mini(label, value) { return h('div.fin-mini', h('span', label), h('b', value || '—')); }

  function emptyState(y, render) {
    const has = S.store.fin().some((r) => r.kind !== 'part');
    return h('div.fin-empty',
      h('div.fin-empty-ico', { html: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 9.5v5M18 9.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' }),
      h('h2', has ? `Nothing recorded for ${y} yet` : 'Start your farm\'s income and expense book'),
      h('p', has ? 'Pick another year at the top, or add this year\'s first bill or cheque.' : 'Import the Expense & Income workbook you use now (.xls or .xlsx), or start typing bills and cheques here.'),
      h('div.fin-empty-btns',
        h('button.fin-btn.solid', { type: 'button', onclick: () => importDialog(render) }, ico('upload'), 'Import Excel workbook'),
        h('button.fin-btn', { type: 'button', onclick: () => editExpense(null, render) }, ico('plus'), 'Add an expense'),
        h('button.fin-btn', { type: 'button', onclick: () => editIncome(null, render) }, ico('plus'), 'Add income')));
  }

  /** Grouped monthly bars (income and expenses), with a hover card per month. Drawn at the box's own width so text stays readable. */
  function monthChart(months) {
    const box = h('div.fin-chart');
    const tip = h('div.fin-tip', { hidden: true });
    let geo = null;
    const short = (v) => (v >= 1e6 ? `$${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${+(v / 1e3).toFixed(0)}k` : `$${v}`);
    function draw(W) {
      const narrow = W < 560;
      const H = narrow ? 220 : 280; const pad = { l: narrow ? 46 : 60, r: 6, t: 12, b: 28 };
      const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
      const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
      const step = niceStep(max / 4); const top = Math.ceil(max / step) * step;
      const y = (v) => pad.t + ih - (v / top) * ih;
      const gw = iw / 12; const bw = Math.max(3, Math.min(26, gw * 0.34));
      geo = { W, pad, gw };
      const bar = (x, v, c) => {
        if (!v) return '';
        const yt = y(v); const base = y(0); const r = Math.min(4, (base - yt) / 2, bw / 2);
        return `<path d="M${x} ${base}V${yt + r}Q${x} ${yt} ${x + r} ${yt}H${x + bw - r}Q${x + bw} ${yt} ${x + bw} ${yt + r}V${base}Z" fill="${c}"/>`;
      };
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Income and expenses by month">`;
      for (let v = 0; v <= top + 1e-9; v += step) svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="fc-grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="fc-ax">${short(v)}</text>`;
      months.forEach((m, i) => {
        const cx = pad.l + gw * i + gw / 2;
        svg += `<rect class="fc-hit" data-i="${i}" x="${pad.l + gw * i}" y="${pad.t}" width="${gw}" height="${ih}"/>`;
        svg += bar(cx - bw - 1, m.income, INCOME) + bar(cx + 1, m.expense, EXPENSE);
        svg += `<text x="${cx}" y="${H - 9}" text-anchor="middle" class="fc-ax">${narrow ? monthName(i)[0] : monthName(i)}</text>`;
      });
      svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" class="fc-base"/></svg>`;
      box.innerHTML = svg;
      tip.hidden = true;
      box.appendChild(tip);
    }
    let lastW = 0;
    const ro = new ResizeObserver((es) => { const w = Math.floor(es[0].contentRect.width); if (w > 0 && w !== lastW) { lastW = w; draw(w); } });
    ro.observe(box);
    draw(760);
    const show = (i) => {
      const m = months[i];
      U.$$('.fc-hit', box).forEach((r) => r.classList.toggle('on', +r.dataset.i === i));
      if (!m.recs) { tip.hidden = true; return; }
      tip.innerHTML = '';
      tip.append(h('b', monthName(i) + ' ' + view.year),
        h('div', h('i', { style: { background: INCOME } }), 'Income', h('span', money(m.income, 0))),
        h('div', h('i', { style: { background: EXPENSE } }), 'Expenses', h('span', money(m.expense, 0))),
        h('div.sum', 'Balance', h('span', money(m.income - m.expense, 0))),
        m.shipped ? h('div.sum', 'Hogs shipped', h('span', n(m.shipped))) : null);
      tip.hidden = false;
      const x = geo.pad.l + geo.gw * i + geo.gw / 2;
      tip.style.left = x + 'px';
      tip.classList.toggle('flip', x > geo.W * 0.6);
    };
    box.addEventListener('pointerover', (e) => { const r = e.target.closest('.fc-hit'); if (r) show(+r.dataset.i); });
    box.addEventListener('pointerleave', () => { tip.hidden = true; U.$$('.fc-hit.on', box).forEach((r) => r.classList.remove('on')); });
    return box;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  /** Horizontal bars: label, bar, amount and share of the total. */
  function barList(items, total) {
    if (!items.length) return h('p.fin-muted', 'Nothing yet.');
    const max = Math.max(...items.map((x) => x.value));
    return h('ul.fin-bars', items.map((x) => h('li', h('button', { type: 'button', onclick: x.onClick, title: `Show ${x.label}` },
      h('span.fb-l', x.label, x.tag ? h('em', x.tag) : null),
      h('span.fb-track', h('span.fb-fill', { style: { width: Math.max(0.5, (x.value / max) * 100) + '%' } })),
      h('span.fb-v', money(x.value, 0), h('small', x.note || pct(x.value / total)))))));
  }

  /* ---------- Expenses ---------- */
  function filterBar(state, opts, onChange) {
    const sel = (key, label, options) => h('label.fin-f', h('span', label), h('select', { onchange: (e) => { state[key] = e.target.value; onChange(); } },
      h('option', { value: '' }, 'All'), options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(state[key]) ? 'selected' : null }, t))));
    const q = h('input', { type: 'search', placeholder: opts.placeholder || 'Search', value: state.q, 'aria-label': 'Search' });
    q.addEventListener('input', U.debounce(() => { state.q = q.value; onChange(true); }, 200));
    return h('div.fin-filters',
      h('label.fin-search', ico('search'), q),
      opts.months ? sel('month', 'Month', opts.months.map((m) => [String(m), monthName(m)])) : null,
      opts.cats ? sel('cat', 'Type', opts.cats.map((c) => [String(c.code), `${c.code} · ${c.name}`])) : null,
      opts.companies ? sel('company', 'Company', opts.companies.map((c) => [c, c])) : null,
      (state.q || state.month || state.cat || state.company) ? h('button.fin-clear', { type: 'button', onclick: () => { Object.keys(state).forEach((k) => { state[k] = ''; }); onChange(); } }, 'Clear filters') : null);
  }
  const distinct = (arr) => [...new Set(arr.filter(Boolean))].sort(U.natCmp);
  const monthsIn = (recs) => [...new Set(recs.map((r) => +r.date.slice(5, 7) - 1))].sort((a, b) => a - b);

  function expensesView(render) {
    const all = recsOf(view.year, 'exp');
    const f = view.exp;
    const wrap = h('div.fin-page');
    const usedCats = new Set(all.map((r) => Number(r.cat) || 0));
    const filters = filterBar(f, { placeholder: 'Product, company or note', months: monthsIn(all), cats: cats().filter((c) => usedCats.has(c.code)), companies: distinct(all.map((r) => r.company)) }, (typing) => { if (typing) update(); else render(); });
    const stats = h('div.fin-stats');
    const columns = [
      { label: 'Date', value: (r) => r.date, render: (r) => U.fmt(r.date) },
      { label: 'Product', value: (r) => r.item },
      { label: 'Company', value: (r) => r.company },
      { label: 'Quantity', num: true, value: (r) => r.qty ?? '', render: (r) => n(r.qty, r.qty % 1 ? 3 : 0) },
      { label: 'Unit', value: (r) => r.unit },
      { label: 'Total $', num: true, value: (r) => r.total, render: (r) => money(r.total) },
      { label: '$ / unit', num: true, value: (r) => (r.qty ? r.total / r.qty : ''), render: (r) => (r.qty ? money(r.total / r.qty, r.total / r.qty < 10 ? 3 : 2) : '') },
      { label: 'Type', value: (r) => Number(r.cat) || 0, render: (r) => h('span.fin-chip', `${r.cat || '–'} · ${catName(r.cat)}`) },
      { label: 'Note', value: (r) => [r.tag, r.note].filter(Boolean).join(' · ') },
    ];
    const grid = ui().grid({ columns, rows: [], cls: 'fin-grid', rowKey: (r) => r.id, emptyText: all.length ? 'No expenses match these filters.' : `No expenses recorded for ${view.year}.`, onRowClick: (r) => viewExpense(r, render) });
    function rows() {
      const q = f.q.trim().toLowerCase();
      return all.filter((r) => (!f.month || +r.date.slice(5, 7) - 1 === +f.month) && (!f.cat || String(Number(r.cat) || 0) === f.cat) && (!f.company || r.company === f.company)
        && (!q || [r.item, r.company, r.unit, r.tag, r.note, catName(r.cat)].some((x) => String(x || '').toLowerCase().includes(q))))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : U.natCmp(a.item, b.item)));
    }
    function update() {
      const list = rows();
      grid.update(list);
      const total = U.sum(list.map((r) => r.total));
      const units = {}; list.forEach((r) => { if (r.qty) { const u = (r.unit || '').toUpperCase(); units[u] = (units[u] || 0) + r.qty; } });
      const unitKeys = Object.keys(units);
      stats.innerHTML = '';
      stats.append(...[h('span', h('b', n(list.length)), list.length === 1 ? ' bill' : ' bills'), h('span', 'Total ', h('b', money(total))),
        unitKeys.length === 1 && unitKeys[0] ? h('span', h('b', n(units[unitKeys[0]], 1)), ' ' + unitKeys[0].toLowerCase(), ' · average ', h('b', money(total / units[unitKeys[0]], 3)), ' / ' + unitKeys[0].toLowerCase()) : null].filter(Boolean));
    }
    update();
    wrap.append(h('section.fin-card.fin-list-card', filters, stats, grid));
    wrap.printNode = () => tableOf(columns, rows(), `Expenses ${view.year}`);
    wrap.printTitle = `Expenses ${view.year}`;
    wrap.fileName = `expenses-${view.year}`;
    wrap.csv = () => U.csv([['Date', 'Product', 'Company', 'Quantity', 'Unit', 'Total $', '$ / unit', 'Type', 'Type name', 'Type 2', 'Note'],
      ...rows().map((r) => [r.date, r.item, r.company, r.qty ?? '', r.unit, r.total, r.qty ? +(r.total / r.qty).toFixed(4) : '', r.cat || '', catName(r.cat), r.tag || '', r.note || ''])]);
    return wrap;
  }
  /** A plain table of grid rows, for printing. */
  function tableOf(columns, rows) {
    return h('table', h('thead', h('tr', columns.map((c) => h('th', c.label)))),
      h('tbody', rows.map((r) => h('tr', columns.map((c) => { const v = c.render ? c.render(r) : c.value(r); return h('td', { style: c.num ? { textAlign: 'right' } : null }, v instanceof Node ? v.textContent : v ?? ''); })))));
  }

  /* ---------- entry dialogs ---------- */
  function datalist(id, values) { return h('datalist', { id }, distinct(values).map((v) => h('option', { value: v }))); }
  function moneyInput(id, v) { return ui().input(id, v === null || v === undefined || v === '' ? '' : String(v), { inputmode: 'decimal', autocomplete: 'off' }); }
  function dialogFoot(isNew, save, del) {
    return [
      { label: 'Save', primary: true, onClick: () => save(false) },
      isNew ? { label: 'Save and add another', onClick: () => save(true) } : null,
      del ? { label: 'Delete', cls: 'danger', onClick: del } : null,
      { label: 'Cancel', right: true },
    ].filter(Boolean);
  }
  function defaultDate() {
    const t = U.today();
    return t.startsWith(String(view.year)) ? t : `${view.year}-12-31` < t ? `${view.year}-12-31` : t;
  }

  /**
   * A record opens read-only; the pencil beside the X (or Edit) opens the form.
   * rows: [label, value] pairs; empty values are left out.
   */
  function viewDialog(title, rows, onEdit) {
    const body = h('dl.fin-view', rows.filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== '—')
      .map(([l, v]) => [h('dt', l), h('dd', v instanceof Node ? v : String(v))]));
    const edit = () => { m.close(); onEdit(); };
    const m = ui().modal({ title, width: 520, cls: 'fin-dlg', body, buttons: [{ label: 'Close', primary: true }] });
    const pencil = h('button.dlg-edit', { type: 'button', title: 'Edit', 'aria-label': 'Edit', onclick: edit }, ico('pencil'));
    const bar = m.box.querySelector('.dlg-title');
    bar.insertBefore(pencil, bar.querySelector('.dlg-x'));
    return m;
  }
  const changedLine = (r) => (r.updated ? U.fmtDT(r.updated) : '');

  function viewExpense(r, render) {
    const per = r.qty ? r.total / r.qty : null;
    viewDialog('Expense', [
      ['Date', U.fmt(r.date)], ['Product', r.item], ['Company', r.company],
      ['Quantity', r.qty ? `${n(r.qty, r.qty % 1 ? 3 : 0)} ${r.unit || ''}`.trim() : ''],
      ['Total', h('b', money(r.total))], ['Price', per !== null ? `${money(per, per < 10 ? 3 : 2)} per ${(r.unit || 'unit').toLowerCase()}` : ''],
      ['Type', `${r.cat || '–'} · ${catName(r.cat)}`], ['Type 2', r.tag], ['Note', r.note], ['Last changed', changedLine(r)],
    ], () => editExpense(r, render));
  }
  function viewIncome(r, render) {
    const hog = r.stream === 'hogs';
    const m2 = (v, d = 2) => (Number.isFinite(v) ? money(v, d) : '');
    viewDialog(STREAMS[r.stream] ? STREAMS[r.stream].label : 'Income', [
      ['Date', U.fmt(r.date)], ['Company', r.company], ['Unit', r.unit], ['Head', n(r.head)],
      ['Cheque total', h('b', money(r.total))], ['Per head', r.head ? money(r.total / r.head) : ''],
      ['Average weight', Number.isFinite(r.avgWt) ? n(r.avgWt, 1) + ' kg' : ''], ['Total weight', Number.isFinite(r.totalWt) ? n(r.totalWt, 1) + ' kg' : ''],
      ...(hog ? [['Index', n(r.index, 1)], ['Price', Number.isFinite(r.price) ? money(r.price, 3) + ' / kg' : ''], ['Fat', n(r.fat, 0)], ['Lean', n(r.lean, 0)],
        ['Health bonus', Number.isFinite(r.bonus) ? `${m2(r.bonus)} / hog` : ''], ['Lean incentive', Number.isFinite(r.leanInc) ? `${m2(r.leanInc)} / hog` : '']] : [['Outstanding', r.outstanding]]),
      ['Note', r.note], ['Last changed', changedLine(r)],
    ], () => editIncome(r, render));
  }
  function editExpense(rec, render, preset) {
    const isNew = !rec;
    const r = rec || { kind: 'exp', date: (preset && preset.date) || defaultDate(), item: '', company: '', qty: null, unit: '', total: null, cat: '' };
    const past = S.store.fin().filter((x) => x.kind === 'exp');
    const date = ui().dateInput('fe-date', r.date);
    const item = ui().input('fe-item', r.item, { list: 'fe-items', autocomplete: 'off', placeholder: 'e.g. Soya, Duplocillin' });
    const company = ui().input('fe-company', r.company, { list: 'fe-companies', autocomplete: 'off' });
    const qty = moneyInput('fe-qty', r.qty);
    const unit = ui().input('fe-unit', r.unit, { list: 'fe-units', autocomplete: 'off', placeholder: 'TON, KGS, BOTTLES …' });
    const total = moneyInput('fe-total', r.total);
    const per = h('output.fin-out');
    const cat = ui().select('fe-cat', [['', 'Pick a type…'], ...cats().map((c) => [String(c.code), `${c.code} · ${c.name}${c.feed ? '  (feed)' : ''}`])], r.cat ? String(r.cat) : '');
    const tag = ui().input('fe-tag', r.tag || '', { autocomplete: 'off', list: 'fe-tags' });
    const note = ui().input('fe-note', r.note || '', { autocomplete: 'off' });
    const info = h('div.fin-hint');
    const calc = () => { const q = num(qty.value); const t = num(total.value); per.textContent = q && t !== null ? `${money(t / q, t / q < 10 ? 3 : 2)} per ${(unit.value || 'unit').toLowerCase()}` : '—'; };
    // a product bought before fills in its company, unit and type, and shows the last price paid
    item.addEventListener('change', () => {
      const prev = past.filter((x) => x.item.toLowerCase() === item.value.trim().toLowerCase() && x.id !== r.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (!prev) { info.textContent = ''; return; }
      if (!company.value) company.value = prev.company;
      if (!unit.value) unit.value = prev.unit;
      if (!cat.value && prev.cat) cat.value = String(prev.cat);
      info.textContent = `Last bought ${U.fmt(prev.date)}: ${n(prev.qty, prev.qty % 1 ? 3 : 0)} ${prev.unit} for ${money(prev.total)}${prev.qty ? ` (${money(prev.total / prev.qty, 3)} / ${prev.unit.toLowerCase()})` : ''} from ${prev.company}.`;
      calc();
    });
    [qty, total, unit].forEach((x) => x.addEventListener('input', calc));
    calc();
    const form = h('div.form.fin-form',
      ui().field('Date', date), ui().field('Product', item), info, ui().field('Company', company),
      h('div.fin-row2', ui().field('Quantity', qty), ui().field('Unit', unit)),
      h('div.fin-row2', ui().field('Total $', total), h('div.frow', h('span.flabel', 'Price'), per)),
      ui().field('Type', cat), ui().field('Type 2', tag, 'Optional second tag, e.g. RESPOND or SURGE'), ui().field('Note', note),
      datalist('fe-items', past.map((x) => x.item)), datalist('fe-companies', past.map((x) => x.company)), datalist('fe-units', ['TON', 'KGS', 'BUSHELS', 'BOTTLES', 'EACH', 'ANIMALS', ...past.map((x) => x.unit)]), datalist('fe-tags', past.map((x) => x.tag)));
    async function save(again) {
      const d = date.value; const t = num(total.value);
      if (!d) { ui().toast('Type the date of the bill.', 'error'); date.focus(); return true; }
      if (!item.value.trim()) { ui().toast('Type what was bought.', 'error'); item.focus(); return true; }
      if (t === null) { ui().toast('Type the total of the bill.', 'error'); total.focus(); return true; }
      if (!cat.value) { ui().toast('Pick the expense type.', 'error'); cat.focus(); return true; }
      const out = { ...r, kind: 'exp', date: d, item: item.value.trim(), company: company.value.trim(), qty: num(qty.value), unit: unit.value.trim().toUpperCase(), total: Math.round(t * 100) / 100, cat: +cat.value, tag: tag.value.trim().toUpperCase() };
      if (note.value.trim()) out.note = note.value.trim(); else delete out.note;
      await S.store.saveFin(out);
      followYear(d);
      render();
      ui().toast(`${isNew ? 'Added' : 'Saved'} ${out.item}: ${money(out.total)}.`, 'ok');
      if (again) setTimeout(() => editExpense(null, render, { date: d }), 0);
      return false;
    }
    ui().modal({ title: isNew ? 'New expense' : 'Edit expense', width: 560, cls: 'fin-dlg', body: form, buttons: dialogFoot(isNew, save, isNew ? null : () => remove(r, `${r.item} (${money(r.total)})`, render)) });
  }
  /** After saving a record of another year, show that year. */
  function followYear(iso) { const y = +iso.slice(0, 4); if (y !== view.year) view.year = y; }
  async function remove(r, what, render) {
    const ok = await ui().confirmBox('Delete', `Delete ${what}?`, 'Delete');
    if (!ok) return true;
    await S.store.deleteFin(r.id);
    render();
    ui().toast('Deleted.', 'ok');
    return false;
  }

  /* ---------- Income ---------- */
  function incomeView(render) {
    const all = recsOf(view.year, 'inc');
    const f = view.inc;
    const st = view.stream;
    const recs = all.filter((r) => r.stream === st);
    const wrap = h('div.fin-page');
    const seg = h('div.fin-seg', { role: 'tablist' }, Object.entries(STREAMS).map(([k, x]) => {
      const t = U.sum(all.filter((r) => r.stream === k).map((r) => r.total));
      return h('button' + (k === st ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': k === st ? 'true' : 'false', onclick: () => { view.stream = k; render(); } }, h('b', x.label), h('span', money(t, 0)));
    }));
    const filters = filterBar(f, { placeholder: 'Company, unit or note', months: monthsIn(recs), companies: distinct(recs.map((r) => r.company)) }, (typing) => { if (typing) update(); else render(); });
    const stats = h('div.fin-kpis.sm');
    const hogCols = st === 'hogs';
    const columns = [
      { label: 'Date', value: (r) => r.date, render: (r) => U.fmt(r.date) },
      { label: 'Company', value: (r) => r.company },
      { label: 'Unit', value: (r) => r.unit },
      { label: 'Head', num: true, value: (r) => r.head, render: (r) => n(r.head) },
      { label: 'Cheque $', num: true, value: (r) => r.total, render: (r) => money(r.total) },
      { label: '$ / head', num: true, value: (r) => (r.head ? r.total / r.head : ''), render: (r) => (r.head ? money(r.total / r.head) : '') },
      { label: 'Avg weight', num: true, value: (r) => r.avgWt ?? '', render: (r) => n(r.avgWt, 1) },
      { label: 'Total weight', num: true, value: (r) => r.totalWt ?? '', render: (r) => n(r.totalWt, 1) },
      ...(hogCols ? [
        { label: 'Index', num: true, value: (r) => r.index ?? '', render: (r) => n(r.index, 1) },
        { label: 'Price', num: true, value: (r) => r.price ?? '', render: (r) => (Number.isFinite(r.price) ? money(r.price) : '') },
        { label: 'Fat', num: true, value: (r) => r.fat ?? '', render: (r) => n(r.fat, 0) },
        { label: 'Lean', num: true, value: (r) => r.lean ?? '', render: (r) => n(r.lean, 0) },
        { label: 'Health bonus', num: true, value: (r) => r.bonus ?? '', render: (r) => (Number.isFinite(r.bonus) ? money(r.bonus) : '') },
        { label: 'Lean incentive', num: true, value: (r) => r.leanInc ?? '', render: (r) => (Number.isFinite(r.leanInc) ? money(r.leanInc) : '') },
      ] : [{ label: 'Outstanding', value: (r) => r.outstanding || '' }]),
      { label: 'Note', value: (r) => r.note || '' },
    ];
    const grid = ui().grid({ columns, rows: [], cls: 'fin-grid', rowKey: (r) => r.id, emptyText: recs.length ? 'No cheques match these filters.' : `No ${STREAMS[st].label.toLowerCase()} recorded for ${view.year}.`, onRowClick: (r) => viewIncome(r, render) });
    function rows() {
      const q = f.q.trim().toLowerCase();
      return recs.filter((r) => (!f.month || +r.date.slice(5, 7) - 1 === +f.month) && (!f.company || r.company === f.company)
        && (!q || [r.company, r.unit, r.note, r.outstanding].some((x) => String(x || '').toLowerCase().includes(q))))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }
    function update() {
      const list = rows();
      grid.update(list);
      const head = U.sum(list.map((r) => r.head)); const total = U.sum(list.map((r) => r.total));
      const w = (k) => { const v = list.filter((r) => Number.isFinite(r[k]) && r.head); const hh = U.sum(v.map((r) => r.head)); return hh ? U.sum(v.map((r) => r[k] * r.head)) / hh : NaN; };
      const wt = list.filter((r) => Number.isFinite(r.totalWt)); const wtHead = U.sum(wt.map((r) => r.head));
      stats.innerHTML = '';
      stats.append(kpi('Head', n(head)), kpi('Cheques', money(total)), kpi('$ / head', head ? money(total / head) : ''), kpi('Average weight', wtHead ? n(U.sum(wt.map((r) => r.totalWt)) / wtHead, 1) + ' kg' : ''));
      if (hogCols) {
        const prices = list.map((r) => r.price).filter(Number.isFinite);
        stats.append(kpi('Average index', n(w('index'), 1)), kpi('Average price', prices.length ? money(U.avg(prices), 3) : ''), kpi('Health bonus', money(U.sum(list.map((r) => (r.bonus || 0) * r.head)), 0), `${money(w('bonus'), 2)} / hog`), kpi('Lean incentive', money(w('leanInc'), 2), 'per hog'));
      }
    }
    update();
    wrap.append(seg, h('section.fin-kpis-wrap', stats), h('section.fin-card.fin-list-card', filters, grid));
    wrap.printNode = () => tableOf(columns, rows());
    wrap.printTitle = `${STREAMS[st].label} ${view.year}`;
    wrap.fileName = `${st === 'hogs' ? 'hog-sales' : st}-${view.year}`;
    wrap.csv = () => U.csv([columns.map((c) => c.label), ...rows().map((r) => columns.map((c) => { const v = c.value(r); return v ?? ''; }))]);
    return wrap;
  }

  function editIncome(rec, render, preset) {
    const isNew = !rec;
    const stream0 = (rec && rec.stream) || (preset && preset.stream) || (view.tab === 'inc' ? view.stream : 'hogs');
    const r = rec || { kind: 'inc', stream: stream0, date: (preset && preset.date) || defaultDate(), company: '', unit: STREAMS[stream0].unit, head: null, total: null };
    const past = S.store.fin().filter((x) => x.kind === 'inc');
    const stream = ui().select('fi-stream', Object.entries(STREAMS).map(([k, x]) => [k, x.label]), r.stream);
    const date = ui().dateInput('fi-date', r.date);
    const company = ui().input('fi-company', r.company, { list: 'fi-companies', autocomplete: 'off', placeholder: 'e.g. HAMS, OLYMEL' });
    const unit = ui().input('fi-unit', r.unit, { list: 'fi-units', autocomplete: 'off' });
    const head = moneyInput('fi-head', r.head);
    const total = moneyInput('fi-total', r.total);
    const avgWt = moneyInput('fi-avgwt', r.avgWt);
    const totalWt = moneyInput('fi-totalwt', r.totalWt);
    const perHead = h('output.fin-out');
    const hogBox = h('div.fin-sub');
    const fields = {};
    for (const [k, label, note] of [['index', 'Index'], ['price', 'Price $ / kg'], ['fat', 'Fat'], ['lean', 'Lean'], ['bonus', 'Health bonus $ / hog'], ['leanInc', 'Lean incentive $ / hog']]) {
      fields[k] = moneyInput('fi-' + k, r[k]);
      hogBox.appendChild(ui().field(label, fields[k], note));
    }
    const outstanding = ui().input('fi-out', r.outstanding || '', { autocomplete: 'off' });
    const outRow = ui().field('Outstanding', outstanding, 'Money still to come, e.g. 300');
    const note = ui().input('fi-note', r.note || '', { autocomplete: 'off' });
    const calc = () => {
      const hd = num(head.value); const t = num(total.value);
      perHead.textContent = hd && t !== null ? `${money(t / hd)} per head` : '—';
      const aw = num(avgWt.value);
      totalWt.placeholder = hd && aw ? n(hd * aw, 1) + ' (head × average)' : '';
    };
    const showStream = () => { hogBox.hidden = stream.value !== 'hogs'; outRow.hidden = stream.value === 'hogs'; };
    stream.addEventListener('change', () => { if (!unit.value || Object.values(STREAMS).some((x) => x.unit === unit.value)) unit.value = STREAMS[stream.value].unit; showStream(); });
    [head, total, avgWt].forEach((x) => x.addEventListener('input', calc));
    // a company sold to before: fill in this stream's usual unit
    company.addEventListener('change', () => {
      const prev = past.filter((x) => x.stream === stream.value && x.company.toLowerCase() === company.value.trim().toLowerCase()).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (prev && !rec) unit.value = prev.unit;
    });
    calc(); showStream();
    const form = h('div.form.fin-form',
      ui().field('Income from', stream), ui().field('Date', date), ui().field('Company', company), ui().field('Unit', unit),
      h('div.fin-row2', ui().field('Head', head), ui().field('Cheque total $', total)),
      h('div.frow', h('span.flabel', 'Per head'), perHead),
      h('div.fin-row2', ui().field('Average weight', avgWt), ui().field('Total weight', totalWt)),
      hogBox, outRow, ui().field('Note', note),
      datalist('fi-companies', past.map((x) => x.company)), datalist('fi-units', ['HOGS', 'CRIPPLES', 'SOWS', 'BOARS', 'GILTS', 'DEAD', 'BUTCHER', 'FINISHER', 'WEANER', 'GROWERS', ...past.map((x) => x.unit)]));
    async function save(again) {
      const d = date.value; const hd = num(head.value); const t = num(total.value);
      if (!d) { ui().toast('Type the date of the cheque.', 'error'); date.focus(); return true; }
      if (hd === null && t === null) { ui().toast('Type the number of head or the cheque total.', 'error'); head.focus(); return true; }
      const out = { ...r, kind: 'inc', stream: stream.value, date: d, company: company.value.trim().toUpperCase(), unit: unit.value.trim().toUpperCase(), head: hd || 0, total: Math.round((t || 0) * 100) / 100 };
      const aw = num(avgWt.value); const tw = num(totalWt.value);
      const setOpt = (k, v) => { if (v === null || v === undefined) delete out[k]; else out[k] = v; };
      setOpt('avgWt', aw); setOpt('totalWt', tw !== null ? tw : aw !== null && hd ? Math.round(aw * hd * 10) / 10 : null);
      for (const k of Object.keys(fields)) setOpt(k, stream.value === 'hogs' ? num(fields[k].value) : null);
      setOpt('outstanding', stream.value !== 'hogs' && outstanding.value.trim() ? outstanding.value.trim() : null);
      setOpt('note', note.value.trim() || null);
      await S.store.saveFin(out);
      followYear(d);
      if (view.tab === 'inc') view.stream = out.stream;
      render();
      ui().toast(`${isNew ? 'Added' : 'Saved'} ${STREAMS[out.stream].one}: ${money(out.total)}.`, 'ok');
      if (again) setTimeout(() => editIncome(null, render, { date: d, stream: out.stream }), 0);
      return false;
    }
    ui().modal({ title: isNew ? 'New income' : `Edit ${STREAMS[r.stream].one}`, width: 600, cls: 'fin-dlg', body: form, buttons: dialogFoot(isNew, save, isNew ? null : () => remove(r, `the ${STREAMS[r.stream].one} of ${U.fmt(r.date)} (${money(r.total)})`, render)) });
  }

  /* ---------- Year end (REPORT and Year End sheets) ---------- */
  function yearEndView(render) {
    const y = view.year;
    const wrap = h('div.fin-page');
    if (lastMonth(y) < 0) { wrap.appendChild(emptyState(y, render)); return wrap; }
    const s = summarize(y);
    const sowsSet = Number(finSettings().sows[y]);
    const key = [
      ['Average breeding females', s.sows ? n(s.sows) : '—', sowsSet ? 'set in Finance settings' : s.sows ? 'from the herd records' : 'set it in Finance settings'],
      ['Total income', money(s.income)], ['Total expenses', money(s.expense)], ['Balance', money(s.balance)], ['Profit', pct(s.margin), 'of income'],
      ['Hogs shipped', n(s.shipped), 'hog sales and cripples'], ['Income / hog shipped', money(s.incomePerHog)], ['Expenses / hog shipped', money(s.costPerHog)], ['Profit / hog shipped', money(s.profitPerHog)],
      ['Feed cost', money(s.feedCost)], ['Feed cost / hog shipped', money(s.feedPerHog)],
      ['Income / breeding female / year', s.sows ? money(s.incomePerSow) : '—'], ['Hogs shipped / breeding female / year', s.sows ? n(s.shippedPerSow, 1) : '—'],
      ['Hogs sold (hog sales)', n(s.hog.head)], ['Average $ / hog sold', money(s.hog.perHog)], ['Average weight / hog sold', n(s.hog.avgWt, 1) + ' kg'], ['Total weight sold', n(s.hog.totalWt, 0) + ' kg'],
      ['Average index', n(s.hog.index, 2)], ['Average price', money(s.hog.price, 4), 'average of the loads'], ['Average fat', n(s.hog.fat, 1)], ['Average lean', n(s.hog.lean, 1)],
      ['Total health bonus', money(s.hog.bonusTotal)], ['Average health bonus / hog sold', money(s.hog.bonus, 4)], ['Average lean incentive / hog sold', money(s.hog.leanInc, 4)],
    ];
    const keyTable = h('table.fin-table.fin-key', h('tbody', key.map(([l, v, note]) => h('tr', h('th', l), h('td.num', v), h('td.fin-muted', note || '')))));
    const units = (c) => Object.entries(c.units).filter(([, q]) => q).map(([u, q]) => `${n(q, q % 1 ? 1 : 0)} ${u.toLowerCase()}`).join(' + ');
    const perUnit = (c) => { const e = Object.entries(c.units).filter(([, q]) => q); return e.length === 1 ? `${money(c.total / e[0][1], c.total / e[0][1] < 10 ? 3 : 2)} / ${e[0][0].toLowerCase()}` : ''; };
    const catRows = [...s.byCat].sort((a, b) => a.code - b.code);
    const sub = (label, list) => { const t = U.sum(list.map((c) => c.total)); return h('tr.sub', h('td'), h('td', label), h('td'), h('td.num', money(t)), h('td'), h('td.num', pct(t / s.expense)), h('td.num', s.shipped ? money(t / s.shipped) : '')); };
    const catTable = h('table.fin-table',
      h('thead', h('tr', h('th', 'Type'), h('th', 'Expense'), h('th', 'Quantity'), h('th.num', 'Total $'), h('th', 'Average price'), h('th.num', '% of expenses'), h('th.num', '$ / hog shipped'))),
      h('tbody', catRows.map((c) => h('tr', h('td', String(c.code || '–')), h('td', c.name, c.feed ? h('em.fin-tag', 'feed') : null), h('td', units(c)), h('td.num', money(c.total)), h('td', perUnit(c)), h('td.num', pct(c.total / s.expense)), h('td.num', s.shipped ? money(c.total / s.shipped) : '')))),
      h('tfoot', sub('Feed', catRows.filter((c) => c.feed)), sub('Other expenses', catRows.filter((c) => !c.feed)), sub('Total expenses', catRows)));
    const incTable = h('table.fin-table',
      h('thead', h('tr', h('th', 'Income'), h('th.num', 'Head'), h('th.num', 'Total $'), h('th.num', '$ / head'), h('th.num', '% of income'))),
      h('tbody', Object.entries(STREAMS).map(([k, x]) => { const t = s.streams[k]; return h('tr', h('td', x.label), h('td.num', n(t.head)), h('td.num', money(t.total)), h('td.num', t.head ? money(t.total / t.head) : ''), h('td.num', pct(t.total / s.income))); })),
      h('tfoot', h('tr.sub', h('td', 'Total income'), h('td.num', n(U.sum(Object.values(s.streams).map((t) => t.head)))), h('td.num', money(s.income)), h('td'), h('td.num', '100.0%'))));
    const partial = lastMonth(y) < 11 && `${y}` >= U.today().slice(0, 4) ? h('p.fin-note', `${y} so far: ${monthName(0)} to ${monthName(lastMonth(y))}.`) : null;
    wrap.append(partial || '',
      h('div.fin-two.wide-first',
        h('section.fin-card', h('div.fin-card-head', h('h2', `Year end ${y}`)), h('div.fin-scroll', keyTable)),
        h('section.fin-card', h('div.fin-card-head', h('h2', 'Income')), h('div.fin-scroll', incTable))),
      h('section.fin-card', h('div.fin-card-head', h('h2', 'Expenses by type'), h('span.fin-muted', 'Click Finance settings to rename types or change which count as feed')), h('div.fin-scroll', catTable)));
    wrap.printNode = () => h('div', h('h4', 'Key figures'), keyTable.cloneNode(true), h('h4', 'Income'), incTable.cloneNode(true), h('h4', 'Expenses by type'), catTable.cloneNode(true));
    wrap.printTitle = `Year end ${y}`;
    wrap.fileName = `year-end-${y}`;
    wrap.csv = () => U.csv([['Key figures', '', ''], ...key.map(([l, v, nn]) => [l, v, nn || '']), [], ['Income', 'Head', 'Total $', '$ / head'],
      ...Object.entries(STREAMS).map(([k, x]) => [x.label, s.streams[k].head, s.streams[k].total.toFixed(2), s.streams[k].head ? (s.streams[k].total / s.streams[k].head).toFixed(2) : '']), [],
      ['Type', 'Expense', 'Feed', 'Quantity', 'Total $', 'Average price', '% of expenses', '$ / hog shipped'],
      ...catRows.map((c) => [c.code, c.name, c.feed ? 'yes' : '', units(c), c.total.toFixed(2), perUnit(c), pct(c.total / s.expense), s.shipped ? (c.total / s.shipped).toFixed(2) : ''])]);
    return wrap;
  }

  /* ---------- Finance settings ---------- */
  function settingsDialog(render) {
    const fs = finSettings();
    const y = view.year;
    const herd = herdSows(y);
    const sows = ui().input('fs-sows', fs.sows[y] || '', { inputmode: 'numeric', placeholder: herd ? String(herd) : '' });
    const list = cats().map((c) => ({ ...c }));
    const tbody = h('tbody');
    const draw = () => {
      tbody.innerHTML = '';
      list.forEach((c, i) => tbody.appendChild(h('tr',
        h('td', h('input.fs-code', { value: c.code, inputmode: 'numeric', 'aria-label': 'Code', oninput: (e) => { c.code = +e.target.value || 0; } })),
        h('td', h('input', { value: c.name, 'aria-label': 'Name', oninput: (e) => { c.name = e.target.value; } })),
        h('td.c', h('input', { type: 'checkbox', checked: c.feed, 'aria-label': 'Counts as feed', onchange: (e) => { c.feed = e.target.checked; } })),
        h('td', S.store.fin().some((r) => r.kind === 'exp' && Number(r.cat) === c.code) ? h('span.fin-muted', 'in use') : h('button.linkbtn', { type: 'button', onclick: () => { list.splice(i, 1); draw(); } }, 'Remove')))));
    };
    draw();
    const body = h('div.fin-form.fin-settings',
      h('h3', `Number of sows in ${y}`),
      ui().field('Average breeding females', sows, herd ? `Leave blank to use the herd records: ${herd} breeding females.` : 'Used for income and hogs shipped per sow per year.'),
      h('h3', 'Expense types'),
      h('p.fin-muted', 'The type codes from the TYPE column of the expense sheet. Types marked feed add up to the feed cost.'),
      h('div.fin-scroll.fs-cats', h('table.fin-table', h('thead', h('tr', h('th', 'Code'), h('th', 'Name'), h('th.c', 'Feed'), h('th'))), tbody)),
      h('button.fin-btn', { type: 'button', onclick: () => { list.push({ code: Math.max(0, ...list.map((c) => c.code)) + 1, name: '', feed: false }); draw(); } }, ico('plus'), 'Add a type'));
    ui().modal({ title: 'Finance settings', width: 560, cls: 'fin-dlg', body, buttons: [
      { label: 'Save', primary: true, onClick: async () => {
        const codes = list.map((c) => c.code);
        if (codes.some((c) => !c) || new Set(codes).size !== codes.length) { ui().toast('Every type needs its own code number.', 'error'); return true; }
        const v = num(sows.value);
        const s2 = { ...fs.sows }; if (v) s2[y] = v; else delete s2[y];
        await saveFinSettings({ cats: list.map((c) => ({ code: c.code, name: c.name.trim() || `Type ${c.code}`, feed: !!c.feed })), sows: s2 });
        render();
        return false;
      } },
      { label: 'Cancel' },
    ] });
  }

  /* ---------- Import Excel ---------- */
  function importDialog(render) {
    const status = h('div.fin-import-status');
    const pick = h('label.fin-drop',
      h('input', { type: 'file', accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', onchange: (e) => read(e.target.files[0]) }),
      ico('upload'), h('b', 'Choose an Excel file'), h('span', 'The Expense & Income workbook (.xls or .xlsx)'));
    const m = ui().modal({ title: 'Import Excel workbook', width: 600, cls: 'fin-dlg', body: h('div', pick, status), buttons: [{ label: 'Close' }] });
    async function read(file) {
      if (!file) return;
      status.innerHTML = ''; status.append(h('p', `Reading ${file.name}…`));
      let res;
      try {
        const wb = await S.xls.readWorkbook(await file.arrayBuffer(), S.pigwin && S.pigwin.unzip);
        res = S.finImport.convert(wb, view.year);
      } catch (e) { status.innerHTML = ''; status.append(h('p.fin-err', e.message || String(e))); return; }
      if (!res.records.length) { status.innerHTML = ''; status.append(h('p.fin-err', 'No expenses or income were found in this workbook. It needs sheets named EXPENSE, HOGS SALES, CRIPPLES or CULL SOW & BOARS with a MONTH column.')); return; }
      const groups = [
        ['Expenses', res.records.filter((r) => r.kind === 'exp')],
        ...Object.entries(STREAMS).map(([k, x]) => [x.label, res.records.filter((r) => r.stream === k)]),
      ].filter(([, l]) => l.length);
      // records already here that this import stands in for: the same year's expenses / income streams
      const kinds = new Set(res.records.map((r) => r.kind + (r.stream || '')));
      const replaced = S.store.fin().filter((r) => kinds.has(r.kind + (r.stream || '')) && r.date.startsWith(String(res.year)));
      const replace = h('input', { type: 'checkbox', checked: true });
      status.innerHTML = '';
      status.append(
        h('p', h('b', file.name), `  ·  ${res.year}`, res.farm ? `  ·  ${res.farm}` : '', res.sows ? `  ·  ${n(res.sows)} sows` : ''),
        h('table.fin-table', h('tbody', groups.map(([label, l]) => h('tr', h('td', label), h('td.num', `${n(l.length)} ${l.length === 1 ? 'record' : 'records'}`),
          h('td.num', money(U.sum(l.map((r) => r.total)))), h('td.num', l[0].kind === 'inc' ? `${n(U.sum(l.map((r) => r.head)))} head` : ''))))),
        replaced.length ? h('label.fin-check', replace, ` Replace the ${n(replaced.length)} matching records already in SwineOS (recommended when importing an updated copy of the same workbook)`) : null,
        h('div.fin-import-go', h('button.fin-btn.solid', { type: 'button', onclick: go }, ico('upload'), `Import ${n(res.records.length)} records`)));
      async function go(e) {
        e.target.disabled = true;
        const removeIds = replaced.length && replace.checked ? replaced.map((r) => r.id) : [];
        await S.store.putFin(res.records, removeIds);
        // the workbook's expense types and number of sows
        const fs = finSettings();
        const known = new Set(fs.cats.map((c) => c.code));
        const extra = res.codes.filter((c) => !known.has(c.code)).map((c) => ({ code: c.code, name: c.name.charAt(0) + c.name.slice(1).toLowerCase(), feed: false }));
        const usedCodes = new Set(res.records.filter((r) => r.kind === 'exp').map((r) => Number(r.cat)).filter((c) => c && !known.has(c) && !extra.some((x) => x.code === c)));
        usedCodes.forEach((c) => extra.push({ code: c, name: `Type ${c}`, feed: false }));
        const patch = {};
        if (extra.length) patch.cats = [...fs.cats, ...extra];
        if (res.sows && !fs.sows[res.year]) patch.sows = { ...fs.sows, [res.year]: res.sows };
        if (Object.keys(patch).length) await saveFinSettings(patch);
        if (res.farm && (!S.store.settings.farmName || S.store.settings.farmName === S.DEFAULT_SETTINGS.farmName)) await S.store.saveSettings({ ...S.store.settings, farmName: res.farm });
        S.store.log(`Imported finance workbook ${file.name}: ${res.records.length} records`);
        view.year = res.year;
        m.close();
        render();
        ui().toast(`Imported ${n(res.records.length)} records from ${file.name}.`, 'ok');
      }
    }
  }

  const VIEWS = { overview: overviewView, exp: expensesView, inc: incomeView, year: yearEndView };

  S.finance = { open, summarize, importDialog: (done) => importDialog(done || (() => {})) };
})(window.SOS);
