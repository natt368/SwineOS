/* SwineOS – application shell: main menu, navigation, help, start-up. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);
  let root;
  let rerenderFn = null;

  const app = {
    current: null,
    entryDateSticky: true,
    mount(win, rerender) {
      root.innerHTML = '';
      if (S.store.settings.demo) root.appendChild(h('div.demo-banner', 'EXAMPLE DATA – this herd was generated for trying the program. Clear it under Settings → Backup & data before entering your own animals.'));
      root.appendChild(win);
      app.current = win;
      rerenderFn = rerender || null;
      window.scrollTo(0, 0);
    },
    home() { app.mount(homeScreen(), () => app.home()); location.hash === '' || history.replaceState(null, '', location.pathname); },
    reports(section = 'sows') { app.mount(S.reports.menu(section), () => app.reports(section)); },
    entry() { const w = S.entry.open(); app.mount(w, null); },
    show(fn) { const w = fn(); if (w) app.mount(w, null); },
    openSow(a) {
      const w = S.entry.open();
      app.mount(w, null);
      w.selectAnimal(a);
    },
    rerender() { if (app.current && app.current.refresh) app.current.refresh(); else if (rerenderFn) rerenderFn(); },
    help,
  };

  function kpiStrip() {
    const animals = S.store.animals();
    const fem = animals.filter((a) => a.sex === 'F' && !A(a).removed);
    const c = (s) => fem.filter((a) => A(a).status === s).length;
    const gest = S.store.settings.gestationLength;
    const today = U.today();
    const due7 = fem.filter((a) => A(a).status === 'Served' && U.diff(U.addDays(A(a).lastService.date, gest), today) <= 7).length;
    const wean = fem.filter((a) => A(a).lactating && U.diff(today, A(a).currentLitter.farrowDate) >= S.store.settings.targetLactation).length;
    const pig = U.sum(fem.filter((a) => A(a).lactating).map((a) => A(a).piglets));
    const tile = (label, v, onclick) => h('button.kpi', { type: 'button', onclick }, h('span.kv', String(v)), h('span.kl', label));
    return h('div.kpis',
      tile('Breeding females', fem.length, () => app.entry()),
      tile('Gilts', c('Gilt'), () => app.entry()),
      tile('Open', c('Open'), () => app.entry()),
      tile('Served', c('Served'), () => app.entry()),
      tile('Lactating', c('Lactating'), () => app.entry()),
      tile('Piglets on sows', pig, () => app.entry()),
      tile('Due to farrow ≤ 7 d', due7, () => S.actionLists.open()),
      tile('Ready to wean', wean, () => S.actionLists.open()));
  }

  function homeScreen() {
    const st = S.store.settings;
    const win = h('section.win.home-win');
    win.appendChild(h('div.win-title', h('span.win-name', `SwineOS  -  [${st.farmNumber} ${st.farmName}]`)));
    const tb = h('div.toolbar.home-tb');
    [['entry', 'Sow data entry', () => app.entry()], ['reports', 'Reports', () => app.reports()], ['actions', 'Action lists', () => S.actionLists.open()], '|',
      ['settings', 'Settings', () => S.settingsUI.open('farm')], ['backup', 'Backup', () => S.settingsUI.open('data')], '|', ['help', 'Help', () => help('home')]]
      .forEach((t) => { if (t === '|') tb.appendChild(h('span.tb-sep')); else tb.appendChild(h('button.tb-btn', { type: 'button', onclick: t[2] }, ui().icon(t[0]), h('span', t[1]))); });
    win.appendChild(tb);
    const today = U.today();
    win.appendChild(h('div.home-body',
      h('div.home-hero',
        h('div.hero-pig', { html: ui().ICONS.sow }),
        h('div.hero-logo', h('span.l1', 'Swine'), h('span.l2', 'OS'), h('sup', '®')),
        h('div.hero-farm', `${st.farmNumber}  ${st.farmName}`),
        h('div.hero-date', `${U.weekday(today)} ${U.fmt(today)}  ·  week ${U.isoWeek(today).slice(6)}`)),
      h('div.home-band', kpiStrip()),
      h('div.home-nav',
        h('button.navy-btn.big', { type: 'button', onclick: () => app.entry() }, 'Sow data entry'),
        h('button.navy-btn.big', { type: 'button', onclick: () => app.reports('sows') }, 'Sow / gilt reports'),
        h('button.navy-btn.big', { type: 'button', onclick: () => app.show(S.reports.herdPerformance) }, 'Herd performance'),
        h('button.navy-btn.big', { type: 'button', onclick: () => S.actionLists.open() }, 'Action lists'),
        h('button.navy-btn.big', { type: 'button', onclick: () => app.reports('piglets') }, 'Piglet reports'),
        h('button.navy-btn.big', { type: 'button', onclick: () => app.reports('boars') }, 'Boar reports')),
      h('div.home-foot', `Records stored ${S.store.state.backend === 'cloud' ? 'in the shared online database' : 'in this browser – download a backup regularly'}.`)));
    return win;
  }

  const HELP = {
    home: [
      ['Getting started', 'Use Sow data entry to record events in the barn: matings, pregnancy checks, farrowings, piglet deaths, fostering and weaning. Reports and Action lists are calculated from those records.'],
      ['Entering a new animal', 'In Sow data entry, click the Entry tab at the bottom, type the new ID and press Enter. Fill in birth, arrival and herd entry dates.'],
      ['Backups', S.store && S.store.state.backend === 'cloud' ? 'Records are kept in the shared online database. You can still download a backup file under Settings → Backup & data.' : 'Records are kept in this web browser. Download a backup file regularly under Settings → Backup & data, and restore it on another computer if needed.'],
    ],
    entry: [
      ['Recording an event', '1. Click the event tab at the bottom (Mate, Farrow, Wean …). It turns red.\n2. Type the sow ID in the green box and press Enter.\n3. Fill in the form and press Enter or Save.\nThe list at the top (Current tab) shows the sows that can have that event, e.g. lactating sows for Wean.'],
      ['Editing or deleting', 'Click an event in the history, then press Edit or Delete on the toolbar. Double-clicking an event also opens it for editing. Use Details… to change birth date, location, breed, or to delete an animal entered by mistake.'],
      ['Status', 'Gilt = entered, not yet served. Served = mated, waiting to farrow. Lactating = farrowed, litter not weaned. Open = weaned, returned or negative pregnancy check. Culled / Dead / Sold = removed.'],
      ['Checks', 'The program warns about unlikely entries, e.g. gestation outside 105–125 days, weaning a sow that is not lactating, or more deaths than piglets on the sow.'],
      ['Data validation', 'The buttons on the right list all events of one kind for a date range, so you can check what was entered this week.'],
    ],
    reports: [
      ['Reports', 'Pick a report. Change the dates and parity at the bottom of the report; it updates right away. Graph draws a chart, Export saves a CSV file for Excel, Print opens a print preview.'],
      ['Herd performance', 'Key indicators for one or several periods. Use Report Option Seasonal with Columns and period length (e.g. 13 columns of 4 weeks) to see trends. Tabs at the bottom switch between Key, Mating, Farrowing, Weaning, Reproductive cycle and Herd turnover. Figures on a yellow background may change because some outcomes are not known yet. Green and red show results against your targets.'],
      ['Application tools', 'Breakdown, Cross tabulation, Histogram and the other tools work on one record per litter farrowed in the period.'],
    ],
  };
  function help(topic = 'home') {
    const items = HELP[topic] || HELP.home;
    ui().modal({ title: 'Help', width: 640, body: h('div.help', items.map(([t, d]) => h('div', h('h4', t), h('p', { style: { whiteSpace: 'pre-line' } }, d))), h('p.hint', 'SwineOS – sow herd management.')), buttons: [{ label: 'Close', primary: true }] });
  }

  function welcome() {
    ui().modal({ title: 'Welcome to SwineOS', width: 560, body: h('div',
      h('p', 'There are no animals on file yet.'),
      h('p', 'Start entering your own herd, or load an example herd of about 480 sows with two years of history to try the reports and action lists first. The example can be cleared at any time.')),
    buttons: [
      { label: 'Load example herd', primary: true, onClick: async () => {
        const animals = S.demo.generate();
        ui().toast('Building example herd…');
        await S.store.replaceAll(animals, { ...S.store.settings, demo: true, farmName: 'Example Farm', farmNumber: '1000001' });
        S.model.resetCache();
        app.home();
      } },
      { label: 'Start with my own herd', onClick: () => S.settingsUI.open('farm') },
    ] });
  }

  async function start() {
    root = U.$('#app');
    // inside the claude.ai viewer the print dialog is unavailable; Export still works
    if (window.claude) document.documentElement.classList.add('in-artifact');
    root.innerHTML = '<div class="loading">Loading herd records…</div>';
    await S.store.init();
    let lastCount = -1;
    S.store.onChange(() => {
      S.model.resetCache();
      // keep open windows current when records change (e.g. another computer saves)
      if (!U.$('.modal-back') && app.current && app.current.refresh) app.current.refresh();
      else if (!U.$('.modal-back') && app.current && app.current.classList.contains('home-win')) app.home();
      lastCount = S.store.animals().length;
    });
    app.home();
    if (!S.store.animals().length) welcome();
    void lastCount;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2' && !U.$('.modal-back')) { e.preventDefault(); app.entry(); }
    });
  }

  S.app = app;
  document.addEventListener('DOMContentLoaded', start);
})(window.SOS);
