/* SwineOS – herd model: settings defaults, event types, and per-animal analysis
 * (status, parity, services, litters, status timeline). */
(function (S) {
  'use strict';
  const U = S.U;

  S.DEFAULT_SETTINGS = {
    farmName: 'My Sow Farm',
    farmNumber: '0000001',
    gestationLength: 115,
    targetLactation: 21,
    giltEntryAge: 200,
    serviceGapDays: 3, // matings within this many days belong to the same service
    demo: false,
    lists: {
      locations: ['Gest 1', 'Gest 2', 'Gest 3', 'Breeding', 'Farr 1', 'Farr 2', 'Farr 3', 'Farr 4', 'Gilt pen', 'Boar barn'],
      breeds: ['F1 (LxY)', 'Landrace', 'Yorkshire', 'Duroc', 'Hampshire', 'Pietrain'],
      cullReasons: ['Old age / parity', 'Poor production', 'Reproductive failure', 'Not pregnant', 'Lameness', 'Poor body condition', 'Udder problems', 'Disease', 'Aggression', 'Other'],
      deathReasons: ['Sudden death', 'Prolapse', 'Farrowing problems', 'Lameness (euthanized)', 'Torsion', 'Heat stress', 'Disease', 'Unknown'],
      pigDeathCauses: ['Crushed / laid on', 'Starvation', 'Low viability', 'Scours', 'Splay leg', 'Savaged', 'Deformity', 'Respiratory', 'Unknown'],
      diseases: ['Lameness', 'MMA / mastitis', 'Fever', 'Vulva discharge', 'Respiratory', 'Abscess', 'Shoulder sore', 'Other'],
      treatments: ['Penicillin', 'Oxytetracycline', 'Meloxicam', 'Ceftiofur', 'Oxytocin', 'Lutalyse', 'Iron', 'Other'],
      technicians: ['', 'Tech 1', 'Tech 2'],
      groups: [],
    },
    vaccinations: [
      { id: 'v1', name: 'E. coli / Clostridium', target: 'served', ref: 'service', day: 85, active: true },
      { id: 'v2', name: 'E. coli booster', target: 'served', ref: 'service', day: 100, active: true },
      { id: 'v3', name: 'Parvo / Erysipelas', target: 'lactating', ref: 'farrow', day: 14, active: true },
      { id: 'v4', name: 'Gilt Parvo / Ery / Lepto', target: 'gilt', ref: 'birth', day: 180, active: true },
      { id: 'v5', name: 'Deworm', target: 'served', ref: 'service', day: 95, active: false },
    ],
    targets: {
      weanedMbfYear: 30, littersMbfYear: 2.4, totalBorn: 16, bornAlive: 14.5, weanedLitter: 12.5,
      pwm: 12, farrowRate: 88, wsi: 6, npd: 40, cullRate: 45, mortRate: 6, farrowInterval: 145,
    },
    actionLists: {
      giltAge: 200, openDays: 0, servicesLast: 28, heat3: 10, heat6: 31, preg1: 28, preg2: 56,
      served: 7, dueFarrow: 28, weanLitters: 17,
      on: { gilts: true, open: true, servicesLast: true, heat3: true, heat6: false, preg1: true, preg2: false, served: false, dueFarrow: true, wean: true, periodical: true },
      printCodes: true, repeatSpace: true, remarksSpace: true,
      lastPrinted: '',
    },
    lastEntryDate: '',
  };

  /** Event types, in the order of the data-entry tabs. */
  S.EVENTS = {
    heat: { label: 'Heat', tab: 'Heat', name: 'Heat check' },
    vboar: { label: 'Boar exposure', tab: 'V-boar', name: 'Boar exposure (V-boar)' },
    synch: { label: 'Synchronisation', tab: 'Synchronise', name: 'Synchronisation' },
    mate: { label: 'Mating', tab: 'Mate', name: 'Mating' },
    preg: { label: 'Pregnancy check', tab: 'ReproChk', name: 'Repro check' },
    abort: { label: 'Abortion', tab: 'Abort', name: 'Abortion' },
    farrow: { label: 'Farrowing', tab: 'Farrow', name: 'Farrowing' },
    pigdeath: { label: 'Piglet death', tab: 'PigDth', name: 'Piglet death' },
    foster: { label: 'Foster', tab: 'Foster', name: 'Foster' },
    partwean: { label: 'Part wean', tab: 'PartWean', name: 'Partial weaning' },
    wean: { label: 'Weaning', tab: 'Wean', name: 'Weaning' },
    nurse: { label: 'Nurse sow', tab: 'Nurse', name: 'Nurse sow' },
    location: { label: 'Location', tab: 'Location', name: 'Location change' },
    editid: { label: 'ID change', tab: 'Edit ID', name: 'Edit ID' },
    disease: { label: 'Disease / treatment', tab: 'Disease', name: 'Disease / treatment' },
    condition: { label: 'Condition', tab: null, name: 'Condition / backfat' },
    vaccinate: { label: 'Vaccination', tab: null, name: 'Vaccination' },
    remove: { label: 'Removal', tab: 'Remove', name: 'Remove' },
  };

  let cache = new WeakMap();
  const sortEv = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0));

  /**
   * Analyse one animal. Results are cached per object (records are replaced, never mutated).
   */
  function analyze(a) {
    const hit = cache.get(a);
    if (hit) return hit;
    const st = S.store && S.store.settings ? S.store.settings : S.DEFAULT_SETTINGS;
    const gest = st.gestationLength || 115;
    const gap = st.serviceGapDays || 3;
    const today = U.today();
    const isBoar = a.sex === 'M';
    const events = [...(a.events || [])].sort(sortEv);

    const r = {
      events,
      isBoar,
      status: isBoar ? 'Boar' : 'Gilt',
      statusDate: a.entryDate || a.arrivalDate || a.birthDate || '',
      parity: Number(a.entryParity) || 0,
      services: [],
      litters: [],
      timeline: [], // {date, status}
      removed: false,
      removedDate: '',
      removalKind: '',
      removalReason: '',
      entryDate: a.noEntry ? '' : (a.entryDate || a.arrivalDate || ''),
      firstServiceDate: '',
      location: a.location || '',
      piglets: 0,
      lastService: null,
      lastLitter: null,
      currentId: a.id,
    };
    const setStatus = (s, d) => { r.status = s; r.statusDate = d; r.timeline.push({ date: d, status: s }); };
    r.timeline.push({ date: r.statusDate, status: r.status });

    let pending = null; // service awaiting outcome
    let litter = null; // current litter on the sow
    let lastWeanDate = null;
    let lastAbortDate = null;

    const closePending = (outcome, date) => {
      if (!pending) return;
      pending.outcome = outcome;
      pending.outcomeDate = date;
      pending = null;
    };

    for (const e of events) {
      if (r.removed) break;
      switch (e.type) {
        case 'mate': {
          if (isBoar) break;
          const last = r.services[r.services.length - 1];
          if (last && last === pending && U.diff(e.date, last.lastMating) <= gap) {
            last.matings++;
            last.lastMating = e.date;
            if (e.boar) last.boars.push(e.boar);
            last.methods.push(e.method || 'AI');
            break;
          }
          if (litter) { // mated while lactating: treat as weaned
            litter.weanDate = litter.weanDate || e.date;
            litter = null;
          }
          let prev = 'entry'; let prevDate = r.entryDate;
          if (pending) { closePending('return', e.date); prev = 'return'; prevDate = last ? last.date : ''; }
          else if (last && last.outcome && last.outcome !== 'farrow' && (!lastWeanDate || last.date > lastWeanDate)) {
            prev = last.outcome === 'abort' ? 'abort' : 'return'; prevDate = last.outcomeDate || last.date;
          } else if (lastWeanDate) { prev = 'wean'; prevDate = lastWeanDate; }
          const svc = {
            date: e.date, lastMating: e.date, matings: 1, boars: e.boar ? [e.boar] : [], methods: [e.method || 'AI'], parity: r.parity,
            prev, prevDate, wsi: prev === 'wean' ? U.diff(e.date, lastWeanDate) : null,
            isFirst: prev === 'wean' || prev === 'entry', isGilt: r.parity === 0 && prev === 'entry',
            outcome: null, outcomeDate: null, tech: e.tech || '', serviceNo: r.services.filter((s) => s.parity === r.parity).length + 1,
          };
          if (!r.firstServiceDate) r.firstServiceDate = e.date;
          r.services.push(svc);
          pending = svc;
          r.lastService = svc;
          setStatus('Served', e.date);
          break;
        }
        case 'heat':
          if (pending && U.diff(e.date, pending.date) > 14) { closePending('return', e.date); setStatus('Open', e.date); }
          break;
        case 'preg':
          if (pending) {
            pending.pregCheck = e.result;
            if (e.result === '-') { closePending('neg', e.date); setStatus('Open', e.date); }
          }
          break;
        case 'abort':
          closePending('abort', e.date);
          lastAbortDate = e.date;
          setStatus('Open', e.date);
          break;
        case 'farrow': {
          if (isBoar) break;
          const svc = pending;
          closePending('farrow', e.date);
          if (litter) litter.weanDate = litter.weanDate || e.date;
          r.parity += 1;
          const lb = Number(e.liveBorn) || 0; const sb = Number(e.stillborn) || 0; const mm = Number(e.mummies) || 0;
          litter = {
            farrowDate: e.date, parity: r.parity, service: svc || null, serviceDate: svc ? svc.date : U.addDays(e.date, -gest),
            gestLen: svc ? U.diff(e.date, svc.date) : null, liveBorn: lb, stillborn: sb, mummies: mm, totalBorn: lb + sb + mm,
            birthWeight: Number(e.birthWeight) || null, location: e.location || r.location, boar: svc && svc.boars[0] || '',
            deaths: 0, lostAtWean: 0, deathsByCause: {}, fosterIn: 0, fosterOut: 0, partWeaned: 0, weaned: 0, weanCount: 0,
            weanDate: null, weanWeight: 0, weanWeightCount: 0, lactLen: null, assisted: !!e.assisted, nurse: false,
            prevFarrowDate: r.lastLitter ? r.lastLitter.farrowDate : null, sowId: a.id, sowUid: a.uid,
          };
          if (e.location) r.location = e.location;
          r.litters.push(litter);
          r.lastLitter = litter;
          r.piglets = lb;
          setStatus('Lactating', e.date);
          break;
        }
        case 'pigdeath':
          if (litter) {
            const n = Number(e.count) || 0;
            litter.deaths += n;
            const c = e.cause || 'Unknown';
            litter.deathsByCause[c] = (litter.deathsByCause[c] || 0) + n;
            r.piglets -= n;
          }
          break;
        case 'foster':
          if (litter) {
            const n = Number(e.count) || 0;
            if (n >= 0) litter.fosterIn += n; else litter.fosterOut += -n;
            r.piglets += n;
          }
          break;
        case 'nurse':
          // sow already weaned takes on a foster litter: status back to lactating
          if (!litter && r.lastLitter && r.status === 'Open') {
            litter = r.lastLitter;
            litter.nurse = true;
            litter.weanDate = null;
            setStatus('Lactating', e.date);
          }
          if (litter) { const n = Number(e.count) || 0; litter.fosterIn += n; r.piglets += n; }
          break;
        case 'partwean':
          if (litter) {
            const n = Number(e.count) || 0;
            litter.partWeaned += n;
            litter.weaned += n;
            if (e.weight) { litter.weanWeight += Number(e.weight); litter.weanWeightCount += n; }
            r.piglets -= n;
          }
          break;
        case 'wean':
          if (litter) {
            const n = Number(e.count) || 0;
            litter.weaned += n;
            litter.weanCount = n;
            if (e.weight) { litter.weanWeight += Number(e.weight); litter.weanWeightCount += n; }
            litter.weanDate = e.date;
            litter.lactLen = U.diff(e.date, litter.farrowDate);
            // piglets missing at weaning that were never recorded as dead
            litter.lostAtWean = r.piglets - n; // net: negative when unrecorded fostering added piglets
            litter = null;
            r.piglets = 0;
          }
          lastWeanDate = e.date;
          if (r.status === 'Lactating') setStatus('Open', e.date);
          break;
        case 'location':
          r.location = e.location || r.location;
          break;
        case 'editid':
          r.currentId = e.newId || r.currentId;
          break;
        case 'remove':
          closePending('removed', e.date);
          if (litter) { litter.weanDate = litter.weanDate || e.date; litter = null; }
          r.removed = true;
          r.removedDate = e.date;
          r.removalKind = e.kind || 'cull';
          r.removalReason = e.reason || '';
          setStatus(r.removalKind === 'death' ? 'Dead' : r.removalKind === 'sold' ? 'Sold' : 'Culled', e.date);
          break;
        default:
          break;
      }
    }
    // Pending service: outcome still unknown.
    if (pending) {
      pending.outcome = U.diff(today, pending.date) > gest + 10 ? 'unknown' : 'pending';
    }
    r.removedOrStatus = r.removed ? 'Removed' : r.status;
    r.daysInStatus = r.statusDate ? U.diff(today, r.statusDate) : null;
    r.lactating = !!litter;
    r.currentLitter = litter;
    r.ageDays = a.birthDate ? U.diff(today, a.birthDate) : null;
    r.lastAbortDate = lastAbortDate;
    r.lastWeanDate = lastWeanDate;
    cache.set(a, r);
    return r;
  }

  /** Status of an animal at a given date (end of day). */
  function statusAt(a, iso) {
    const r = analyze(a);
    if ((a.arrivalDate || a.entryDate || a.birthDate || '') > iso) return null;
    let s = null;
    for (const t of r.timeline) { if (t.date <= iso) s = t.status; else break; }
    return s;
  }

  /** Parity at a date (number of farrowings up to and including that date). */
  function parityAt(a, iso) {
    const r = analyze(a);
    return (Number(a.entryParity) || 0) + r.litters.filter((l) => l.farrowDate <= iso).length;
  }

  /** Is the animal a breeding female (entered and not removed) on this date? */
  function isBreedingFemale(a, iso) {
    if (a.sex === 'M') return false;
    const r = analyze(a);
    const ent = r.entryDate || r.firstServiceDate;
    if (!ent || ent > iso) return false;
    if (r.removed && r.removedDate <= iso) return false;
    return true;
  }

  function resetCache() { cache = new WeakMap(); }

  S.model = { resetCache, analyze, statusAt, parityAt, isBreedingFemale, sortEv };
})(window.SOS);
