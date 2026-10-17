/* SwineOS – herd performance calculations shared by the reports. */
(function (S) {
  'use strict';
  const U = S.U;
  const M = () => S.model;

  function overlap(a1, a2, b1, b2) { // inclusive day numbers
    const s = Math.max(a1, b1); const e = Math.min(a2, b2);
    return e >= s ? e - s + 1 : 0;
  }

  /** Flatten the herd into lists used by all reports. */
  function collect(filter) {
    const animals = S.store.animals();
    const out = { females: [], boars: [], services: [], litters: [], events: [] };
    for (const a of animals) {
      if (filter && !filter(a)) continue;
      const r = M().analyze(a);
      if (a.sex === 'M') { out.boars.push(a); continue; }
      out.females.push(a);
      r.services.forEach((s) => out.services.push({ ...s, sow: a, r }));
      r.litters.forEach((l) => out.litters.push({ ...l, sow: a, r }));
    }
    return out;
  }

  /** Productive (gestating/lactating) intervals for a female, as day-number pairs. */
  function productive(a, r, todayN, gest) {
    const iv = [];
    for (const l of r.litters) {
      const s = U.d2n(l.serviceDate || U.addDays(l.farrowDate, -gest));
      const e = l.weanDate ? U.d2n(l.weanDate) - 1 : (r.currentLitter === l ? todayN : U.d2n(l.farrowDate) + 21);
      iv.push([s, e]);
    }
    for (const s of r.services) {
      if (s.outcome === 'pending' || s.outcome === 'unknown') iv.push([U.d2n(s.date), todayN]);
    }
    iv.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const v of iv) {
      const last = merged[merged.length - 1];
      if (last && v[0] <= last[1] + 1) last[1] = Math.max(last[1], v[1]); else merged.push([...v]);
    }
    return merged;
  }

  /**
   * All performance figures for one analysis period [b, e].
   * parityPred filters services/litters by parity and inventory by current parity.
   */
  function periodStats(b, e, parityPred) {
    const st = S.store.settings;
    const gest = st.gestationLength;
    const pp = parityPred || (() => true);
    const bn = U.d2n(b); const en = U.d2n(e); const days = en - bn + 1;
    const todayN = U.d2n(U.today());
    const animals = S.store.animals();
    const x = {
      begin: b, end: e, days, bfDays: 0, mbfDays: 0, endBF: 0, endMBF: 0, endBoars: 0, endParitySum: 0,
      endGilts: 0, endServed: 0, endLactating: 0, endOpen: 0,
      services: 0, firstServices: 0, repeatServices: 0, giltServices: 0, matings: 0, wsi: [], wsiWithin7: 0,
      frDone: 0, frFarrowed: 0, frPending: 0, returns: 0, negs: 0, aborts: 0, svcRemoved: 0,
      litters: 0, giltLitters: 0, totalBorn: 0, bornAlive: 0, stillborn: 0, mummies: 0, gestLens: [], small: 0, birthWt: [],
      littersWeaned: 0, pigsWeaned: 0, lactLens: [], weanWt: 0, weanWtPigs: 0, deaths: 0, fosterIn: 0,
      farrowIntervals: [], npd: 0, npdIncomplete: false, entryToService: [],
      giltsEntered: 0, culled: 0, died: 0, sold: 0, removedParities: [], abortEvents: 0, pregNeg: 0,
    };
    for (const a of animals) {
      const r = M().analyze(a);
      if (a.sex === 'M') {
        const arr = a.arrivalDate || a.entryDate || a.birthDate || '';
        if (arr <= e && !(r.removed && r.removedDate <= e)) x.endBoars++;
        continue;
      }
      const entry = r.entryDate || r.firstServiceDate;
      if (!entry) continue;
      const parE = M().parityAt(a, e);
      const entN = U.d2n(entry);
      const remN = r.removed ? U.d2n(r.removedDate) - 1 : todayN + 10000;
      const inPP = pp(parE);
      if (inPP) {
        const bfD = overlap(entN, remN, bn, en);
        x.bfDays += bfD;
        if (r.firstServiceDate) x.mbfDays += overlap(U.d2n(r.firstServiceDate), remN, bn, en);
        if (M().isBreedingFemale(a, e)) {
          x.endBF++;
          x.endParitySum += parE;
          if (r.firstServiceDate && r.firstServiceDate <= e) x.endMBF++;
          const s = M().statusAt(a, e);
          if (s === 'Gilt') x.endGilts++; else if (s === 'Served') x.endServed++; else if (s === 'Lactating') x.endLactating++; else if (s === 'Open') x.endOpen++;
        }
        // non-productive days
        if (bfD > 0) {
          const ps = Math.max(entN, bn); const pe = Math.min(remN, en);
          let prod = 0;
          for (const [s1, e1] of productive(a, r, todayN, gest)) prod += overlap(s1, e1, ps, pe);
          x.npd += bfD - prod;
        }
        if (U.inRange(entry, b, e) && !(Number(a.entryParity) > 0)) x.giltsEntered++;
        if (r.removed && U.inRange(r.removedDate, b, e)) {
          if (r.removalKind === 'death') x.died++; else if (r.removalKind === 'sold') x.sold++; else x.culled++;
          x.removedParities.push(parE);
        }
        if (r.firstServiceDate && U.inRange(r.firstServiceDate, b, e) && r.entryDate) x.entryToService.push(U.diff(r.firstServiceDate, r.entryDate));
      }
      for (const s of r.services) {
        if (s.outcome === 'pending' && U.inRange(s.date, U.addDays(b, -gest - 10), e) && pp(s.parity)) x.npdIncomplete = true;
        if (!U.inRange(s.date, b, e) || !pp(s.parity)) continue;
        x.services++;
        x.matings += s.matings;
        if (s.isFirst) x.firstServices++; else x.repeatServices++;
        if (s.isGilt) x.giltServices++;
        if (s.wsi !== null && s.wsi !== undefined) { x.wsi.push(s.wsi); if (s.wsi <= 7) x.wsiWithin7++; }
        if (s.outcome === 'pending' || s.outcome === 'unknown') x.frPending++;
        else {
          x.frDone++;
          if (s.outcome === 'farrow') x.frFarrowed++;
          else if (s.outcome === 'return') x.returns++;
          else if (s.outcome === 'neg') x.negs++;
          else if (s.outcome === 'abort') x.aborts++;
          else if (s.outcome === 'removed') x.svcRemoved++;
        }
      }
      for (const l of r.litters) {
        if (U.inRange(l.farrowDate, b, e) && pp(l.parity)) {
          x.litters++;
          if (l.parity === 1) x.giltLitters++;
          x.totalBorn += l.totalBorn; x.bornAlive += l.liveBorn; x.stillborn += l.stillborn; x.mummies += l.mummies;
          if (l.gestLen) x.gestLens.push(l.gestLen);
          if (l.liveBorn < 7) x.small++;
          if (l.birthWeight) x.birthWt.push(l.birthWeight);
          if (l.prevFarrowDate) x.farrowIntervals.push(U.diff(l.farrowDate, l.prevFarrowDate));
        }
        if (l.weanDate && l.lactLen !== null && U.inRange(l.weanDate, b, e) && pp(l.parity)) {
          x.littersWeaned++;
          x.lactLens.push(l.lactLen);
          if (l.weanWeightCount) { x.weanWt += l.weanWeight; x.weanWtPigs += l.weanWeightCount; }
        }
      }
      // event-dated piglet flows
      let par = Number(a.entryParity) || 0;
      for (const ev of r.events) {
        if (ev.type === 'farrow') par++;
        if (!U.inRange(ev.date, b, e) || !pp(par)) continue;
        if (ev.type === 'pigdeath') x.deaths += Number(ev.count) || 0;
        else if (ev.type === 'wean' || ev.type === 'partwean') x.pigsWeaned += Number(ev.count) || 0;
        else if (ev.type === 'abort') x.abortEvents++;
        else if (ev.type === 'preg' && ev.result === '-') x.pregNeg++;
      }
    }
    x.avgBF = x.bfDays / days;
    x.avgMBF = x.mbfDays / days;
    x.yearFactor = 365 / days;
    return x;
  }

  const n1 = (v) => U.num(v, 1); const n2 = (v) => U.num(v, 2); const n0 = (v) => U.num(v, 0);
  const div = (a, b) => (b ? a / b : NaN);

  /** Herd performance rows. tabs: K=Key, M=Mating, F=Farrowing, W=Weaning, R=Reproductive cycle, T=Herd turnover */
  const METRICS = [
    { id: 'endBF', label: 'Ending breeding female inventory', tabs: 'KT', f: n0, v: (x) => x.endBF },
    { id: 'endBoars', label: 'Ending boar inventory', tabs: 'KT', f: n0, v: (x) => x.endBoars },
    { id: 'avgBF', label: 'Avg. breeding female inventory', tabs: 'T', f: n1, v: (x) => x.avgBF },
    { id: 'avgMBF', label: 'Avg. mated female inventory', tabs: 'T', f: n1, v: (x) => x.avgMBF },
    { id: 'weanedMbf', label: 'Weaned pigs / MBF / year', tabs: 'KW', f: n1, v: (x) => div(x.pigsWeaned, x.avgMBF) * x.yearFactor, shade: (x) => x.days < 28, target: 'weanedMbfYear' },
    { id: 'weanedBf', label: 'Weaned pigs / BF / year', tabs: 'KW', f: n1, v: (x) => div(x.pigsWeaned, x.avgBF) * x.yearFactor, shade: (x) => x.days < 28 },
    { id: 'littersMbf', label: 'Litters farrowed / MBF / year', tabs: 'KF', f: n2, v: (x) => div(x.litters, x.avgMBF) * x.yearFactor, shade: (x) => x.days < 28, target: 'littersMbfYear' },
    { id: 'littersBf', label: 'Litters farrowed / BF / year', tabs: 'KF', f: n2, v: (x) => div(x.litters, x.avgBF) * x.yearFactor, shade: (x) => x.days < 28 },
    { id: 'services', label: 'Number of services', tabs: 'M', f: n0, v: (x) => x.services },
    { id: 'firstSvc', label: 'First services (after wean / entry)', tabs: 'M', f: n0, v: (x) => x.firstServices },
    { id: 'giltSvc', label: 'Gilts first served', tabs: 'M', f: n0, v: (x) => x.giltServices },
    { id: 'repeatSvc', label: 'Repeat services', tabs: 'M', f: n0, v: (x) => x.repeatServices },
    { id: 'repeatPct', label: 'Repeat services %', tabs: 'M', f: n1, v: (x) => U.pct(x.repeatServices, x.services) },
    { id: 'matingsSvc', label: 'Matings per service', tabs: 'M', f: n2, v: (x) => div(x.matings, x.services) },
    { id: 'litters', label: 'Litters farrowed', tabs: 'F', f: n0, v: (x) => x.litters },
    { id: 'giltLitters', label: 'Gilt litters (parity 1) %', tabs: 'F', f: n1, v: (x) => U.pct(x.giltLitters, x.litters) },
    { id: 'tb', label: 'Avg. total born / birth litter', tabs: 'KF', f: n1, v: (x) => div(x.totalBorn, x.litters), target: 'totalBorn' },
    { id: 'ba', label: 'Avg. born alive / birth litter', tabs: 'KF', f: n1, v: (x) => div(x.bornAlive, x.litters), target: 'bornAlive' },
    { id: 'sbPct', label: 'Stillborn %', tabs: 'F', f: n1, v: (x) => U.pct(x.stillborn, x.totalBorn) },
    { id: 'mmPct', label: 'Mummies %', tabs: 'F', f: n1, v: (x) => U.pct(x.mummies, x.totalBorn) },
    { id: 'small', label: 'Litters < 7 born alive %', tabs: 'F', f: n1, v: (x) => U.pct(x.small, x.litters) },
    { id: 'gestLen', label: 'Avg. gestation length', tabs: 'FR', f: n1, v: (x) => U.avg(x.gestLens) },
    { id: 'birthWt', label: 'Avg. birth weight / litter (kg)', tabs: 'F', f: n1, v: (x) => U.avg(x.birthWt) },
    { id: 'littersWeaned', label: 'Litters weaned', tabs: 'W', f: n0, v: (x) => x.littersWeaned },
    { id: 'pigsWeaned', label: 'Pigs weaned', tabs: 'W', f: n0, v: (x) => x.pigsWeaned },
    { id: 'weanLitter', label: 'Avg. weaned / wean litter', tabs: 'KW', f: n1, v: (x) => div(x.pigsWeaned, x.littersWeaned), target: 'weanedLitter' },
    { id: 'pwm', label: 'Pre-weaning mortality % (time period)', tabs: 'KW', f: n1, v: (x) => U.pct(x.deaths, x.deaths + x.pigsWeaned), target: 'pwm', lower: true },
    { id: 'lact', label: 'Avg. lactation length', tabs: 'WR', f: n1, v: (x) => U.avg(x.lactLens) },
    { id: 'weanWt', label: 'Avg. weaning weight / pig (kg)', tabs: 'W', f: n2, v: (x) => div(x.weanWt, x.weanWtPigs) },
    { id: 'fi', label: 'Farrowing interval', tabs: 'KR', f: n1, v: (x) => U.avg(x.farrowIntervals), target: 'farrowInterval', lower: true },
    { id: 'fr', label: 'Farrowing rate', tabs: 'KMR', f: n1, v: (x) => U.pct(x.frFarrowed, x.frDone), shade: (x) => x.frPending > 0, target: 'farrowRate' },
    { id: 'frPending', label: 'Services with unknown outcome', tabs: 'MR', f: n0, v: (x) => x.frPending },
    { id: 'returnsPct', label: 'Returns to service %', tabs: 'MR', f: n1, v: (x) => U.pct(x.returns + x.negs, x.frDone), shade: (x) => x.frPending > 0 },
    { id: 'wsi', label: 'Weaning to first service interval', tabs: 'KMR', f: n1, v: (x) => U.avg(x.wsi), target: 'wsi', lower: true },
    { id: 'wsi7', label: 'Weaned sows served within 7 days %', tabs: 'MR', f: n1, v: (x) => U.pct(x.wsiWithin7, x.wsi.length) },
    { id: 'entrySvc', label: 'Entry to first service interval', tabs: 'R', f: n1, v: (x) => U.avg(x.entryToService) },
    { id: 'aborts', label: 'Abortions', tabs: 'R', f: n0, v: (x) => x.abortEvents },
    { id: 'pregNeg', label: 'Negative pregnancy checks', tabs: 'R', f: n0, v: (x) => x.pregNeg },
    { id: 'npd', label: 'Avg. non-prod.days / BF / year', tabs: 'KR', f: n1, v: (x) => div(x.npd, x.bfDays) * 365, shade: (x) => x.npdIncomplete, target: 'npd', lower: true },
    { id: 'giltsEntered', label: 'Gilts entered', tabs: 'T', f: n0, v: (x) => x.giltsEntered },
    { id: 'culled', label: 'Breeding females culled', tabs: 'T', f: n0, v: (x) => x.culled + x.sold },
    { id: 'died', label: 'Breeding females died', tabs: 'T', f: n0, v: (x) => x.died },
    { id: 'cullRate', label: 'Breeding female culling rate', tabs: 'KT', f: n1, v: (x) => div(x.culled + x.sold, x.avgBF) * x.yearFactor * 100, target: 'cullRate', lower: true },
    { id: 'mortRate', label: 'Breeding female mortality rate', tabs: 'KT', f: n1, v: (x) => div(x.died, x.avgBF) * x.yearFactor * 100, target: 'mortRate', lower: true },
    { id: 'replRate', label: 'Replacement rate', tabs: 'T', f: n1, v: (x) => div(x.giltsEntered, x.avgBF) * x.yearFactor * 100 },
    { id: 'remPar', label: 'Avg. parity of removed females', tabs: 'T', f: n2, v: (x) => U.avg(x.removedParities) },
    { id: 'avgPar', label: 'Avg. parity for bdg female inventory', tabs: 'KT', f: n2, v: (x) => div(x.endParitySum, x.endBF) },
  ];

  const TABS = [
    ['K', 'Key'], ['A', 'All'], ['M', 'Mating'], ['F', 'Farrowing'], ['W', 'Weaning'], ['R', 'Reproductive cycle'], ['T', 'Herd turnover'],
  ];

  /** Build period list ending at `end`: n periods of `len` units. */
  function periods(end, n, len, unit) {
    const out = [];
    let e = end;
    for (let i = 0; i < n; i++) {
      let b;
      if (unit === 'Day(s)') b = U.addDays(e, -len + 1);
      else if (unit === 'Week(s)') b = U.addDays(e, -7 * len + 1);
      else if (unit === 'Month(s)') b = U.addDays(U.addMonths(e, -len), 1);
      else if (unit === 'Quarter(s)') b = U.addDays(U.addMonths(e, -3 * len), 1);
      else b = U.addDays(U.addMonths(e, -12 * len), 1);
      out.unshift([b, e]);
      e = U.addDays(b, -1);
    }
    return out;
  }

  /** One record per litter for the analysis tools. */
  function litterRecords(b, e) {
    const c = collect();
    const nextSvc = new Map();
    c.services.forEach((s) => { if (s.wsi !== null) nextSvc.set(s.sow.uid + '|' + s.prevDate, s); });
    return c.litters.filter((l) => U.inRange(l.farrowDate, b, e)).map((l) => {
      const ns = l.weanDate ? nextSvc.get(l.sowUid + '|' + l.weanDate) : null;
      return {
        sow: l.sowId, farrowDate: l.farrowDate, serviceDate: l.serviceDate, parity: l.parity,
        totalBorn: l.totalBorn, bornAlive: l.liveBorn, stillborn: l.stillborn, mummies: l.mummies,
        deaths: l.deaths, fosterNet: l.fosterIn - l.fosterOut, weaned: l.weanDate ? l.weaned : null,
        lactLen: l.lactLen, gestLen: l.gestLen, weanWeight: l.weanWeightCount ? l.weanWeight : null,
        pigWeanWeight: l.weanWeightCount ? l.weanWeight / l.weanWeightCount : null,
        birthWeight: l.birthWeight, wsi: ns ? ns.wsi : null, location: l.location || '', boar: l.boar || '',
        nextOutcome: ns ? ns.outcome : null,
        month: l.farrowDate.slice(0, 7), week: U.isoWeek(l.farrowDate),
      };
    });
  }

  const LITTER_FIELDS = [
    ['parity', 'Parity', 'n'], ['totalBorn', 'Total born', 'n'], ['bornAlive', 'Born alive', 'n'], ['stillborn', 'Stillborn', 'n'],
    ['mummies', 'Mummies', 'n'], ['deaths', 'Pre-wean deaths', 'n'], ['fosterNet', 'Net fostered', 'n'], ['weaned', 'Pigs weaned', 'n'],
    ['lactLen', 'Lactation length', 'n'], ['gestLen', 'Gestation length', 'n'], ['weanWeight', 'Litter wean weight', 'n'],
    ['pigWeanWeight', 'Wean weight / pig', 'n'], ['birthWeight', 'Litter birth weight', 'n'], ['wsi', 'Wean-to-service interval', 'n'],
    ['location', 'Farrowing location', 'c'], ['boar', 'Boar', 'c'], ['month', 'Farrowing month', 'c'],
  ];

  S.calc = { collect, periodStats, periods, METRICS, TABS, litterRecords, LITTER_FIELDS, productive, overlap };
})(window.SOS);
