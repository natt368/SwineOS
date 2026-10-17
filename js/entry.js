/* SwineOS – Sow data entry window. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  const TAB_ORDER = ['entry', 'heat', 'mate', 'preg', 'abort', 'farrow', 'pigdeath', 'foster', 'partwean', 'wean', 'nurse', 'location', 'editid', 'disease', 'remove'];
  const TAB_LABEL = { entry: 'Entry', heat: 'Heat', mate: 'Mate', preg: 'ReproChk', abort: 'Abort', farrow: 'Farrow', pigdeath: 'PigDth', foster: 'Foster', partwean: 'PartWean', wean: 'Wean', nurse: 'Nurse', location: 'Location', editid: 'Edit ID', disease: 'Disease', remove: 'Remove' };
  const ELIGIBLE = {
    entry: () => false,
    heat: (r) => ['Gilt', 'Open', 'Served'].includes(r.status),
    mate: (r) => ['Gilt', 'Open', 'Served', 'Lactating'].includes(r.status),
    preg: (r) => r.status === 'Served',
    abort: (r) => r.status === 'Served',
    farrow: (r) => r.status === 'Served',
    pigdeath: (r) => r.status === 'Lactating',
    foster: (r) => r.status === 'Lactating',
    partwean: (r) => r.status === 'Lactating',
    wean: (r) => r.status === 'Lactating',
    nurse: (r) => r.status === 'Open' && r.lastWeanDate && U.diff(U.today(), r.lastWeanDate) <= 14,
    location: (r) => !r.removed,
    editid: (r) => !r.removed,
    disease: (r) => !r.removed,
    remove: (r) => !r.removed,
  };

  /** Human-readable remarks for an event. */
  function describe(e) {
    switch (e.type) {
      case 'mate': return [e.boar ? 'Boar ' + e.boar : '', e.method || '', e.tech || ''].filter(Boolean).join(' · ');
      case 'preg': return (e.result === '-' ? 'Negative' : 'Positive') + (e.method ? ' (' + e.method + ')' : '');
      case 'farrow': return `TB ${(+e.liveBorn || 0) + (+e.stillborn || 0) + (+e.mummies || 0)}  BA ${e.liveBorn || 0}  SB ${e.stillborn || 0}  MM ${e.mummies || 0}` + (e.birthWeight ? `  Wt ${e.birthWeight} kg` : '') + (e.location ? '  ' + e.location : '');
      case 'pigdeath': return e.cause || '';
      case 'foster': return (Number(e.count) >= 0 ? 'Fostered on' : 'Fostered off') + (e.otherSow ? ' – sow ' + e.otherSow : '');
      case 'nurse': return 'Nurse sow' + (e.otherSow ? ' – from ' + e.otherSow : '');
      case 'partwean': case 'wean': return e.weight ? `${e.weight} kg (${e.count ? (e.weight / e.count).toFixed(1) : '-'} kg/pig)` : '';
      case 'location': return e.location || '';
      case 'editid': return `${e.oldId || ''} → ${e.newId || ''}`;
      case 'disease': return [e.disease, e.treatment, e.dose].filter(Boolean).join(' · ');
      case 'vaccinate': return e.vaccine || '';
      case 'condition': return [e.score ? 'Score ' + e.score : '', e.backfat ? 'Backfat ' + e.backfat + ' mm' : ''].filter(Boolean).join(' · ');
      case 'remove': return (e.kind === 'death' ? 'Death' : e.kind === 'sold' ? 'Sold' : 'Cull') + (e.reason ? ' – ' + e.reason : '');
      default: return '';
    }
  }
  const eventCount = (e) => (e.type === 'farrow' ? e.liveBorn : ['pigdeath', 'foster', 'partwean', 'wean', 'nurse'].includes(e.type) ? e.count : '');

  /** History rows (with parity and interval) for one animal. */
  function historyRows(a) {
    const r = A(a);
    const rows = [];
    if (a.birthDate) rows.push({ kind: 'animal', date: a.birthDate, par: '', interval: '', event: 'Birth', count: '', remarks: a.breed || '' });
    if (a.arrivalDate) rows.push({ kind: 'animal', date: a.arrivalDate, par: '', interval: a.birthDate ? U.diff(a.arrivalDate, a.birthDate) : '', event: 'Arrival', count: '', remarks: a.origin || '' });
    if (a.entryDate) rows.push({ kind: 'animal', date: a.entryDate, par: Number(a.entryParity) || '', interval: '', event: 'Herd entry', count: '', remarks: Number(a.entryParity) ? 'Entry parity ' + a.entryParity : '' });
    let par = Number(a.entryParity) || 0;
    let lastFarrow = null; let lastWean = null; let lastSvc = null; let prevMate = null;
    for (const e of r.events) {
      let interval = '';
      if (e.type === 'farrow') { par++; interval = lastSvc ? U.diff(e.date, lastSvc) : ''; lastFarrow = e.date; }
      else if (e.type === 'wean') { interval = lastFarrow ? U.diff(e.date, lastFarrow) : ''; lastWean = e.date; }
      else if (e.type === 'mate') {
        const same = prevMate && U.diff(e.date, prevMate) <= (S.store.settings.serviceGapDays || 3);
        if (!same) { interval = lastWean && (!lastSvc || lastSvc < lastWean) ? U.diff(e.date, lastWean) : lastSvc ? U.diff(e.date, lastSvc) : ''; lastSvc = e.date; }
        prevMate = e.date;
      } else if (['preg', 'heat', 'abort'].includes(e.type)) interval = lastSvc ? U.diff(e.date, lastSvc) : '';
      else if (['pigdeath', 'foster', 'partwean', 'nurse'].includes(e.type)) interval = lastFarrow ? U.diff(e.date, lastFarrow) : '';
      rows.push({ kind: 'event', ev: e, date: e.date, par, interval, event: (S.EVENTS[e.type] || {}).label || e.type, count: eventCount(e), remarks: [describe(e), e.remarks].filter(Boolean).join(' – ') });
    }
    return rows;
  }

  /* ================= event forms ================= */
  function boarOptions() {
    return S.store.animals().filter((b) => b.sex === 'M' && !A(b).removed).map((b) => b.id).sort(U.natCmp);
  }
  function datalist(id, values) { return h('datalist', { id }, values.map((v) => h('option', { value: v }))); }

  function defaultDate() { return S.store.settings.lastEntryDate && S.app.entryDateSticky ? S.store.settings.lastEntryDate : U.today(); }

  function eventForm(type, a, existing) {
    const L = S.store.settings.lists;
    const r = A(a);
    const e = existing || {};
    const date = ui().dateInput('f-date', e.date || defaultDate(), { max: U.today() });
    const remarks = ui().input('f-remarks', e.remarks || '', { maxlength: 120 });
    const rows = [ui().field('Date', date)];
    const get = {};
    const info = h('div.form-info');
    switch (type) {
      case 'heat': break;
      case 'mate': {
        const bo = boarOptions();
        rows.push(datalist('dl-boars', bo));
        rows.push(ui().field('Boar / semen', ui().input('f-boar', e.boar || '', { list: 'dl-boars', autocomplete: 'off' })));
        rows.push(ui().field('Method', ui().select('f-method', ['AI', 'Natural', 'AI + Natural'], e.method || 'AI')));
        rows.push(ui().field('Technician', ui().select('f-tech', L.technicians, e.tech || '')));
        if (!existing) {
          rows.push(ui().field('2nd mating (next day)', ui().input('f-boar2', '', { list: 'dl-boars', autocomplete: 'off', placeholder: 'boar – optional' })));
          rows.push(ui().field('3rd mating (day after)', ui().input('f-boar3', '', { list: 'dl-boars', autocomplete: 'off', placeholder: 'boar – optional' })));
        }
        const wsiInfo = () => { info.textContent = r.lastWeanDate && r.status === 'Open' ? `Weaned ${U.fmt(r.lastWeanDate)} → interval ${U.diff(date.value, r.lastWeanDate)} days` : r.status === 'Served' ? `Already served ${U.fmt(r.lastService && r.lastService.date)} – this is a repeat service` : ''; };
        date.addEventListener('change', wsiInfo); wsiInfo();
        Object.assign(get, { boar: () => U.$('#f-boar').value.trim(), method: () => U.$('#f-method').value, tech: () => U.$('#f-tech').value });
        break;
      }
      case 'preg':
        rows.push(ui().field('Result', ui().select('f-result', [['+', 'Positive (+)'], ['-', 'Negative (–)']], e.result || '+')));
        rows.push(ui().field('Method', ui().select('f-pmethod', ['Ultrasound', 'Doppler', 'Visual', 'Heat check'], e.method || 'Ultrasound')));
        Object.assign(get, { result: () => U.$('#f-result').value, method: () => U.$('#f-pmethod').value });
        if (r.lastService) { const upd = () => { info.textContent = `Days since service: ${U.diff(date.value, r.lastService.date)}`; }; date.addEventListener('change', upd); upd(); }
        break;
      case 'abort': break;
      case 'farrow': {
        rows.push(ui().field('Born alive', ui().input('f-lb', e.liveBorn ?? '', { type: 'number', min: 0, max: 40, inputmode: 'numeric' })));
        rows.push(ui().field('Stillborn', ui().input('f-sb', e.stillborn ?? 0, { type: 'number', min: 0, max: 30, inputmode: 'numeric' })));
        rows.push(ui().field('Mummies', ui().input('f-mm', e.mummies ?? 0, { type: 'number', min: 0, max: 30, inputmode: 'numeric' })));
        rows.push(ui().field('Litter birth weight (kg)', ui().input('f-bw', e.birthWeight ?? '', { type: 'number', step: '0.1', min: 0, inputmode: 'decimal' })));
        rows.push(ui().field('Farrowing location', ui().select('f-loc', [''].concat(L.locations), e.location || r.location || '')));
        rows.push(ui().field('Assisted farrowing', h('input', { id: 'f-assist', type: 'checkbox', checked: !!e.assisted })));
        Object.assign(get, {
          liveBorn: () => +U.$('#f-lb').value || 0, stillborn: () => +U.$('#f-sb').value || 0, mummies: () => +U.$('#f-mm').value || 0,
          birthWeight: () => (U.$('#f-bw').value ? +U.$('#f-bw').value : undefined), location: () => U.$('#f-loc').value, assisted: () => U.$('#f-assist').checked || undefined,
        });
        if (r.lastService) { const upd = () => { info.textContent = `Gestation length: ${U.diff(date.value, r.lastService.date)} days (served ${U.fmt(r.lastService.date)})`; }; date.addEventListener('change', upd); upd(); }
        break;
      }
      case 'pigdeath':
        rows.push(ui().field('Number of piglets', ui().input('f-count', e.count ?? 1, { type: 'number', min: 1, max: 30, inputmode: 'numeric' })));
        rows.push(ui().field('Cause', ui().select('f-cause', L.pigDeathCauses, e.cause || L.pigDeathCauses[0])));
        Object.assign(get, { count: () => +U.$('#f-count').value || 0, cause: () => U.$('#f-cause').value });
        info.textContent = r.lactating ? `Piglets on sow now: ${r.piglets}` : '';
        break;
      case 'foster': {
        const n = Number(e.count) || 1;
        rows.push(ui().field('Direction', ui().select('f-dir', [['on', 'Fostered ON to this sow'], ['off', 'Fostered OFF this sow']], n < 0 ? 'off' : 'on')));
        rows.push(ui().field('Number of piglets', ui().input('f-count', Math.abs(n), { type: 'number', min: 1, max: 30, inputmode: 'numeric' })));
        rows.push(ui().field('Other sow ID', ui().input('f-other', e.otherSow || '')));
        rows.push(ui().field('Also record on other sow', h('input', { id: 'f-mirror', type: 'checkbox', checked: !existing })));
        Object.assign(get, { count: () => (U.$('#f-dir').value === 'off' ? -1 : 1) * (+U.$('#f-count').value || 0), otherSow: () => U.$('#f-other').value.trim() });
        info.textContent = r.lactating ? `Piglets on sow now: ${r.piglets}` : '';
        break;
      }
      case 'nurse':
        rows.push(ui().field('Piglets put on', ui().input('f-count', e.count ?? 10, { type: 'number', min: 1, max: 30, inputmode: 'numeric' })));
        rows.push(ui().field('From sow ID', ui().input('f-other', e.otherSow || '')));
        Object.assign(get, { count: () => +U.$('#f-count').value || 0, otherSow: () => U.$('#f-other').value.trim() });
        break;
      case 'partwean': case 'wean':
        rows.push(ui().field('Pigs weaned', ui().input('f-count', e.count ?? (type === 'wean' ? Math.max(0, r.piglets) : ''), { type: 'number', min: 0, max: 40, inputmode: 'numeric' })));
        rows.push(ui().field('Total weight (kg)', ui().input('f-weight', e.weight ?? '', { type: 'number', step: '0.1', min: 0, inputmode: 'decimal' })));
        if (type === 'wean' && !existing) rows.push(ui().field('Move sow to', ui().select('f-loc', [''].concat(L.locations), L.locations.includes('Breeding') ? 'Breeding' : '')));
        Object.assign(get, { count: () => +U.$('#f-count').value || 0, weight: () => (U.$('#f-weight').value ? +U.$('#f-weight').value : undefined) });
        if (r.currentLitter) { const upd = () => { info.textContent = `Piglets on sow: ${r.piglets} · Lactation length: ${U.diff(date.value, r.currentLitter.farrowDate)} days`; }; date.addEventListener('change', upd); upd(); }
        break;
      case 'location':
        rows.push(ui().field('New location', ui().select('f-loc', L.locations, e.location || r.location)));
        get.location = () => U.$('#f-loc').value;
        info.textContent = r.location ? 'Current location: ' + r.location : '';
        break;
      case 'editid':
        rows.push(ui().field('Current ID', ui().input('f-old', e.oldId || r.currentId, { disabled: true })));
        rows.push(ui().field('New ID', ui().input('f-new', e.newId || '')));
        Object.assign(get, { oldId: () => U.$('#f-old').value, newId: () => U.$('#f-new').value.trim() });
        break;
      case 'disease':
        rows.push(datalist('dl-dis', L.diseases), datalist('dl-trt', L.treatments));
        rows.push(ui().field('Disease / problem', ui().input('f-dis', e.disease || '', { list: 'dl-dis' })));
        rows.push(ui().field('Treatment', ui().input('f-trt', e.treatment || '', { list: 'dl-trt' })));
        rows.push(ui().field('Dose', ui().input('f-dose', e.dose || '')));
        Object.assign(get, { disease: () => U.$('#f-dis').value.trim(), treatment: () => U.$('#f-trt').value.trim(), dose: () => U.$('#f-dose').value.trim() });
        break;
      case 'condition':
        rows.push(ui().field('Body condition (1-5)', ui().input('f-score', e.score ?? '', { type: 'number', min: 1, max: 5, step: '0.5' })));
        rows.push(ui().field('Backfat (mm)', ui().input('f-bf', e.backfat ?? '', { type: 'number', min: 0, max: 60 })));
        Object.assign(get, { score: () => U.$('#f-score').value || undefined, backfat: () => U.$('#f-bf').value || undefined });
        break;
      case 'vaccinate':
        rows.push(ui().field('Vaccine', ui().input('f-vac', e.vaccine || '')));
        get.vaccine = () => U.$('#f-vac').value.trim();
        break;
      case 'remove': {
        const kind = e.kind || 'cull';
        const reason = ui().select('f-reason', kind === 'death' ? L.deathReasons : L.cullReasons, e.reason);
        const kindSel = ui().select('f-kind', [['cull', 'Culled'], ['death', 'Died / euthanized'], ['sold', 'Sold for breeding']], kind, {
          onchange: (ev) => { const list = ev.target.value === 'death' ? L.deathReasons : L.cullReasons; reason.innerHTML = ''; list.forEach((x) => reason.appendChild(h('option', { value: x }, x))); },
        });
        rows.push(ui().field('Removal type', kindSel), ui().field('Reason', reason));
        Object.assign(get, { kind: () => U.$('#f-kind').value, reason: () => U.$('#f-reason').value });
        break;
      }
      default: break;
    }
    rows.push(ui().field('Remarks', remarks));
    const read = () => {
      const out = { type, date: date.value, remarks: remarks.value.trim() || undefined };
      for (const [k, f] of Object.entries(get)) { const v = f(); if (v !== undefined && v !== '') out[k] = v; }
      return out;
    };
    return { node: h('div.form', info, rows), read };
  }

  /** Validate an event against the animal. Returns {errors:[], warnings:[]} */
  function validate(a, ev, editingEid) {
    const errors = []; const warnings = [];
    const others = { ...a, events: (a.events || []).filter((x) => x.eid !== editingEid) };
    const r = S.model.analyze(others);
    // status as of event date
    const before = { ...a, events: others.events.filter((x) => x.date <= ev.date) };
    const rb = S.model.analyze(before);
    if (!ev.date) errors.push('Enter a date.');
    if (ev.date > U.today()) errors.push('The date is in the future.');
    if (a.birthDate && ev.date < a.birthDate) errors.push('The date is before the animal was born.');
    if (r.removed && r.removedDate < ev.date && ev.type !== 'remove') errors.push(`${a.id} was removed on ${U.fmt(r.removedDate)}.`);
    if (r.removed && ev.type === 'remove') errors.push(`${a.id} is already removed.`);
    const lastDate = others.events.length ? others.events.map((x) => x.date).sort().pop() : '';
    if (lastDate && ev.date < lastDate && !editingEid) warnings.push(`The last event for ${a.id} is on ${U.fmt(lastDate)}; this one is earlier.`);
    const s = rb.status;
    switch (ev.type) {
      case 'mate':
        if (a.sex === 'M') errors.push('Matings are recorded on the female.');
        if (s === 'Lactating') warnings.push('Sow is lactating. Saving will close the current litter as weaned.');
        if (!ev.boar) warnings.push('No boar or semen entered.');
        if (rb.ageDays !== null && a.birthDate && U.diff(ev.date, a.birthDate) < 170) warnings.push(`Gilt is only ${U.diff(ev.date, a.birthDate)} days old.`);
        break;
      case 'preg': case 'abort':
        if (s !== 'Served') warnings.push(`Status on this date is ${s}, not Served.`);
        break;
      case 'farrow': {
        if (a.sex === 'M') errors.push('Boars cannot farrow.');
        if (s !== 'Served') warnings.push(`Status on this date is ${s}, not Served. The litter will have no service record.`);
        if (rb.lastService && s === 'Served') {
          const g = U.diff(ev.date, rb.lastService.date);
          if (g < 105 || g > 125) warnings.push(`Gestation length would be ${g} days.`);
        }
        const tb = (ev.liveBorn || 0) + (ev.stillborn || 0) + (ev.mummies || 0);
        if (tb === 0) warnings.push('Total born is 0.');
        if (ev.liveBorn > 25) warnings.push(`${ev.liveBorn} born alive is unusually high.`);
        break;
      }
      case 'pigdeath': case 'foster': case 'partwean': case 'wean':
        if (s !== 'Lactating') errors.push(`${a.id} is not lactating on ${U.fmt(ev.date)} (status: ${s}).`);
        else if (ev.type === 'pigdeath' && ev.count > rb.piglets) warnings.push(`Only ${rb.piglets} piglets are on this sow.`);
        else if (ev.type === 'wean' && ev.count !== rb.piglets) warnings.push(`Piglets on sow by the records: ${rb.piglets}. Weaned: ${ev.count}. The difference will not be counted as deaths.`);
        if (ev.type === 'pigdeath' && !ev.count) errors.push('Enter the number of piglets.');
        break;
      case 'nurse':
        if (s !== 'Open' && s !== 'Lactating') errors.push('A nurse sow must be weaned or lactating.');
        break;
      case 'editid': {
        if (!ev.newId) errors.push('Enter the new ID.');
        const clash = S.store.findById(ev.newId);
        if (clash && clash.uid !== a.uid && !A(clash).removed) errors.push(`ID ${ev.newId} is already used by an active animal.`);
        break;
      }
      default: break;
    }
    return { errors, warnings };
  }

  async function saveEvent(a, ev, editingEid) {
    const v = validate(a, ev, editingEid);
    if (v.errors.length) { await ui().alertBox('Cannot save', v.errors.join('\n')); return false; }
    if (v.warnings.length) {
      const ok = await ui().confirmBox('Please check', v.warnings.join('\n') + '\n\nSave anyway?', 'Save anyway');
      if (!ok) return false;
    }
    let events = [...(a.events || [])];
    const maxSeq = events.reduce((m, x) => Math.max(m, x.seq || 0), 0);
    if (editingEid) events = events.map((x) => (x.eid === editingEid ? { ...x, ...ev, eid: x.eid, seq: x.seq } : x));
    else events.push({ ...ev, eid: U.uid('e'), seq: maxSeq + 1 });
    const extra = [];
    if (!editingEid && ev.type === 'mate') {
      const b2 = U.$('#f-boar2') && U.$('#f-boar2').value.trim();
      const b3 = U.$('#f-boar3') && U.$('#f-boar3').value.trim();
      if (b2) extra.push({ ...ev, boar: b2, date: U.addDays(ev.date, 1) });
      if (b3) extra.push({ ...ev, boar: b3, date: U.addDays(ev.date, 2) });
      extra.filter((x) => x.date <= U.today()).forEach((x, i) => events.push({ ...x, eid: U.uid('e'), seq: maxSeq + 2 + i }));
    }
    let updated = { ...a, events };
    if (ev.type === 'editid' && !editingEid) updated.id = ev.newId;
    if ((ev.type === 'location' || ev.type === 'farrow') && ev.location) updated.location = ev.location;
    if (ev.type === 'wean' && !editingEid) {
      const loc = U.$('#f-loc') && U.$('#f-loc').value;
      if (loc) { updated.events.push({ type: 'location', date: ev.date, location: loc, eid: U.uid('e'), seq: maxSeq + 5 }); updated.location = loc; }
    }
    await S.store.saveAnimal(updated);
    // mirror fostering on the other sow
    if (!editingEid && ev.type === 'foster' && ev.otherSow && U.$('#f-mirror') && U.$('#f-mirror').checked) {
      const o = S.store.findById(ev.otherSow);
      if (o && A(o).lactating) {
        const oseq = (o.events || []).reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1;
        await S.store.saveAnimal({ ...o, events: [...o.events, { type: 'foster', date: ev.date, count: -ev.count, otherSow: a.id, eid: U.uid('e'), seq: oseq }] });
      } else if (o) ui().toast(`Sow ${ev.otherSow} is not lactating; foster recorded on ${a.id} only.`, 'info');
      else ui().toast(`Sow ${ev.otherSow} not found; foster recorded on ${a.id} only.`, 'info');
    }
    S.store.settings.lastEntryDate = ev.date;
    S.store.log(`${editingEid ? 'Edited' : 'Entered'} ${S.EVENTS[ev.type].label} for ${updated.id} on ${U.fmt(ev.date)}`);
    ui().toast(`${S.EVENTS[ev.type].label} saved for ${updated.id}.`, 'ok');
    return updated;
  }

  function openEventDialog(type, a, existing, done) {
    const f = eventForm(type, a, existing);
    const r = A(a);
    const title = `${S.EVENTS[type].name}  –  ${a.id}  (${r.status}${r.parity ? ', parity ' + r.parity : ''})`;
    ui().modal({ title, body: f.node, width: 520, buttons: [
      { label: existing ? 'Save changes' : 'Save', primary: true, onClick: async () => { const res = await saveEvent(a, f.read(), existing && existing.eid); if (!res) return true; done && done(res); return false; } },
      { label: 'Cancel' },
    ] });
  }

  /* ================= animal entry / details ================= */
  function animalForm(a, isNew) {
    const L = S.store.settings.lists;
    const x = a || {};
    const node = h('div.form',
      ui().field('ID (ear tag)', ui().input('a-id', x.id || '', { maxlength: 20, disabled: !isNew })),
      ui().field('Type', ui().select('a-sex', [['F', 'Sow / gilt'], ['M', 'Boar']], x.sex || 'F', { disabled: !isNew && (x.events || []).length > 0 })),
      ui().field('Birth date', ui().dateInput('a-birth', x.birthDate, { max: U.today() })),
      ui().field('Arrival date', ui().dateInput('a-arr', x.arrivalDate || (isNew ? defaultDate() : ''), { max: U.today() })),
      ui().field('Herd entry date', ui().dateInput('a-entry', x.entryDate || (isNew ? defaultDate() : ''), { max: U.today() }), 'Counted as breeding animal from this date'),
      ui().field('Parity at entry', ui().input('a-par', x.entryParity || 0, { type: 'number', min: 0, max: 15 }), 'For purchased sows only'),
      ui().field('Breed / line', ui().select('a-breed', [''].concat(L.breeds), x.breed || '')),
      ui().field('Location', ui().select('a-loc', [''].concat(L.locations), x.location || '')),
      ui().field('Origin / supplier', ui().input('a-origin', x.origin || '')),
      ui().field('Dam / sire', ui().input('a-dam', x.pedigree || '', { placeholder: 'optional' })),
      ui().field('Remarks', ui().input('a-rem', x.remarks || '')));
    const read = () => ({
      id: U.$('#a-id').value.trim(), sex: U.$('#a-sex').value, birthDate: U.$('#a-birth').value || undefined,
      arrivalDate: U.$('#a-arr').value || undefined, entryDate: U.$('#a-entry').value || undefined,
      entryParity: +U.$('#a-par').value || 0, breed: U.$('#a-breed').value || undefined, location: U.$('#a-loc').value || undefined,
      origin: U.$('#a-origin').value.trim() || undefined, pedigree: U.$('#a-dam').value.trim() || undefined, remarks: U.$('#a-rem').value.trim() || undefined,
    });
    return { node, read };
  }

  function openEntryDialog(id, done) {
    const f = animalForm({ id }, true);
    ui().modal({ title: 'Entry – new animal', body: f.node, width: 520, buttons: [
      { label: 'Save', primary: true, onClick: async () => {
        const v = f.read();
        if (!v.id) { await ui().alertBox('Cannot save', 'Enter an ID.'); return true; }
        const clash = S.store.findById(v.id);
        if (clash && !A(clash).removed) { await ui().alertBox('Cannot save', `ID ${v.id} is already used by an active animal.`); return true; }
        if (!v.arrivalDate && !v.entryDate) { await ui().alertBox('Cannot save', 'Enter an arrival or herd entry date.'); return true; }
        if (v.birthDate && v.arrivalDate && v.arrivalDate < v.birthDate) { await ui().alertBox('Cannot save', 'Arrival is before birth.'); return true; }
        const a = await S.store.saveAnimal({ uid: U.uid(v.sex === 'M' ? 'b' : 's'), ...v, events: [] });
        S.store.log(`Entered new ${v.sex === 'M' ? 'boar' : 'female'} ${v.id}`);
        ui().toast(`${v.id} entered.`, 'ok');
        done && done(a);
        return false;
      } },
      { label: 'Cancel' },
    ] });
  }

  function openDetails(a, done) {
    const f = animalForm(a, false);
    const r = A(a);
    const lt = lifetime(a);
    const summary = h('div.details-sum',
      h('div', h('b', 'Status: '), r.status, r.statusDate ? ' since ' + U.fmt(r.statusDate) : ''),
      h('div', h('b', 'Parity: '), r.parity, '   ', h('b', 'Location: '), r.location || '–'),
      h('div', h('b', 'Age: '), r.ageDays !== null ? r.ageDays + ' days' : '–'),
      a.sex === 'F' ? h('div', h('b', 'Lifetime: '), `${lt.litters} litters · ${lt.ba} born alive · ${lt.weaned} weaned · ${U.num(lt.ba / (lt.litters || 1), 1)} BA/litter`) : null);
    ui().modal({ title: 'Details – ' + a.id, body: h('div', summary, f.node), width: 560, buttons: [
      { label: 'Save', primary: true, onClick: async () => {
        const v = f.read();
        delete v.id;
        if (a.sex !== 'M' || !(a.events || []).length) { /* sex editable only when no events */ } else delete v.sex;
        const upd = await S.store.saveAnimal({ ...a, ...v });
        done && done(upd);
      } },
      { label: 'Delete animal…', right: true, onClick: async () => {
        const ok = await ui().confirmBox('Delete animal', `Delete ${a.id} and its whole history? This cannot be undone. To take an animal out of the herd, use Remove instead.`, 'Delete');
        if (!ok) return true;
        await S.store.deleteAnimal(a.uid);
        S.store.log(`Deleted animal ${a.id}`);
        done && done(null);
      } },
      { label: 'Cancel' },
    ] });
  }

  function lifetime(a) {
    const r = A(a);
    return {
      litters: r.litters.length, tb: U.sum(r.litters.map((l) => l.totalBorn)), ba: U.sum(r.litters.map((l) => l.liveBorn)),
      weaned: U.sum(r.litters.map((l) => l.weaned)), deaths: U.sum(r.litters.map((l) => l.deaths)),
    };
  }

  function ltSummaryRows(a) {
    const r = A(a);
    return r.litters.map((l) => ({
      par: l.parity, svc: l.serviceDate, boar: l.boar, farrow: l.farrowDate, gest: l.gestLen, tb: l.totalBorn, ba: l.liveBorn, sb: l.stillborn, mm: l.mummies,
      dead: l.deaths, fost: l.fosterIn - l.fosterOut, weaned: l.weanDate ? l.weaned : '', wean: l.weanDate || '', lact: l.lactLen ?? '',
      svcs: r.services.filter((s) => s.parity === l.parity - 1).length,
    }));
  }

  /* ================= the window ================= */
  function open() {
    const st = { tab: 'mate', list: 'Current', sel: null, histSel: null, lt: false, search: null };
    const win = ui().appWindow({ title: 'Sow data entry', cls: 'entry-win', toolbar: [] });
    win.querySelector('.toolbar').remove();
    const listTabs = ['Served', 'Lactating', 'Open', 'Active', 'Removed', 'All', 'Current'];
    const statusCls = (r) => (r.removed ? 'st-removed' : 'st-' + r.status.toLowerCase());

    const listCols = [
      { label: 'ID', value: (a) => a.id, sort: (a) => a.id },
      { label: 'Par', num: true, value: (a) => (a.sex === 'M' ? '' : A(a).parity), sort: (a) => A(a).parity },
      { label: 'Status', value: (a) => A(a).status },
      { label: 'Date', value: (a) => U.fmt(A(a).statusDate), sort: (a) => A(a).statusDate },
      { label: 'Days', num: true, value: (a) => A(a).daysInStatus ?? '' },
      { label: 'Location', value: (a) => A(a).location || '' },
      { label: 'Arrival date', value: (a) => U.fmt(a.arrivalDate), sort: (a) => a.arrivalDate || '' },
      { label: 'Birth date', value: (a) => U.fmt(a.birthDate), sort: (a) => a.birthDate || '' },
    ];
    const list = ui().grid({ columns: listCols, rows: [], cls: 'list-grid', rowKey: (a) => a.uid, rowClass: (a) => statusCls(A(a)), onRowClick: (a) => select(a, true), onRowDblClick: (a) => { select(a, true); enter(); }, emptyText: 'No animals in this list' });
    const listTabBar = h('div.subtabs', listTabs.map((t) => h('button.subtab', { type: 'button', 'data-t': t, onclick: () => { st.list = t; st.search = null; refreshList(); } }, t)));
    const count = h('span.list-count');
    listTabBar.appendChild(count);

    const idInput = h('input#entry-id', { autocomplete: 'off', spellcheck: 'false', placeholder: 'Type ID and press Enter', 'aria-label': 'Animal ID' });
    idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); goId(); } });
    const idPanel = h('div.id-panel',
      h('div.id-label', 'ID'), idInput,
      h('div.id-btns',
        h('button.ibtn', { type: 'button', onclick: findDialog }, ui().icon('find'), 'Find...'),
        h('button.ibtn', { type: 'button', onclick: () => st.sel ? openDetails(st.sel, (u) => { st.sel = u; refresh(); }) : ui().toast('Select an animal first.') }, ui().icon('details'), 'Details...'),
        h('button.ibtn.right', { type: 'button', onclick: searchDialog }, ui().icon('tools'), 'Search for')));

    const tb = h('div.toolbar.entry-tb',
      tbBtn('enter', 'Enter', enter), tbBtn('edit', 'Edit', editSel), tbBtn('del', 'Delete', delSel), h('span.tb-sep'),
      tbBtn('settings', 'Settings', () => S.settingsUI.open('entry')), tbBtn('help', 'Help', () => S.app.help('entry')), h('span.tb-sep'),
      tbBtn('close', 'Close', () => S.app.home()));
    function tbBtn(ic, label, fn) { return h('button.tb-btn', { type: 'button', onclick: fn }, ui().icon(ic), h('span', label)); }

    const histTitle = h('span', 'History for animal:');
    const ltBox = h('input#lt-sum', { type: 'checkbox', onchange: (e) => { st.lt = e.target.checked; renderHistory(); } });
    const histHead = h('div.hist-head', histTitle, h('label.lt', ltBox, ' L T Summary'));
    const histHost = h('div.hist-host');
    const evTabs = h('div.evtabs', TAB_ORDER.map((t) => h('button.evtab', { type: 'button', 'data-t': t, onclick: () => { st.tab = t; renderTabs(); if (st.list === 'Current') refreshList(); idInput.focus(); } }, TAB_LABEL[t])));

    const left = h('div.entry-left', h('div.list-box', list, listTabBar), idPanel, tb, histHead, histHost, evTabs);
    const right = h('aside.entry-right',
      h('h3', 'Data validation'),
      ...[['Arrival', 'arrival'], ['Culling', 'cull'], ['Death', 'death'], ['Matings', 'mate'], ['Heat check', 'heat'], ['Pregnancy check', 'preg'], ['Abortion', 'abort'], ['Farrowing', 'farrow'], ['Piglet death', 'pigdeath'], ['Foster / Nurse', 'foster'], ['Weaning', 'wean'], ['Quick check entry', 'all']]
        .map(([l, k]) => h('button.vbtn', { type: 'button', onclick: () => validationList(k, l) }, l)),
      h('div.vgap'),
      ...[['Disease / treatment', 'disease'], ['Backfat', 'backfat'], ['Condition', 'condition']].map(([l, k]) => h('button.vbtn', { type: 'button', onclick: () => k === 'disease' ? validationList(k, l) : conditionEntry() }, l)),
      h('h3', 'Inventory'),
      h('div.inv-row', ...['Gilts', 'Open', 'Served', 'Lactating'].map((s) => h('button.vbtn', { type: 'button', onclick: () => inventoryList(s) }, s))),
      h('button.vbtn', { type: 'button', onclick: () => inventoryList('All sows') }, 'All sows'),
      h('button.vbtn', { type: 'button', onclick: pigletInventory }, 'Ending inventory piglets'),
      h('button.vbtn', { type: 'button', onclick: () => S.reports.populationDynamics() }, 'Population dynamics'));
    win.appendChild(h('div.entry-body', left, right));

    function renderTabs() {
      U.$$('.evtab', evTabs).forEach((b) => b.classList.toggle('active', b.dataset.t === st.tab));
      U.$$('.subtab', listTabBar).forEach((b) => b.classList.toggle('active', b.dataset.t === st.list && !st.search));
    }
    function listRows() {
      const all = S.store.animals();
      if (st.search) return all.filter(st.search.pred);
      switch (st.list) {
        case 'Served': return all.filter((a) => A(a).status === 'Served');
        case 'Lactating': return all.filter((a) => A(a).status === 'Lactating');
        case 'Open': return all.filter((a) => ['Open', 'Gilt'].includes(A(a).status));
        case 'Active': return all.filter((a) => !A(a).removed);
        case 'Removed': return all.filter((a) => A(a).removed);
        case 'All': return all;
        default: {
          if (st.tab === 'entry') return all.filter((a) => a.arrivalDate && U.diff(U.today(), a.arrivalDate) <= 60).sort((x, y) => (y.arrivalDate > x.arrivalDate ? 1 : -1));
          const f = ELIGIBLE[st.tab];
          return all.filter((a) => a.sex !== 'M' || ['location', 'editid', 'disease', 'remove'].includes(st.tab)).filter((a) => f(A(a)));
        }
      }
    }
    function refreshList() {
      const rows = listRows().sort((x, y) => (A(y).statusDate || '').localeCompare(A(x).statusDate || '') || U.natCmp(x.id, y.id));
      list.update(rows, st.sel && st.sel.uid);
      count.textContent = `${rows.length} animals` + (st.search ? ' · ' + st.search.label : '');
      win.querySelector('.win-name').textContent = `Sow data entry  (${S.store.animals().filter((a) => !A(a).removed).length} animals active)  -  [${S.store.settings.farmNumber} ${S.store.settings.farmName}]`;
      renderTabs();
    }
    function select(a, fromList) {
      st.sel = a; st.histSel = null;
      if (a) idInput.value = a.id;
      renderHistory();
      if (!fromList) refreshList();
    }
    function renderHistory() {
      histHost.innerHTML = '';
      const a = st.sel;
      if (!a) { histTitle.textContent = 'History for animal:'; histHost.appendChild(h('p.hint', 'Type an ID above and press Enter, or pick an animal from the list. The event tab at the bottom (red) decides what Enter records.')); return; }
      const r = A(a);
      histTitle.innerHTML = '';
      histTitle.append('History for animal:  ', h('b', a.id), h('span.hist-status', `  ${r.status}${a.sex === 'F' ? ' · parity ' + r.parity : ''}${r.lactating ? ' · ' + r.piglets + ' piglets' : ''}${r.location ? ' · ' + r.location : ''}`));
      if (st.lt && a.sex === 'F') {
        const g = ui().grid({ cls: 'hist-grid', rows: ltSummaryRows(a), emptyText: 'No litters yet', columns: [
          { label: 'Par', num: true, value: (x) => x.par }, { label: 'Svcs', num: true, value: (x) => x.svcs }, { label: 'Service', value: (x) => U.fmt(x.svc) }, { label: 'Boar', value: (x) => x.boar },
          { label: 'Farrowed', value: (x) => U.fmt(x.farrow) }, { label: 'Gest', num: true, value: (x) => x.gest ?? '' }, { label: 'TB', num: true, value: (x) => x.tb }, { label: 'BA', num: true, value: (x) => x.ba },
          { label: 'SB', num: true, value: (x) => x.sb }, { label: 'MM', num: true, value: (x) => x.mm }, { label: 'Dead', num: true, value: (x) => x.dead }, { label: 'Fost', num: true, value: (x) => x.fost },
          { label: 'Weaned', num: true, value: (x) => x.weaned }, { label: 'Wean date', value: (x) => U.fmt(x.wean) }, { label: 'Lact', num: true, value: (x) => x.lact },
        ] });
        const lt = lifetime(a);
        histHost.append(g, h('div.lt-total', `Lifetime: ${lt.litters} litters · TB ${lt.tb} · BA ${lt.ba} (${U.num(lt.ba / (lt.litters || 1))}/litter) · weaned ${lt.weaned} (${U.num(lt.weaned / (lt.litters || 1))}/litter)`));
        return;
      }
      const rows = historyRows(a);
      const g = ui().grid({
        cls: 'hist-grid', rows, rowKey: (x, i) => (x.ev ? x.ev.eid : 'a' + i), selectedKey: st.histSel && st.histSel.eid,
        onRowClick: (x) => { st.histSel = x.ev || null; }, onRowDblClick: (x) => { st.histSel = x.ev || null; editSel(); },
        columns: [
          { label: 'Par', num: true, value: (x) => x.par }, { label: 'Date', value: (x) => U.fmt(x.date), sort: (x) => x.date },
          { label: 'Interval', num: true, value: (x) => x.interval }, { label: 'Event', value: (x) => x.event }, { label: '#', num: true, value: (x) => x.count ?? '' },
          { label: 'Remarks', value: (x) => x.remarks },
        ],
      });
      histHost.appendChild(g);
      const scroller = g; requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
    }
    function goId() {
      const id = idInput.value.trim();
      if (!id) return;
      const a = S.store.findById(id);
      if (!a) {
        if (st.tab === 'entry') { openEntryDialog(id, (n) => { select(n); }); return; }
        ui().confirmBox('Animal not found', `There is no animal with ID ${id}. Enter it as a new animal?`, 'Enter new animal').then((ok) => { if (ok) openEntryDialog(id, (n) => select(n)); });
        return;
      }
      select(a);
      if (st.tab === 'entry') { ui().toast(`${a.id} already exists – showing its history.`); return; }
      enter();
    }
    function enter() {
      if (st.tab === 'entry') { openEntryDialog(idInput.value.trim() && !S.store.findById(idInput.value.trim()) ? idInput.value.trim() : '', (n) => select(n)); return; }
      const a = st.sel;
      if (!a) { ui().toast('Type an ID and press Enter, or pick an animal in the list.'); idInput.focus(); return; }
      openEventDialog(st.tab, S.store.get(a.uid) || a, null, (u) => { select(u); idInput.focus(); idInput.select(); });
    }
    function editSel() {
      const a = st.sel;
      if (!a) return ui().toast('Select an animal first.');
      if (!st.histSel) return openDetails(a, (u) => { st.sel = u; refresh(); });
      openEventDialog(st.histSel.type, S.store.get(a.uid) || a, st.histSel, (u) => select(u));
    }
    async function delSel() {
      const a = st.sel;
      if (!a) return ui().toast('Select an animal first.');
      if (!st.histSel) return ui().toast('Select an event in the history to delete it.');
      const e = st.histSel;
      const ok = await ui().confirmBox('Delete event', `Delete ${S.EVENTS[e.type].label} of ${U.fmt(e.date)} for ${a.id}?`, 'Delete');
      if (!ok) return;
      const cur = S.store.get(a.uid) || a;
      let upd = { ...cur, events: cur.events.filter((x) => x.eid !== e.eid) };
      if (e.type === 'editid' && e.oldId) upd.id = e.oldId;
      upd = await S.store.saveAnimal(upd);
      S.store.log(`Deleted ${S.EVENTS[e.type].label} of ${U.fmt(e.date)} for ${a.id}`);
      select(upd);
    }
    function findDialog() {
      const q = ui().input('find-q', idInput.value, { placeholder: 'Part of an ID' });
      const res = h('div');
      const run = () => {
        const t = q.value.trim().toLowerCase();
        const hits = S.store.animals().filter((a) => !t || String(a.id).toLowerCase().includes(t) || (a.events || []).some((e) => e.type === 'editid' && String(e.oldId).toLowerCase().includes(t)));
        res.innerHTML = '';
        res.appendChild(ui().grid({ rows: hits, cls: 'find-grid', columns: listCols.slice(0, 6), onRowDblClick: (a) => { m.close(); select(a); }, onRowClick: (a) => { picked = a; } }));
      };
      let picked = null;
      q.addEventListener('input', run);
      const m = ui().modal({ title: 'Find animal', body: h('div', ui().field('ID contains', q), res), width: 640, buttons: [
        { label: 'Select', primary: true, onClick: () => { if (picked) select(picked); else { const hits = U.$$('.find-grid tbody tr'); if (hits.length === 1) hits[0].dispatchEvent(new Event('dblclick')); } } },
        { label: 'Cancel' },
      ] });
      run();
    }
    function searchDialog() {
      const L = S.store.settings.lists;
      const body = h('div.form',
        ui().field('Status', ui().select('s-status', ['', 'Gilt', 'Open', 'Served', 'Lactating', 'Boar', 'Culled', 'Dead', 'Sold'], '')),
        ui().field('Location', ui().select('s-loc', [''].concat(L.locations), '')),
        ui().field('Parity', ui().input('s-par', '', { placeholder: 'e.g. 1, 2-5, 6+' })),
        ui().field('Days in status ≥', ui().input('s-days', '', { type: 'number', min: 0 })),
        ui().field('Breed', ui().select('s-breed', [''].concat(L.breeds), '')),
        ui().field('Remarks contain', ui().input('s-rem', '')));
      ui().modal({ title: 'Search for animals', body, width: 480, buttons: [
        { label: 'Search', primary: true, onClick: () => {
          const s = U.$('#s-status').value; const loc = U.$('#s-loc').value; const pp = U.parityFilter(U.$('#s-par').value);
          const days = U.$('#s-days').value; const breed = U.$('#s-breed').value; const rem = U.$('#s-rem').value.trim().toLowerCase();
          st.search = { label: 'search result', pred: (a) => { const r = A(a); return (!s || r.status === s) && (!loc || r.location === loc) && (a.sex === 'M' ? !U.$('#s-par').value : pp(r.parity)) && (!days || (r.daysInStatus ?? -1) >= +days) && (!breed || a.breed === breed) && (!rem || (a.remarks || '').toLowerCase().includes(rem) || r.events.some((e) => (e.remarks || '').toLowerCase().includes(rem))); } };
          refreshList();
        } },
        { label: 'Clear', onClick: () => { st.search = null; refreshList(); } },
        { label: 'Cancel' },
      ] });
    }
    function conditionEntry() {
      if (!st.sel) { ui().toast('Pick an animal first, then press Condition or Backfat.'); return; }
      openEventDialog('condition', S.store.get(st.sel.uid), null, (u) => select(u));
    }

    /* validation lists (right panel) */
    function validationList(kind, label) {
      const b = ui().dateInput('v-b', U.addDays(U.today(), -7)); const e = ui().dateInput('v-e', U.today());
      const host = h('div');
      const run = () => {
        const rows = [];
        for (const a of S.store.animals()) {
          const r = A(a);
          if (kind === 'arrival') { if (U.inRange(a.arrivalDate, b.value, e.value)) rows.push({ a, date: a.arrivalDate, ev: 'Arrival', n: '', rem: [a.sex === 'M' ? 'Boar' : 'Female', a.breed, a.origin].filter(Boolean).join(' · ') }); continue; }
          let par = Number(a.entryParity) || 0;
          for (const ev of r.events) {
            if (ev.type === 'farrow') par++;
            if (!U.inRange(ev.date, b.value, e.value)) continue;
            const t = ev.type;
            const ok = kind === 'all' || t === kind || (kind === 'cull' && t === 'remove' && ev.kind !== 'death') || (kind === 'death' && t === 'remove' && ev.kind === 'death') || (kind === 'foster' && (t === 'foster' || t === 'nurse')) || (kind === 'wean' && t === 'partwean');
            if (ok) rows.push({ a, date: ev.date, ev: S.EVENTS[t].label, n: eventCount(ev) ?? '', rem: [describe(ev), ev.remarks].filter(Boolean).join(' – '), par });
          }
        }
        rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : U.natCmp(x.a.id, y.a.id)));
        host.innerHTML = '';
        const total = U.sum(rows.map((x) => x.n));
        host.append(h('div.vsum', `${rows.length} records` + (total ? ` · total # ${total}` : '')),
          ui().grid({ rows, cls: 'v-grid', columns: [
            { label: 'ID', value: (x) => x.a.id }, { label: 'Par', num: true, value: (x) => x.par ?? '' }, { label: 'Date', value: (x) => U.fmt(x.date), sort: (x) => x.date },
            { label: 'Event', value: (x) => x.ev }, { label: '#', num: true, value: (x) => x.n }, { label: 'Remarks', value: (x) => x.rem },
          ], onRowDblClick: (x) => { m.close(); select(S.store.get(x.a.uid)); } }));
      };
      b.addEventListener('change', run); e.addEventListener('change', run);
      const m = ui().modal({ title: 'Data validation – ' + label, body: h('div', h('div.range', ui().field('From', b), ui().field('to', e)), host), width: 820, buttons: [
        { label: 'Export CSV', onClick: () => { const g = host.querySelector('.grid-wrap'); ui().saveFile(`validation-${kind}.csv`, g.toCSV(), 'text/csv'); return true; } },
        { label: 'Close', primary: true },
      ] });
      run();
    }
    function inventoryList(which) {
      const all = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed);
      const rows = which === 'All sows' ? all : all.filter((a) => A(a).status === (which === 'Gilts' ? 'Gilt' : which));
      const byPar = {};
      rows.forEach((a) => { const p = A(a).parity; byPar[p] = (byPar[p] || 0) + 1; });
      const parTbl = h('table.mini', h('tr', h('th', 'Parity'), Object.keys(byPar).map((p) => h('th', p)), h('th', 'Total')), h('tr', h('td', 'Females'), Object.values(byPar).map((n) => h('td', n)), h('td', h('b', rows.length))));
      const m = ui().modal({ title: `Inventory – ${which}`, width: 760, body: h('div', parTbl, ui().grid({ rows, columns: listCols, onRowDblClick: (a) => { m.close(); select(a); } })), buttons: [{ label: 'Close', primary: true }] });
    }
    function pigletInventory() {
      const rows = S.store.animals().filter((a) => A(a).lactating);
      const total = U.sum(rows.map((a) => A(a).piglets));
      ui().modal({ title: 'Ending inventory piglets', width: 700, body: h('div', h('div.vsum', `${rows.length} lactating sows · ${total} piglets on hand · ${U.num(total / (rows.length || 1))} per sow`),
        ui().grid({ rows, columns: [
          { label: 'Sow', value: (a) => a.id }, { label: 'Par', num: true, value: (a) => A(a).parity }, { label: 'Farrowed', value: (a) => U.fmt(A(a).currentLitter.farrowDate), sort: (a) => A(a).currentLitter.farrowDate },
          { label: 'Age (d)', num: true, value: (a) => U.diff(U.today(), A(a).currentLitter.farrowDate) }, { label: 'Born alive', num: true, value: (a) => A(a).currentLitter.liveBorn },
          { label: 'Piglets now', num: true, value: (a) => A(a).piglets }, { label: 'Location', value: (a) => A(a).location },
        ] })), buttons: [{ label: 'Close', primary: true }] });
    }

    function refresh() {
      if (st.sel) st.sel = S.store.get(st.sel.uid) || null;
      refreshList();
      renderHistory();
    }
    win.refresh = refresh;
    win.selectAnimal = (a) => select(S.store.get(a.uid) || a);
    refresh();
    setTimeout(() => idInput.focus(), 50);
    return win;
  }

  S.entry = { open, describe, historyRows, ltSummaryRows, lifetime, openEventDialog, openEntryDialog, TAB_ORDER };
})(window.SOS);
