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
      S.safety.attach(win);
      app.current = win;
      rerenderFn = rerender || null;
      window.scrollTo(0, 0);
    },
    home() { app.mount(S.mainMenu.home(), () => app.home()); location.hash === '' || history.replaceState(null, '', location.pathname); },
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

  const HELP = {
    home: [
      ['Getting started', 'Use Sow data entry to record events in the barn: matings, pregnancy checks, farrowings, piglet deaths, fostering and weaning. Reports and Action lists are calculated from those records.'],
      ['Entering a new animal', 'In Sows / Boars (or Gilt pool for gilts), click the Entry tab at the bottom, type the new ID and press Enter. Fill in the Herd entry details: arrival and herd entry dates, origin, genetics and so on.'],
      ['Action list entry', 'Enter results for a whole list of sows at once: pick the tab (Farrowing, Weaning, Mating …), type the numbers in the rows and press Enter on the toolbar.'],
      ['Google Drive backup', 'Settings → Google Drive: connect your Google account and choose a folder. SwineOS then backs up a minute after every change, keeps a copy for each day, and loads the newest backup when it opens, so several computers can work on the same herd.'],
      ['Moving from PigWIN', 'Open More options → Import PigWIN backup and choose your .BDR backup file. All sows, boars and their history are loaded.'],
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
      S.drive.available() ? h('p', 'If your herd is backed up to Google Drive, press Load from Google Drive: SwineOS finds the backup folder and loads the records.') : null,
      h('p', 'Start entering your own herd, or load an example herd of about 480 sows with two years of history to try the reports and action lists first. The example can be cleared at any time.')),
    buttons: [
      S.drive.available() ? { label: 'Load from Google Drive', primary: true, onClick: async () => { try { await S.drive.connectAndLoad(); } catch (e) { ui().alertBox('Google Drive', e.message); } } } : null,
      { label: 'Load example herd', primary: !S.drive.available(), onClick: async () => {
        const animals = S.demo.generate();
        ui().toast('Building example herd…');
        await S.store.replaceAll(animals, { ...S.store.settings, demo: true, farmName: 'Example Farm', farmNumber: '1000001' });
        S.model.resetCache();
        app.home();
      } },
      { label: 'Start with my own herd', onClick: () => S.settingsUI.open('farm') },
    ].filter(Boolean) });
  }

  async function start() {
    root = U.$('#app');
    // inside the claude.ai viewer the print dialog is unavailable; Export still works
    if (window.claude) document.documentElement.classList.add('in-artifact');
    root.innerHTML = '<div class="loading">Loading herd records…</div>';
    await S.store.init();
    S.safety.start();
    S.mainMenu.applyScale();
    S.mainMenu.applyPrint();
    let lastCount = -1;
    S.store.onChange(() => {
      S.model.resetCache();
      // keep open windows current when records change (e.g. another computer saves)
      if (!U.$('.modal-back') && app.current && app.current.refresh) app.current.refresh();
      else if (!U.$('.modal-back') && app.current && app.current.classList.contains('home-win')) app.home();
      lastCount = S.store.animals().length;
    });
    app.home();
    if (S.drive.configured()) {
      // load the newest Google Drive backup before deciding the herd is empty
      await Promise.race([S.drive.startup(), new Promise((r) => setTimeout(r, 20000))]);
    }
    if (!S.store.animals().length && !U.$('.modal-back')) welcome();
    void lastCount;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2' && !U.$('.modal-back')) { e.preventDefault(); app.entry(); }
    });
  }

  S.app = app;
  document.addEventListener('DOMContentLoaded', start);
})(window.SOS);
