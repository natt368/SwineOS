/* SwineOS – Sow data entry window. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;
  const A = (a) => S.model.analyze(a);

  const TAB_ORDER = ['entry', 'heat', 'mate', 'preg', 'abort', 'farrow', 'pigdeath', 'foster', 'partwean', 'wean', 'nurse', 'location', 'editid', 'disease', 'remove'];
  const GILT_TABS = ['entry', 'vboar', 'synch', 'heat', 'mate', 'preg', 'location', 'editid', 'disease', 'remove'];
  const TAB_LABEL = { vboar: 'V-boar', synch: 'Synchronise', entry: 'Entry', heat: 'Heat', mate: 'Mate', preg: 'ReproChk', abort: 'Abort', farrow: 'Farrow', pigdeath: 'PigDth', foster: 'Foster', partwean: 'PartWean', wean: 'Wean', nurse: 'Nurse', location: 'Location', editid: 'Edit ID', disease: 'Disease', remove: 'Remove' };
  const ELIGIBLE = {
    entry: () => false,
    heat: (r) => ['Gilt', 'Open', 'Served'].includes(r.status),
    vboar: (r) => r.status === 'Gilt',
    synch: (r) => ['Gilt', 'Open'].includes(r.status),
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
      case 'vboar': return 'Boar exposure' + (e.boar ? ' – ' + e.boar : '');
      case 'synch': return [e.product, e.days ? e.days + ' days' : ''].filter(Boolean).join(' · ');
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
        const same = prevMate && lastSvc && U.diff(e.date, lastSvc) <= (S.store.settings.serviceWindowDays || 6);
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
    return S.store.animals().filter((b) => b.sex === 'M' && !A(b).removed && !b.blocked).map((b) => b.id).sort(U.natCmp);
  }
  function datalist(id, values) { return h('datalist', { id }, values.map((v) => h('option', { value: v }))); }

  function defaultDate() { return S.store.settings.lastEntryDate && S.app.entryDateSticky ? S.store.settings.lastEntryDate : U.today(); }

  function eventForm(type, a, existing) {
    const L = S.store.settings.lists;
    const r = A(a);
    const e = existing || {};
    const date = ui().dateInput('f-date', e.date || defaultDate(), { max: maxDate(type) });
    const remarks = ui().input('f-remarks', e.remarks || '', { maxlength: 120 });
    const rows = [ui().field('Date', date)];
    const get = {};
    const info = h('div.form-info');
    switch (type) {
      case 'heat': break;
      case 'vboar': {
        rows.push(datalist('dl-boars', boarOptions()));
        rows.push(ui().field('Teaser / V-boar', ui().input('f-boar', e.boar || '', { list: 'dl-boars', autocomplete: 'off' })));
        get.boar = () => U.$('#f-boar').value.trim();
        break;
      }
      case 'synch':
        rows.push(datalist('dl-synch', ['Regumate (altrenogest)', 'Matrix (altrenogest)', 'PG600', 'Lutalyse']));
        rows.push(ui().field('Product', ui().input('f-prod', e.product || 'Regumate (altrenogest)', { list: 'dl-synch' })));
        rows.push(ui().field('Number of days', ui().input('f-days', e.days ?? 14, { type: 'number', min: 1, max: 30 })));
        Object.assign(get, { product: () => U.$('#f-prod').value.trim(), days: () => +U.$('#f-days').value || undefined });
        break;
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

  // weaning is often entered before the pigs leave: it may be dated ahead (days)
  const FUTURE_OK = { wean: 30, partwean: 30 };
  function maxDate(type) { return U.addDays(U.today(), FUTURE_OK[type] || 0); }

  /** Validate an event against the animal. Returns {errors:[], warnings:[]} */
  function validate(a, ev, editingEid) {
    const errors = []; const warnings = [];
    const others = { ...a, events: (a.events || []).filter((x) => x.eid !== editingEid) };
    const r = S.model.analyze(others);
    // status as of event date
    const before = { ...a, events: others.events.filter((x) => x.date <= ev.date) };
    const rb = S.model.analyze(before);
    if (!ev.date) errors.push('Enter a date.');
    if (ev.date > maxDate(ev.type)) errors.push(FUTURE_OK[ev.type] ? `${(S.EVENTS[ev.type] || {}).label || 'This event'} can be dated at most ${FUTURE_OK[ev.type]} days ahead.` : 'The date is in the future.');
    if (a.birthDate && ev.date < a.birthDate) errors.push('The date is before the animal was born.');
    if (r.removed && r.removedDate < ev.date && ev.type !== 'remove') errors.push(`${a.id} was removed on ${U.fmt(r.removedDate)}.`);
    if (r.removed && ev.type === 'remove') errors.push(`${a.id} is already removed.`);
    const lastDate = others.events.length ? others.events.map((x) => x.date).sort().pop() : '';
    if (lastDate && ev.date < lastDate && !editingEid) warnings.push(`The last event for ${a.id} is on ${U.fmt(lastDate)}; this one is earlier.`);
    const s = rb.status;
    // Duplicates: the same kind of event cannot be recorded again sooner than is possible.
    // Delete the earlier event first if it was entered by mistake.
    const gestL = S.store.settings.gestationLength || 115;
    const label = (t) => ((S.EVENTS[t] || {}).label || t).toLowerCase();
    const orig = editingEid ? (a.events || []).find((x) => x.eid === editingEid) : null;
    const MIN_DAYS = { farrow: gestL, mate: S.store.settings.minRepeatServiceDays || 17, preg: 7, abort: 30, heat: 1, vboar: 1, synch: 1 };
    if (MIN_DAYS[ev.type]) {
      const win = S.store.settings.serviceWindowDays || 6;
      const clash = others.events.find((x) => x.type === ev.type && Math.abs(U.diff(ev.date, x.date)) < MIN_DAYS[ev.type]
        // editing one mating of a multi-mating service: its partners in the same service are fine
        && !(ev.type === 'mate' && orig && Math.abs(U.diff(x.date, orig.date)) <= win));
      if (clash) {
        const d = Math.abs(U.diff(ev.date, clash.date));
        errors.push(`${a.id} already has a ${label(ev.type)} on ${U.fmt(clash.date)}${d ? ` (${d} day${d === 1 ? '' : 's'} apart)` : ' (the same day)'}. `
          + (ev.type === 'farrow' ? `Farrowings must be at least one gestation length (${gestL} days) apart.`
            : ev.type === 'mate' ? `A repeat service must be at least ${MIN_DAYS.mate} days later. For several matings in one heat, use the 2nd / 3rd mating boxes when entering the first mating.`
              : MIN_DAYS[ev.type] > 1 ? `They must be at least ${MIN_DAYS[ev.type]} days apart.` : 'Only one per day.')
          + ' If the earlier one is wrong, delete it first.');
      }
    } else if (!['location', 'editid', 'remove'].includes(ev.type)) {
      // same event with the same details on the same day: probably entered twice
      const same = others.events.find((x) => x.type === ev.type && x.date === ev.date && ['count', 'cause', 'otherSow', 'disease', 'treatment', 'vaccine', 'score', 'backfat'].every((k) => String(x[k] ?? '') === String(ev[k] ?? '')));
      if (same) warnings.push(`This ${label(ev.type)} (${U.fmt(ev.date)}${ev.count ? ', ' + ev.count : ''}) is already recorded for ${a.id}. Is it a second one?`);
    }
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
          if (g < gestL - 15) errors.push(`${a.id} was served on ${U.fmt(rb.lastService.date)}: a farrowing ${g} days later is not possible (gestation is about ${gestL} days). Check the date or the sow ID.`);
          else if (g < 105 || g > 125) warnings.push(`Gestation length would be ${g} days.`);
        }
        const tb = (ev.liveBorn || 0) + (ev.stillborn || 0) + (ev.mummies || 0);
        if (tb === 0) warnings.push('Total born is 0.');
        if (ev.liveBorn > 25) warnings.push(`${ev.liveBorn} born alive is unusually high.`);
        break;
      }
      case 'pigdeath': case 'foster': case 'partwean': case 'wean':
        if (s !== 'Lactating') errors.push(`${a.id} is not lactating on ${U.fmt(ev.date)} (status: ${s}).`);
        else if (ev.type === 'pigdeath' && ev.count > rb.piglets) warnings.push(`Only ${rb.piglets} piglets are on this sow.`);
        else if (ev.type === 'wean' && ev.count !== rb.piglets) warnings.push(`Piglets on sow by the records: ${rb.piglets}. Weaned: ${ev.count}. The difference will be counted as piglet deaths (not recorded).`);
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

  /** Add several events to one animal without dialogs. Returns { animal, errors, warnings }. */
  async function addEvents(a, evs) {
    let cur = S.store.get(a.uid) || a;
    let seq = (cur.events || []).reduce((m, x) => Math.max(m, x.seq || 0), 0);
    const warnings = [];
    for (const ev of evs) {
      const v = validate(cur, ev);
      if (v.errors.length) return { animal: null, errors: v.errors, warnings };
      warnings.push(...v.warnings);
      cur = { ...cur, events: [...cur.events, { ...ev, eid: U.uid('e'), seq: ++seq }] };
      if ((ev.type === 'location' || ev.type === 'farrow') && ev.location) cur.location = ev.location;
      if (ev.type === 'editid') cur.id = ev.newId;
    }
    const saved = await S.store.saveAnimal(cur);
    S.store.log(`Action list entry: ${evs.map((e) => S.EVENTS[e.type].label).join(', ')} for ${saved.id}`);
    return { animal: saved, errors: [], warnings };
  }

  /** Values a "Save & next" carries to the next animal: date, the choice lists and the boar (numbers and remarks start empty). */
  function carryOf(host) {
    const c = {};
    host.querySelectorAll('input[id], select[id]').forEach((el) => {
      if (el.classList.contains('dt-native') || el.id === 'f-animal' || el.id === 'a-id') return;
      if (el.tagName === 'SELECT' || el.classList.contains('dt') || ['f-boar', 'a-origin', 'a-line'].includes(el.id)) c[el.id] = el.value;
    });
    return c;
  }
  function applyCarry(host, c) {
    for (const [id, v] of Object.entries(c || {})) {
      const el = host.querySelector('#' + CSS.escape(id));
      if (el && v !== undefined && v !== '' && !el.disabled) { el.value = v; el.dispatchEvent(new Event('change')); }
    }
  }

  /**
   * Event dialog. New events have an Animal ID box at the top (another ID switches the animal) and a "Save & next"
   * button: it saves, then opens the dialog again for the next animal with the date, boar and choices kept.
   */
  function openEventDialog(type, a, existing, done, carry) {
    const chain = carry !== undefined;
    const host = h('div.ev-host');
    let cur = null; let f = null;
    const name = S.EVENTS[type].name;
    const titleFor = (x) => (x ? `${name}  –  ${x.id}  (${A(x).status}${A(x).parity ? ', parity ' + A(x).parity : ''})` : `${name}  –  next animal`);
    const idBox = existing ? null : ui().input('f-animal', a ? a.id : '', { autocomplete: 'off', spellcheck: 'false', maxlength: 20, placeholder: 'Type the animal ID', 'aria-label': 'Animal ID' });
    let keep = carry;
    function build(x) {
      if (f) keep = carryOf(host); // what was typed so far goes on to the next animal shown
      cur = x;
      host.innerHTML = '';
      if (!x) {
        const id = idBox ? idBox.value.trim() : '';
        f = null;
        host.appendChild(h('p.hint.ev-none', id ? `No animal with ID ${id}.` : 'Type the ID of the next animal.'));
      } else {
        f = eventForm(type, x, existing);
        host.appendChild(f.node);
        // a farrowing goes in the sow's own crate, so its location is not carried over
        applyCarry(host, type === 'farrow' && keep ? { ...keep, 'f-loc': undefined } : keep);
      }
      if (m) m.box.querySelector('.dlg-title span').textContent = titleFor(x);
    }
    let m = null;
    if (idBox) idBox.addEventListener('input', U.debounce(() => { const x = S.store.findById(idBox.value.trim()); if (x !== cur || !x) build(x ? S.store.get(x.uid) || x : null); }, 150));
    build(a ? S.store.get(a.uid) || a : null);
    async function save() {
      if (!cur || !f) { ui().toast(idBox && idBox.value.trim() ? `No animal with ID ${idBox.value.trim()}.` : 'Type the animal ID first.', 'error'); if (idBox) { idBox.focus(); idBox.select(); } return null; }
      return saveEvent(cur, f.read(), existing && existing.eid);
    }
    const buttons = existing
      ? [{ label: 'Save changes', primary: true, onClick: async () => { const res = await save(); if (!res) return true; done && done(res); return false; } }, { label: 'Cancel' }]
      : [
        { label: 'Save', primary: !chain, onClick: async () => { const res = await save(); if (!res) return true; done && done(res); return false; } },
        { label: 'Save & next', primary: chain, title: 'Save, then enter the same event for the next animal', onClick: async () => {
          const res = await save(); if (!res) return true;
          const keep = carryOf(host);
          done && done(res);
          openEventDialog(type, null, null, done, keep);
          return false;
        } },
        { label: 'Cancel' },
      ];
    m = ui().modal({ title: titleFor(cur), body: h('div', idBox ? h('div.form.ev-animal', ui().field('Animal ID', idBox)) : null, host), width: 520, buttons });
    // the first dialog starts in the form (the animal is chosen already); "next" dialogs start in the ID box
    if (!chain && idBox) setTimeout(() => { const fs = [...host.querySelectorAll('input:not(.dt):not(.dt-native):not([disabled]), select:not([disabled])')]; if (fs[0]) fs[0].focus(); }, 45);
  }

  /* ================= animal entry / details ================= */
  function animalForm(a, isNew) {
    const L = S.store.settings.lists;
    const x = a || {};
    const ageNote = (inp, id) => { const sp = h('span.age-note#' + id); const upd = () => { const b = U.$('#a-birth') && U.$('#a-birth').value; sp.textContent = b && inp.value ? `Age: ${U.diff(inp.value, b)} days` : ''; }; inp.addEventListener('change', upd); setTimeout(upd, 0); return sp; };
    const arr = ui().dateInput('a-arr', x.arrivalDate || (isNew ? defaultDate() : ''), { max: U.today() });
    const ent = ui().dateInput('a-entry', x.noEntry ? '' : (x.entryDate || (isNew ? defaultDate() : '')), { max: U.today() });
    const birth = ui().dateInput('a-birth', x.birthDate, { max: U.today(), onchange: () => { arr.dispatchEvent(new Event('change')); ent.dispatchEvent(new Event('change')); } });
    const sex = ui().select('a-sex', [['F', 'Sow / gilt'], ['M', 'Boar']], x.sex || 'F', { disabled: !isNew && (x.events || []).length > 0, onchange: () => { boarRows.hidden = sex.value !== 'M'; } });
    const origins = [...new Set((L.origins || []).concat(S.store.animals().map((y) => y.origin).filter(Boolean)))].sort();
    const boarRows = h('div.he-boar',
      ui().field('Boar type', ui().select('a-btype', ['Live boar', 'AI boar (semen)', 'V-boar (vasectomised)'], x.boarType || 'Live boar')),
      ui().field('Block boar', h('input#a-block', { type: 'checkbox', checked: !!x.blocked }), 'Blocked boars are not offered for matings'));
    boarRows.hidden = (x.sex || 'F') !== 'M';
    const node = h('div.herd-entry',
      h('fieldset', h('legend', 'Entry'),
        h('div.form',
          ui().field('Type', ui().select('a-etype', ['Arrival', 'Born on farm', 'Transfer in'], x.entryType || 'Arrival')),
          ui().field('Arrival date', h('span.inline', arr, ageNote(arr, 'age-arr'))),
          ui().field('Herd entry date', h('span.inline', ent, ageNote(ent, 'age-ent')), 'Leave empty if not entered in the breeding herd yet'),
          ui().field('Kilograms', ui().input('a-kg', x.arrivalWeight ?? '', { type: 'number', step: '0.1', min: 0, style: { maxWidth: '110px' } })),
          ui().field('Origin', h('span', datalist('dl-origin', origins), ui().input('a-origin', x.origin || '', { list: 'dl-origin' }))),
          ui().field('Parity at entry', ui().input('a-par', x.entryParity || 0, { type: 'number', min: 0, max: 15, style: { maxWidth: '80px' } }), 'For purchased sows only'))),
      h('fieldset', h('legend', 'General'),
        h('div.he-cols',
          h('div.form',
            ui().field('ID', ui().input('a-id', x.id || '', { maxlength: 20, disabled: !isNew })),
            ui().field('Alt ID', ui().input('a-alt', x.altId || '', { maxlength: 30 })),
            ui().field('Gender', sex),
            ui().field('Birth date', birth),
            ui().field('Responder no.', ui().input('a-resp', x.responder || '', { maxlength: 30 })),
            boarRows),
          h('div.form',
            ui().field('Name', ui().input('a-name', x.name || '', { maxlength: 30 })),
            ui().field('Genetics', ui().select('a-breed', [''].concat(L.breeds), x.breed || '')),
            ui().field('Genetic line', ui().input('a-line', x.line || '', { maxlength: 30 })),
            ui().field('Location', ui().select('a-loc', [''].concat(L.locations), x.location || '')))),
        h('div.form', ui().field('Comment', ui().input('a-rem', x.remarks || '')))),
      h('fieldset', h('legend', 'Pedigree'),
        h('div.he-cols',
          h('div.form', h('div.he-sub', 'Sire'), ui().field('Name', ui().input('a-sire', x.sire || '')), ui().field('Alt ID', ui().input('a-sirealt', x.sireAlt || ''))),
          h('div.form', h('div.he-sub', 'Dam'), ui().field('ID', ui().input('a-dam', x.dam || '')), ui().field('Alt ID', ui().input('a-damalt', x.damAlt || ''))))));
    const val = (id) => { const el = U.$('#' + id); return el ? el.value.trim() || undefined : undefined; };
    const read = () => {
      const v = {
        id: U.$('#a-id').value.trim(), sex: U.$('#a-sex').value, birthDate: val('a-birth'),
        arrivalDate: val('a-arr'), entryDate: val('a-entry'), entryType: val('a-etype'), arrivalWeight: U.$('#a-kg').value ? +U.$('#a-kg').value : undefined,
        entryParity: +U.$('#a-par').value || 0, breed: val('a-breed'), line: val('a-line'), location: val('a-loc'), name: val('a-name'),
        origin: val('a-origin'), responder: val('a-resp'), altId: val('a-alt'), remarks: val('a-rem'),
        sire: val('a-sire'), sireAlt: val('a-sirealt'), dam: val('a-dam'), damAlt: val('a-damalt'),
        boarType: U.$('#a-sex').value === 'M' ? val('a-btype') : undefined, blocked: U.$('#a-sex').value === 'M' ? U.$('#a-block').checked || undefined : undefined,
      };
      v.noEntry = v.entryDate ? undefined : true;
      return v;
    };
    return { node, read };
  }

  function openEntryDialog(id, done, carry) {
    const chain = carry !== undefined;
    const f = animalForm({ id }, true);
    if (chain) setTimeout(() => applyCarry(f.node, carry), 0);
    async function save() {
      const v = f.read();
      if (!v.id) { await ui().alertBox('Cannot save', 'Enter an ID.'); return null; }
      const clash = S.store.findById(v.id);
      if (clash && !A(clash).removed) { await ui().alertBox('Cannot save', `ID ${v.id} is already used by an active animal.`); return null; }
      if (!v.arrivalDate && !v.entryDate) { await ui().alertBox('Cannot save', 'Enter an arrival or herd entry date.'); return null; }
      if (!v.arrivalDate) v.arrivalDate = v.entryDate;
      if (v.birthDate && v.arrivalDate && v.arrivalDate < v.birthDate) { await ui().alertBox('Cannot save', 'Arrival is before birth.'); return null; }
      const a = await S.store.saveAnimal({ uid: U.uid(v.sex === 'M' ? 'b' : 's'), ...v, events: [] });
      S.store.log(`Entered new ${v.sex === 'M' ? 'boar' : 'female'} ${v.id}`);
      ui().toast(`${v.id} entered.`, 'ok');
      return a;
    }
    ui().modal({ title: 'Herd entry details (new)', body: f.node, width: 860, buttons: [
      { label: 'Save', primary: !chain, onClick: async () => { const a = await save(); if (!a) return true; done && done(a); return false; } },
      { label: 'Save & next', primary: chain, onClick: async () => {
        const a = await save(); if (!a) return true;
        const keep = carryOf(f.node);
        done && done(a);
        openEntryDialog('', done, keep);
        return false;
      } },
      { label: 'Cancel' },
    ] });
    // "next" starts in the empty ID box
    if (chain) setTimeout(() => { const el = f.node.querySelector('#a-id'); if (el) { el.focus(); el.select(); } }, 45);
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
    ui().modal({ title: 'Herd entry details (edit / modified) – ' + a.id, body: h('div', summary, f.node), width: 860, buttons: [
      { label: 'Save', primary: true, onClick: async () => {
        const v = f.read();
        delete v.id;
        if (a.sex !== 'M' || !(a.events || []).length) { /* sex editable only when no events */ } else delete v.sex;
        const merged = { ...a, ...v };
        Object.keys(merged).forEach((k) => { if (merged[k] === undefined) delete merged[k]; });
        const upd = await S.store.saveAnimal(merged);
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
  function open(opts = {}) {
    const gilt = opts.mode === 'gilt';
    const tabs = gilt ? GILT_TABS : TAB_ORDER;
    const st = { tab: gilt ? 'entry' : 'mate', list: opts.list || (gilt ? 'Gilts due for mating' : 'Current'), sel: null, histSel: null, lt: false, search: null };
    const win = ui().appWindow({ title: gilt ? 'Gilt pool' : 'Sow data entry', cls: 'entry-win', toolbar: [] });
    win.querySelector('.toolbar').remove();
    const listTabs = gilt ? ['Gilts due for mating', 'Gilts mated', 'Gilts culled'] : ['Served', 'Lactating', 'Open', 'Active', 'Removed', 'All', 'Current'];
    const statusCls = (r) => (r.removed ? 'st-removed' : 'st-' + r.status.toLowerCase());

    const listCols = [
      { label: 'ID', value: (a) => a.id, sort: (a) => a.id },
      gilt ? null : { label: 'Par', num: true, value: (a) => (a.sex === 'M' ? '' : A(a).parity), sort: (a) => A(a).parity },
      { label: 'Status', value: (a) => A(a).status },
      { label: 'Date', value: (a) => U.fmt(A(a).statusDate), sort: (a) => A(a).statusDate },
      { label: 'Days', num: true, value: (a) => A(a).daysInStatus ?? '' },
      { label: 'Location', value: (a) => A(a).location || '' },
      { label: 'Arrival date', value: (a) => U.fmt(a.arrivalDate), sort: (a) => a.arrivalDate || '' },
      { label: 'Birth date', value: (a) => U.fmt(a.birthDate), sort: (a) => a.birthDate || '' },
    ].filter(Boolean);
    const list = ui().grid({ columns: listCols, rows: [], cls: 'list-grid', rowKey: (a) => a.uid, rowClass: (a) => statusCls(A(a)), onRowClick: (a) => { select(a, true); focusId(); }, onRowDblClick: (a) => { select(a, true); enter(); }, onRowContext: (a, x, y) => animalMenu(a, x, y), emptyText: 'No animals in this list' });
    const listTabBar = h('div.subtabs', listTabs.map((t) => h('button.subtab', { type: 'button', 'data-t': t, onclick: () => { st.list = t; st.search = null; refreshList(); } }, t)));
    const count = h('span.list-count');
    listTabBar.appendChild(count);

    const idInput = h('input#entry-id', { autocomplete: 'off', spellcheck: 'false', placeholder: 'Type an ID', 'aria-label': 'Animal ID' });
    idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); goId(); } });
    // history follows the ID as it is typed: "39" shows 39, "3977" shows 3977, no Enter needed
    idInput.addEventListener('input', U.debounce(() => liveId(), 120));
    // the ID box always has the cursor, with any earlier ID highlighted so typing replaces it
    let clickSelect = false;
    idInput.addEventListener('focus', () => { idInput.select(); clickSelect = true; });
    idInput.addEventListener('mouseup', (e) => { if (clickSelect) { e.preventDefault(); clickSelect = false; } });
    function focusId() {
      if (!win.isConnected || U.$('.modal-back') || U.$('.ctx-menu')) return;
      const ae = document.activeElement;
      if (ae && ae !== idInput && ae.closest && ae.closest('input, select, textarea') && win.contains(ae)) return; // typing elsewhere in this window
      idInput.focus({ preventScroll: true }); idInput.select();
    }
    // back to the ID box whenever a dialog or menu closes
    const refocus = new MutationObserver(() => { if (!win.isConnected) { refocus.disconnect(); return; } if (!U.$('.modal-back') && !U.$('.ctx-menu')) setTimeout(focusId, 0); });
    refocus.observe(document.body, { childList: true });
    const idPanel = h('div.id-panel',
      h('div.id-label', 'ID'), idInput,
      h('div.id-btns',
        h('button.ibtn', { type: 'button', onclick: findDialog }, ui().icon('find'), 'Find...'),
        h('button.ibtn', { type: 'button', onclick: () => st.sel ? openDetails(st.sel, (u) => { st.sel = u; refresh(); }) : ui().toast('Select an animal first.') }, ui().icon('details'), 'Details...'),
        h('button.ibtn.right', { type: 'button', onclick: searchDialog }, ui().icon('tools'), 'Search for')));

    const tb = h('div.toolbar.entry-tb',
      tbBtn('enter', 'Enter', enter), tbBtn('edit', 'Edit', editSel), tbBtn('del', 'Delete', delSel), h('span.tb-sep'),
      tbBtn('details', 'Sow card', () => S.sowCard.open(st.sel)), h('span.tb-sep'),
      tbBtn('settings', 'Settings', () => S.settingsUI.open('entry')), tbBtn('help', 'Help', () => S.app.help('entry')), h('span.tb-sep'),
      tbBtn('close', 'Close', () => S.app.home()));
    function tbBtn(ic, label, fn) { return h('button.tb-btn', { type: 'button', onclick: fn }, ui().icon(ic), h('span', label)); }

    const histTitle = h('span', 'History for animal:');
    const ltBox = h('input#lt-sum', { type: 'checkbox', onchange: (e) => { st.lt = e.target.checked; renderHistory(); } });
    const histHead = h('div.hist-head', histTitle, h('label.lt', ltBox, ' L T Summary'));
    const histHost = h('div.hist-host');
    const evTabs = h('div.evtabs', tabs.map((t) => h('button.evtab', { type: 'button', 'data-t': t, onclick: () => { st.tab = t; renderTabs(); if (st.list === 'Current') refreshList(); focusId(); } }, TAB_LABEL[t])));

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
      const isGilt = (a) => a.sex === 'F' && (Number(a.entryParity) || 0) === 0 && A(a).litters.length === 0;
      switch (st.list) {
        case 'Gilts due for mating': return all.filter((a) => !A(a).removed && ((isGilt(a) && ['Gilt', 'Open'].includes(A(a).status)) || a.sex === 'M'));
        case 'Gilts mated': return all.filter((a) => !A(a).removed && isGilt(a) && A(a).services.length);
        case 'Gilts culled': return all.filter((a) => A(a).removed && isGilt(a));
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
      const rows = listRows().sort((x, y) => (A(x).status === A(y).status ? 0 : A(x).status < A(y).status ? -1 : 1) || (A(y).statusDate || '').localeCompare(A(x).statusDate || '') || U.natCmp(x.id, y.id));
      list.update(rows, st.sel && st.sel.uid);
      count.textContent = `${rows.length} animals` + (st.search ? ' · ' + st.search.label : '');
      const nG = S.store.animals().filter((a) => a.sex === 'F' && !A(a).removed && (Number(a.entryParity) || 0) === 0 && !A(a).litters.length).length;
      win.querySelector('.win-name').textContent = gilt
        ? `Sow data entry  (${nG} Gilts selected)  -  [${S.store.settings.farmNumber} ${S.store.settings.farmName}]`
        : `Sow data entry  (${rows.length} Sows selected)  -  [${S.store.settings.farmNumber} ${S.store.settings.farmName}]`;
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
      if (!a) { histTitle.textContent = 'History for animal:'; histHost.appendChild(h('p.hint', 'Type an ID above – the history shows as you type – or pick an animal from the list. Enter then records the event tab at the bottom (red).')); return; }
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
      // PigWIN layout: mating group in #, "Boar … Due … Staff …"; farrowings in yellow. Hidden event types are left out.
      const hidden = histHidden();
      const rows = S.sowCard.cardRows(a).filter((x) => !x.type || !hidden.has(x.type)).map((x) => ({ ...x, count: x.n, remarks: x.rem }));
      const g = ui().grid({
        cls: 'hist-grid', rows, rowKey: (x, i) => (x.ev ? x.ev.eid : 'a' + i), selectedKey: st.histSel && st.histSel.eid, rowClass: (x) => (x.type === 'farrow' ? 'farrow' : ''),
        emptyText: hidden.size ? 'No events (some event types are hidden: right-click to show them)' : 'No events',
        onRowClick: (x) => { st.histSel = x.ev || null; focusId(); }, onRowDblClick: (x) => { st.histSel = x.ev || null; editSel(); },
        onRowContext: (x, cx, cy) => historyMenu(x, cx, cy),
        columns: [
          gilt ? null : { label: 'Par', num: true, value: (x) => x.par }, { label: 'Date', value: (x) => U.fmt(x.date), sort: (x) => x.date },
          { label: 'Interval', num: true, value: (x) => x.interval }, { label: 'Event', value: (x) => x.event }, { label: '#', num: true, value: (x) => x.count ?? '' },
          { label: 'Remarks', value: (x) => x.remarks },
        ].filter(Boolean),
      });
      histHost.appendChild(g);
      const scroller = g; requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
    }
    /* right-click menus */
    const HIST_TYPES = [['vboar', 'V-boar'], ['synch', 'Synchronise'], ['heat', 'Heat'], ['mate', 'Mating'], ['preg', 'Pregnancy check'], ['abort', 'Abortion'], ['farrow', 'Farrowing'],
      ['pigdeath', 'Death'], ['foster', 'Foster'], ['partwean', 'PartWean'], ['wean', 'Weaning'], ['nurse', 'Nurse details'], ['editid', 'Tattoo / ID change'], ['location', 'Location'],
      ['condition', 'Condition'], ['disease', 'Remark / disorder'], ['remove', 'Removal']];
    function histHidden() { try { return new Set(JSON.parse(localStorage.getItem('swineos.histHidden') || '[]')); } catch (e) { return new Set(); } }
    function toggleHidden(t) {
      const hs = histHidden(); if (hs.has(t)) hs.delete(t); else hs.add(t);
      try { localStorage.setItem('swineos.histHidden', JSON.stringify([...hs])); } catch (e) { /* storage blocked */ }
      renderHistory();
    }
    function showEventsMenu() {
      const hs = histHidden();
      return { label: 'Show events', items: [
        ...HIST_TYPES.map(([t, l]) => ({ label: l, checked: !hs.has(t), onClick: () => toggleHidden(t) })),
        '-',
        { label: 'Show all', onClick: () => { try { localStorage.removeItem('swineos.histHidden'); } catch (e) { /* ignore */ } renderHistory(); } },
      ] };
    }
    function newEventItems(a) {
      const r = A(a);
      return tabs.filter((t) => t !== 'entry' && (a.sex !== 'M' || ['location', 'editid', 'disease', 'remove'].includes(t)))
        .map((t) => ({ label: `New ${(S.EVENTS[t] || {}).label || TAB_LABEL[t]}…`, disabled: !!(ELIGIBLE[t] && !ELIGIBLE[t](r)), onClick: () => openEventDialog(t, S.store.get(a.uid) || a, null, (u) => select(u)) }));
    }
    function historyMenu(x, cx, cy) {
      const a = st.sel; if (!a) return;
      const ev = x.ev || null;
      st.histSel = ev;
      const label = ev ? `${(S.EVENTS[ev.type] || {}).label || ev.type} ${U.fmt(ev.date)}` : '';
      ui().contextMenu(cx, cy, [
        ev ? { label: `Edit ${label}…`, onClick: editSel } : { label: 'Edit animal details…', onClick: () => openDetails(a, (u) => { st.sel = u; refresh(); }) },
        ev ? { label: `Delete ${label}…`, danger: true, onClick: delSel } : null,
        '-',
        { label: 'New event', items: newEventItems(a) },
        showEventsMenu(),
        '-',
        { label: 'Animal details…', onClick: () => openDetails(a, (u) => { st.sel = u; refresh(); }) },
        { label: 'Sow card', onClick: () => S.sowCard.open(a) },
        { label: st.lt ? 'Show full history' : 'Show lifetime summary', onClick: () => { st.lt = !st.lt; ltBox.checked = st.lt; renderHistory(); } },
      ]);
    }
    function animalMenu(a, cx, cy) {
      ui().contextMenu(cx, cy, [
        st.tab === 'entry' ? null : { label: `Enter ${(S.EVENTS[st.tab] || {}).label || TAB_LABEL[st.tab]} for ${a.id}…`, onClick: () => { select(a, true); enter(); } },
        st.tab === 'entry' ? null : '-',
        { label: 'New event', items: newEventItems(a) },
        '-',
        { label: 'Animal details…', onClick: () => openDetails(a, (u) => { st.sel = u; refresh(); }) },
        { label: 'Sow card', onClick: () => S.sowCard.open(a) },
      ]);
    }
    function liveId() {
      const id = idInput.value.trim();
      const a = id ? S.store.findById(id) : null;
      if (a && a === st.sel) return;
      st.sel = a; st.histSel = null;
      renderHistory();
      if (!a && id) histHost.replaceChildren(h('p.hint', `No animal with ID ${id}. Press Enter to add it as a new animal.`));
      const row = a && win.querySelector(`.list-grid [data-key="${CSS.escape(a.uid)}"]`);
      win.querySelectorAll('.list-grid .sel').forEach((r) => r.classList.remove('sel'));
      if (row) { row.classList.add('sel'); row.scrollIntoView({ block: 'nearest' }); }
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
    setTimeout(focusId, 50);
    return win;
  }

  S.entry = { maxDate, addEvents, validate, open, openGiltPool: () => open({ mode: 'gilt' }), describe, historyRows, ltSummaryRows, lifetime, openEventDialog, openEntryDialog, TAB_ORDER };
})(window.SOS);
