/* SwineOS – Settings and backup / restore. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;

  const LIST_NAMES = [
    ['locations', 'Locations (rooms / pens / crates)'], ['breeds', 'Breeds / lines'], ['cullReasons', 'Cull reasons'], ['deathReasons', 'Sow death reasons'],
    ['pigDeathCauses', 'Piglet death causes'], ['diseases', 'Diseases / problems'], ['treatments', 'Treatments / products'], ['technicians', 'Technicians'],
  ];
  const TARGETS = [
    ['weanedMbfYear', 'Weaned pigs / MBF / year'], ['littersMbfYear', 'Litters / MBF / year'], ['totalBorn', 'Total born / litter'], ['bornAlive', 'Born alive / litter'],
    ['weanedLitter', 'Weaned / litter'], ['pwm', 'Pre-weaning mortality % (max)'], ['farrowRate', 'Farrowing rate %'], ['wsi', 'Wean to service interval (max)'],
    ['npd', 'Non-productive days / year (max)'], ['cullRate', 'Culling rate % (max)'], ['mortRate', 'Sow mortality rate % (max)'], ['farrowInterval', 'Farrowing interval (max)'], ['repeatPct', 'Repeat services % (max)'],
  ];

  function open(section = 'farm') {
    const s = JSON.parse(JSON.stringify(S.store.settings));
    const tabsDef = [['farm', 'Farm'], ['codes', 'Code lists'], ['vacc', 'Vaccinations'], ['targets', 'Targets'], ['actions', 'Action lists'], ['data', 'Backup & data'], ['drive', 'Google Drive']];
    if (section === 'entry' || section === 'report') section = 'farm';
    const body = h('div.settings');
    const tabBar = h('div.set-tabs');
    const pane = h('div.set-pane');
    body.append(tabBar, pane);
    let cur = section;
    function show(k) {
      cur = k;
      tabBar.innerHTML = '';
      tabsDef.forEach(([key, label]) => tabBar.appendChild(h('button.set-tab' + (key === k ? '.active' : ''), { type: 'button', onclick: () => show(key) }, label)));
      pane.innerHTML = '';
      pane.appendChild(panes[k]());
    }
    const num = (obj, key, attrs = {}) => h('input', { type: 'number', value: obj[key], ...attrs, onchange: (e) => { obj[key] = e.target.value === '' ? '' : +e.target.value; } });
    const txt = (obj, key, attrs = {}) => h('input', { value: obj[key] || '', ...attrs, onchange: (e) => { obj[key] = e.target.value; } });
    const panes = {
      farm: () => h('div.form',
        ui().field('Farm name', txt(s, 'farmName')),
        ui().field('Farm number', txt(s, 'farmNumber')),
        ui().field('Gestation length (days)', num(s, 'gestationLength', { min: 105, max: 125 }), 'Used for due dates'),
        ui().field('Target lactation (days)', num(s, 'targetLactation', { min: 10, max: 40 })),
        ui().field('Gilt age for service list (days)', num(s, 'giltEntryAge', { min: 120, max: 400 })),
        ui().field('Matings up to … days after the first mating are one service', num(s, 'serviceWindowDays', { min: 1, max: 10 }), 'PigWIN uses 6: a mating 7 or more days after the first one is a repeat service.'),
        h('p.hint', `Data is stored ${S.store.state.backend === 'cloud' ? 'in the shared online database – everyone with access to this app sees the same herd.' : 'in this web browser on this computer. Download a backup regularly (Backup & data).'}`)),
      codes: () => h('div.codes-edit', LIST_NAMES.map(([k, label]) => h('label.code-list', h('span.flabel', label),
        h('textarea', { rows: 6, onchange: (e) => { s.lists[k] = e.target.value.split('\n').map((x) => x.trim()).filter((x, i) => x || (k === 'technicians' && i === 0)); } }, (s.lists[k] || []).join('\n')))), h('p.hint', 'One entry per line.')),
      vacc: () => {
        const host = h('div');
        const render = () => {
          host.innerHTML = '';
          const t = h('table.rtable.vacc-t', h('thead', h('tr', ['Active', 'Name', 'Applies to', 'Days after', 'Day', ''].map((c) => h('th', c)))),
            h('tbody', s.vaccinations.map((v, i) => h('tr',
              h('td', h('input', { type: 'checkbox', checked: v.active, onchange: (e) => { v.active = e.target.checked; } })),
              h('td', h('input', { value: v.name, onchange: (e) => { v.name = e.target.value; } })),
              h('td', ui().select('vt-' + i, [['served', 'Served sows'], ['lactating', 'Lactating sows'], ['open', 'Weaned / open sows'], ['gilt', 'Gilts'], ['boar', 'Boars (repeat)']], v.target, { onchange: (e) => { v.target = e.target.value; v.ref = { served: 'service', lactating: 'farrow', open: 'wean', gilt: 'birth', boar: 'repeat' }[v.target]; render(); } })),
              h('td', { class: 'ref' }, { service: 'service', farrow: 'farrowing', wean: 'weaning', birth: 'birth', repeat: 'last dose / entry' }[v.ref]),
              h('td', h('input', { type: 'number', value: v.day, style: { width: '70px' }, onchange: (e) => { v.day = +e.target.value; } })),
              h('td', h('button.wbtn.sm', { type: 'button', onclick: () => { s.vaccinations.splice(i, 1); render(); } }, 'Remove'))))));
          host.append(t, h('button.wbtn', { type: 'button', onclick: () => { s.vaccinations.push({ id: U.uid('v'), name: 'New vaccination', target: 'served', ref: 'service', day: 90, active: true }); render(); } }, 'Add vaccination'),
            h('p.hint', 'Due vaccinations show in Reports → Vaccinations and in the Action lists under Periodical actions.'));
        };
        render();
        return host;
      },
      targets: () => h('div.form', TARGETS.map(([k, l]) => ui().field(l, num(s.targets, k, { step: '0.1' })))),
      actions: () => h('div.form', h('p.hint', 'Default selections for the Action lists dialog.'),
        ...[['giltAge', 'Gilts from (days of age)'], ['openDays', 'Open sows from (days open)'], ['servicesLast', 'No. of services last (days)'], ['heat3', 'Heat check at 3 weeks from (days gestation)'], ['heat6', 'Heat check at 6 weeks from (days gestation)'], ['preg1', 'Pregnancy check on (days)'], ['preg2', 'Pregnancy check 2 on (days)'], ['served', 'Sows served (days)'], ['dueFarrow', 'Sows due to farrow next (days)'], ['weanLitters', 'Sows to be weaned, litters from (days)']]
          .map(([k, l]) => ui().field(l, num(s.actionLists, k, { min: 0 })))),
      drive: () => S.drive.pane(),
      data: () => {
        const st = S.store.state;
        const females = S.store.animals().filter((a) => a.sex === 'F').length;
        const prog = h('div.progress');
        return h('div.data-pane',
          h('p', `${S.store.animals().length} animals on file (${females} females). Storage: ${st.backend === 'cloud' ? 'shared online database' : 'this browser'}.`),
          s.demo ? h('p.demo-note', 'The herd on file is EXAMPLE data. Clear it before entering your own animals.') : null,
          h('div.btn-col',
            h('button.wbtn', { type: 'button', onclick: () => ui().saveFile(`swineos-backup-${U.today()}.json`, S.store.exportJSON(), 'application/json') }, 'Download backup file to this computer'),
            h('button.wbtn', { type: 'button', onclick: () => show('drive') }, S.drive.configured() ? 'Google Drive backup: ' + (S.drive.config.folderName || '') : 'Connect Google Drive for automatic backups…'),
            h('label.wbtn.file.big', 'Import PigWIN backup (.BDR)…', h('input', { type: 'file', accept: '.bdr,.BDR,.zip', onchange: (e) => importPigwin(e.target.files[0], prog) })),
            h('label.wbtn.file', 'Restore backup…', h('input', { type: 'file', accept: '.json,.gz,application/json,application/gzip,.bdr,.BDR', onchange: (e) => restore(e.target.files[0], prog) })),
            h('label.wbtn.file', 'Import animals from CSV…', h('input', { type: 'file', accept: '.csv,text/csv', onchange: (e) => importCsv(e.target.files[0], prog) })),
            h('button.wbtn', { type: 'button', onclick: () => loadDemo(prog) }, 'Load example herd'),
            h('button.wbtn.danger', { type: 'button', onclick: () => clearAll(prog) }, 'Clear all records')),
          prog,
          h('p.hint', 'Moving from PigWIN or PigLITTER: make a farm backup there (PigMAIN → Backup farm data) and import the .BDR file here. All sows, boars and their history are loaded.'),
          h('p.hint', 'CSV import columns: ID, Sex (F/M), Birth date, Arrival date, Entry date, Parity, Breed, Location. Dates as YYYY-MM-DD or M/D/YYYY.'));
      },
    };
    show(cur);
    ui().modal({ title: 'Settings', body, width: 760, cls: 'set-modal', buttons: [
      { label: 'Save', primary: true, onClick: async () => {
        await S.store.saveSettings(s);
        S.model.resetCache();
        S.store.log('Changed settings');
        ui().toast('Settings saved.', 'ok');
        S.app.rerender();
      } },
      { label: 'Cancel' },
    ] });
  }

  function progress(el) { return (d, t) => { el.textContent = `Saving ${d} of ${t}…`; if (d === t) el.textContent = 'Done.'; }; }

  async function importPigwin(file, prog) {
    if (!file) return;
    let res;
    try {
      res = await S.pigwin.importBDR(await file.arrayBuffer(), file.name, (msg) => { prog.textContent = msg; });
    } catch (e) {
      prog.textContent = '';
      ui().alertBox('Import failed', (e && e.message) || String(e));
      return;
    }
    prog.textContent = '';
    const st = res.stats;
    const first = res.animals.flatMap((a) => a.events.map((e) => e.date)).sort()[0];
    const ok = await ui().confirmBox('Import PigWIN backup',
      `${res.settings.farmNumber || ''} ${res.settings.farmName || ''}\n\n${st.animals} animals (${st.active} active), ${st.events} events, from ${U.fmt(first)}.\n\nThis replaces all records now in SwineOS. Your code lists are kept and the backup's reasons and causes are added to them.`, 'Import');
    if (!ok) return;
    const cur = S.store.settings;
    const lists = { ...cur.lists };
    for (const [k, v] of Object.entries(res.settings.lists)) lists[k] = [...new Set([...(cur.lists[k] || []), ...v])];
    const settings = { ...cur, farmName: res.settings.farmName || cur.farmName, farmNumber: res.settings.farmNumber || cur.farmNumber, gestationLength: res.settings.gestationLength || cur.gestationLength, targets: { ...cur.targets, ...(res.settings.targets || {}) }, lists, demo: false };
    await S.store.replaceAll(res.animals, settings, progress(prog));
    S.model.resetCache();
    S.store.log(`Imported PigWIN backup ${file.name}: ${st.animals} animals, ${st.events} events`);
    ui().toast(`Imported ${st.animals} animals from PigWIN.`, 'ok');
    U.$$('.modal-back').forEach((m) => m.remove());
    S.app.home();
  }

  async function restore(file, prog) {
    if (!file) return;
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) { importPigwin(file, prog); return; } // a zip: PigWIN .BDR
    let data;
    try { data = await S.store.parseBackup(await file.arrayBuffer()); } catch (e) { ui().alertBox('Restore failed', 'This file is not a SwineOS backup (it is not valid JSON).'); return; }
    if (!data || !Array.isArray(data.animals)) { ui().alertBox('Restore failed', 'This file is not a SwineOS backup (no animals found).'); return; }
    const ok = await ui().confirmBox('Restore backup', `Replace all current records with the backup from ${data.exported ? new Date(data.exported).toLocaleString() : 'this file'} (${data.animals.length} animals)?`, 'Replace records');
    if (!ok) return;
    await S.store.replaceAll(data.animals, data.settings, progress(prog), { log: data.log });
    S.model.resetCache();
    S.store.log(`Restored backup with ${data.animals.length} animals`);
    ui().toast('Backup restored.', 'ok');
    U.$$('.modal-back').forEach((m) => m.remove());
    S.app.home();
  }

  function parseDate(t) {
    t = (t || '').trim();
    if (!t) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    return undefined;
  }
  async function importCsv(file, prog) {
    if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
    const rows = lines.map((l) => l.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, '').trim()));
    if (rows.length && /id/i.test(rows[0][0])) rows.shift();
    const existing = new Set(S.store.animals().map((a) => String(a.id).toLowerCase()));
    const add = [];
    rows.forEach((r) => {
      if (!r[0] || existing.has(r[0].toLowerCase())) return;
      add.push({ uid: U.uid(/^m/i.test(r[1]) ? 'b' : 's'), id: r[0], sex: /^m|^b/i.test(r[1] || '') ? 'M' : 'F', birthDate: parseDate(r[2]), arrivalDate: parseDate(r[3]) || parseDate(r[4]) || U.today(), entryDate: parseDate(r[4]) || parseDate(r[3]) || U.today(), entryParity: +r[5] || 0, breed: r[6] || undefined, location: r[7] || undefined, events: [] });
      existing.add(r[0].toLowerCase());
    });
    if (!add.length) { ui().alertBox('Import', 'No new animals found in this file (existing IDs are skipped).'); return; }
    const ok = await ui().confirmBox('Import animals', `Add ${add.length} new animals?`, 'Import');
    if (!ok) return;
    await S.store.replaceAll([...S.store.animals(), ...add], null, progress(prog));
    S.store.log(`Imported ${add.length} animals from CSV`);
    ui().toast(`${add.length} animals imported.`, 'ok');
  }
  async function loadDemo(prog) {
    const ok = await ui().confirmBox('Load example herd', 'Replace all current records with an example herd of about 480 sows and 40 boars with two years of history? Use this to try the program out.', 'Load example');
    if (!ok) return;
    prog.textContent = 'Building example herd…';
    await new Promise((r) => setTimeout(r, 30));
    const animals = S.demo.generate();
    await S.store.replaceAll(animals, { ...S.store.settings, demo: true, farmName: 'Example Farm', farmNumber: '1000001' }, progress(prog));
    S.model.resetCache();
    S.store.log('Loaded example herd');
    ui().toast('Example herd loaded.', 'ok');
    U.$$('.modal-back').forEach((m) => m.remove());
    S.app.home();
  }
  async function clearAll(prog) {
    const ok = await ui().confirmBox('Clear all records', 'Delete every animal and event? Download a backup first if you may need them. Settings and code lists are kept.', 'Delete everything');
    if (!ok) return;
    await S.store.replaceAll([], { ...S.store.settings, demo: false, lastEntryDate: '' }, progress(prog));
    S.model.resetCache();
    S.store.log('Cleared all records');
    ui().toast('All records cleared.', 'ok');
    U.$$('.modal-back').forEach((m) => m.remove());
    S.app.home();
  }

  S.settingsUI = { open, loadDemo, restore, importPigwin };
})(window.SOS);
