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
  function productive(a, r, todayN, gest, parts) {
    const iv = [];
    for (const l of r.litters) {
      const s = U.d2n(l.serviceDate || U.addDays(l.farrowDate, -gest));
      const f = U.d2n(l.farrowDate);
      const e = l.weanDate ? U.d2n(l.weanDate) - 1 : (r.currentLitter === l ? todayN : f + 21);
      iv.push([s, e]);
      if (parts) { parts.gest.push([s, f - 1]); parts.lact.push([f, e]); }
    }
    if (parts) for (const sv of r.services) if (sv.outcome === 'pending' || sv.outcome === 'unknown') parts.gest.push([U.d2n(sv.date), todayN]);
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
      aiMatings: 0, natMatings: 0, multipleSvc: 0, mixedSvc: 0, weanWtLitters: 0,
      // further PigWIN herd performance figures
      beginBF: 0, entered: 0, arrivalToEntry: [], arrivalAges: [], prospDays: 0, endProsp: 0, gestDays: 0, lactDays: 0,
      npdMbf: 0, endOpenMbf: 0, pureNat: 0, pureAI: 0, mixMethod: 0, farrowedParitySum: 0, birthWtLiveBorn: 0,
      liveBornWeaned: 0, netFostered: 0, nurseWeaned: 0, nursedPigs: 0, weanEvents: 0, litterPigsWeaned: 0, disrupted: 0,
      culledParitySum: 0, removedBF: [], removedMBF: [], frServices: [],
    };
    const bPrev = U.addDays(b, -1);
    for (const a of animals) {
      const r = M().analyze(a);
      if (a.sex === 'M') {
        const ent = r.entryDate;
        if (ent && ent <= e && !(r.removed && r.removedDate <= e)) x.endBoars++;
        continue;
      }
      const entry = r.entryDate || r.firstServiceDate;
      if (!entry) continue;
      // removed long before the period: nothing in it can count
      if (r.removed && r.removedDate < b && (!r.events.length || r.events[r.events.length - 1].date < U.addDays(b, -gest - 30))) continue;
      if (entry > e && (!r.events.length || r.events[0].date > e)) continue;
      const parE = M().parityAt(a, e);
      const entN = U.d2n(entry);
      // prospective breeding females: arrived, not yet entered into the breeding herd
      if (a.arrivalDate && pp(0)) {
        const arrN = U.d2n(a.arrivalDate);
        const pEnd = Math.min(entN - 1, r.removed ? U.d2n(r.removedDate) - 1 : todayN + 10000);
        if (arrN < entN) {
          x.prospDays += overlap(arrN, pEnd, bn, en);
          if (a.arrivalDate <= e && entry > e && !(r.removed && r.removedDate <= e)) x.endProsp++;
        }
        if (U.inRange(a.arrivalDate, b, e) && a.birthDate) x.arrivalAges.push(U.diff(a.arrivalDate, a.birthDate));
      }
      const remN = r.removed ? U.d2n(r.removedDate) - 1 : todayN + 10000;
      const inPP = pp(parE);
      if (inPP) {
        const bfD = overlap(entN, remN, bn, en);
        x.bfDays += bfD;
        if (r.firstServiceDate) x.mbfDays += overlap(U.d2n(r.firstServiceDate), remN, bn, en);
        if (M().isBreedingFemale(a, e)) {
          x.endBF++;
          x.endParitySum += parE;
          const s = M().statusAt(a, e);
          if (r.firstServiceDate && r.firstServiceDate <= e) { x.endMBF++; if (s === 'Open') x.endOpenMbf++; }
          if (s === 'Gilt') x.endGilts++; else if (s === 'Served') x.endServed++; else if (s === 'Lactating') x.endLactating++; else if (s === 'Open') x.endOpen++;
        }
        if (M().isBreedingFemale(a, bPrev)) x.beginBF++;
        // productive and non-productive days
        if (bfD > 0) {
          const ps = Math.max(entN, bn); const pe = Math.min(remN, en);
          const parts = { gest: [], lact: [] };
          let prod = 0;
          for (const [s1, e1] of productive(a, r, todayN, gest, parts)) prod += overlap(s1, e1, ps, pe);
          for (const [s1, e1] of parts.gest) x.gestDays += overlap(s1, e1, ps, pe);
          for (const [s1, e1] of parts.lact) x.lactDays += overlap(s1, e1, ps, pe);
          // As in PigWIN, a non-productive spell counts once it has ended (served again or removed).
          // A female still open or unserved today has an open spell: left out, and the figure is shaded.
          const prodIv = productive(a, r, todayN, gest);
          let openFrom = null;
          if (!r.removed) {
            const lastEnd = prodIv.length ? prodIv[prodIv.length - 1][1] : entN - 1;
            if (lastEnd < todayN) openFrom = lastEnd + 1;
          }
          const openD = openFrom !== null ? overlap(openFrom, todayN, ps, pe) : 0;
          if (openD) x.npdIncomplete = true;
          x.npd += bfD - prod - openD;
          if (r.firstServiceDate) {
            const ms = Math.max(U.d2n(r.firstServiceDate), bn);
            if (ms <= pe) {
              let mprod = 0;
              for (const [s1, e1] of prodIv) mprod += overlap(s1, e1, ms, pe);
              x.npdMbf += (pe - ms + 1) - mprod - (openFrom !== null ? overlap(openFrom, todayN, ms, pe) : 0);
            }
          }
        }
        if (U.inRange(entry, b, e)) {
          x.entered++;
          if (!(Number(a.entryParity) > 0)) x.giltsEntered++;
          if (a.arrivalDate && r.entryDate && a.arrivalDate <= r.entryDate) x.arrivalToEntry.push(U.diff(r.entryDate, a.arrivalDate));
        }
        if (r.removed && U.inRange(r.removedDate, b, e)) {
          if (r.removalKind === 'death') x.died++; else if (r.removalKind === 'sold') x.sold++; else { x.culled++; x.culledParitySum += parE; }
          x.removedParities.push(parE);
          const lifeWeaned = r.litters.reduce((n, l) => n + (l.weaned || 0), 0);
          x.removedBF.push(lifeWeaned);
          if (r.firstServiceDate) x.removedMBF.push(lifeWeaned);
        }
        if (r.firstServiceDate && U.inRange(r.firstServiceDate, b, e) && r.entryDate) x.entryToService.push(U.diff(r.firstServiceDate, r.entryDate));
      }
      for (const s of r.services) {
        if (pp(s.parity) && U.inRange(s.date, U.addDays(b, -gest - 30), e)) x.frServices.push({ date: s.date, outcome: s.outcome, reason: s.outcome === 'removed' ? r.removalReason : '' });
        if (s.outcome === 'pending' && U.inRange(s.date, U.addDays(b, -gest - 10), e) && pp(s.parity)) x.npdIncomplete = true;
        if (!U.inRange(s.date, b, e) || !pp(s.parity)) continue;
        x.services++;
        x.matings += s.matings;
        (s.methods || []).forEach((m) => { if (/natural/i.test(m)) x.natMatings++; if (/AI/.test(m)) x.aiMatings++; });
        if (s.matings > 1) x.multipleSvc++;
        if (new Set(s.boars).size > 1) x.mixedSvc++;
        const nat = (s.methods || []).some((m) => /natural/i.test(m)); const ai = (s.methods || []).some((m) => /AI/.test(m));
        if (nat && ai) x.mixMethod++; else if (nat) x.pureNat++; else if (ai) x.pureAI++;
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
          x.farrowedParitySum += l.parity;
          if (l.birthWeight) { x.birthWt.push(l.birthWeight); x.birthWtLiveBorn += l.liveBorn; }
          if (l.prevFarrowDate) x.farrowIntervals.push(U.diff(l.farrowDate, l.prevFarrowDate));
        }
        if (l.weanDate && l.lactLen !== null && U.inRange(l.weanDate, b, e) && pp(l.parity)) {
          x.littersWeaned++;
          x.lactLens.push(l.lactLen);
          if (l.weanWeightCount) { x.weanWt += l.weanWeight; x.weanWtPigs += l.weanWeightCount; x.weanWtLitters++; }
          x.liveBornWeaned += l.liveBorn;
          x.litterPigsWeaned += l.weaned || 0;
          x.netFostered += (l.fosterIn || 0) - (l.fosterOut || 0);
          if (l.nurse) { x.nurseWeaned++; x.nursedPigs += l.fosterIn || 0; }
          if ((l.fosterIn || 0) + (l.fosterOut || 0) + (l.partWeaned || 0) > 0) x.disrupted++;
        }
      }
      // event-dated piglet flows
      let par = Number(a.entryParity) || 0;
      for (const ev of r.events) {
        if (ev.type === 'farrow') par++;
        if (!U.inRange(ev.date, b, e) || !pp(par)) continue;
        if (ev.type === 'pigdeath') x.deaths += Number(ev.count) || 0;
        else if (ev.type === 'wean' || ev.type === 'partwean') { x.pigsWeaned += Number(ev.count) || 0; if (ev.type === 'wean') x.weanEvents++; }
        else if (ev.type === 'abort') x.abortEvents++;
        else if (ev.type === 'preg' && ev.result === '-') x.pregNeg++;
      }
    }
    x.avgBF = x.bfDays / days;
    x.avgMBF = x.mbfDays / days;
    x.avgProsp = x.prospDays / days;
    // PigWIN: average herd gestation length of the period (fallback: the farm setting)
    x.ahgl = x.gestLens.length ? Math.round(U.avg(x.gestLens)) : gest;
    // Served to farrow this period: services made one gestation length before the period that did not
    // farrow, plus every farrowing in the period (whenever its service was)
    const wb = U.addDays(b, -x.ahgl); const we = U.addDays(e, -x.ahgl);
    const notFarrowed = x.frServices.filter((s) => U.inRange(s.date, wb, we) && s.outcome !== 'farrow');
    x.servedToFarrow = x.litters + notFarrowed.length;
    x.frOpen = notFarrowed.filter((s) => s.outcome === 'pending').length;
    // removed while served for a reason that is not reproductive: no chance to farrow
    const REPRO = /abort|fail|fertil|conceiv|not pregnant|not in pig|preg|negative|mummif|dead litter|open|return|heat/i;
    x.frNoChance = notFarrowed.filter((s) => s.outcome === 'removed' && !REPRO.test(s.reason || '')).length;
    // PigWIN's piglet figures are per litter weaned in the period
    x.pwmBase = x.liveBornWeaned + x.netFostered;
    x.yearFactor = 365 / days;
    return x;
  }

  const n1 = (v) => U.num(v, 1); const n2 = (v) => U.num(v, 2); const n0 = (v) => U.num(v, 0);
  const div = (a, b) => (b ? a / b : NaN);

  const sum = (arr) => arr.reduce((t, v) => t + v, 0);
  const yr = (x, v, base) => div(v, base) * x.yearFactor;
  const short = (x) => x.days < 28;

  /** Herd performance indicators, named as in PigWIN. `target` refers to Settings → Targets. */
  const METRICS = [
    // inventory and herd turnover
    { id: 'days', label: 'Days in period', f: n0, v: (x) => x.days },
    { id: 'beginBF', label: 'Beginning breeding female inventory', f: n0, v: (x) => x.beginBF },
    { id: 'endBF', label: 'Ending breeding female inventory', f: n0, v: (x) => x.endBF },
    { id: 'endBoars', label: 'Ending boar inventory', f: n0, v: (x) => x.endBoars },
    { id: 'bfBoar', label: 'Breeding female: boar ratio', f: n1, v: (x) => div(x.endBF, x.endBoars) },
    { id: 'arrEntry', label: 'Avg. arrival to entry interval', f: n1, v: (x) => U.avg(x.arrivalToEntry) },
    { id: 'endProsp', label: 'Ending prospective BF inventory', f: n0, v: (x) => x.endProsp },
    { id: 'arrAge', label: 'Avg. age at arrival', f: n1, v: (x) => U.avg(x.arrivalAges) },
    { id: 'avgProsp', label: 'Avg. prospective BF inventory', f: n1, v: (x) => x.avgProsp },
    { id: 'avgUnmated', label: 'Avg. unmated bdg female inventory', f: n1, v: (x) => x.avgBF - x.avgMBF },
    { id: 'avgMBF', label: 'Avg. mated breeding female inventory', f: n1, v: (x) => x.avgMBF },
    { id: 'avgBF', label: 'Avg. breeding female inventory', f: n1, v: (x) => x.avgBF },
    { id: 'entered', label: 'Breeding females entered', f: n0, v: (x) => x.entered },
    { id: 'entryRate', hideShaded: true, label: 'Breeding female entry rate', f: n1, v: (x) => yr(x, x.entered, x.avgBF) * 100, shade: short },
    { id: 'sumEntrySvc', label: 'Sum days to first service', f: n0, v: (x) => sum(x.entryToService) },
    { id: 'firstServed', label: 'Number of bdg females first served', f: n0, v: (x) => x.entryToService.length },
    { id: 'entrySvc', label: 'Avg. entry to first service interval', f: n1, v: (x) => U.avg(x.entryToService) },
    { id: 'culled', label: 'Breeding females culled', f: n0, v: (x) => x.culled + x.sold },
    { id: 'cullRate', hideShaded: true, label: 'Breeding female culling rate', f: n1, v: (x) => yr(x, x.culled + x.sold, x.avgBF) * 100, shade: short, target: 'cullRate', lower: true },
    { id: 'died', label: 'Breeding female deaths', f: n0, v: (x) => x.died },
    { id: 'mortRate', hideShaded: true, label: 'Breeding female mortality rate', f: n1, v: (x) => yr(x, x.died, x.avgBF) * 100, shade: short, target: 'mortRate', lower: true },
    { id: 'removed', label: 'Sum of all breeding females removed', f: n0, v: (x) => x.culled + x.sold + x.died },
    { id: 'removalRate', hideShaded: true, label: 'Breeding female removal rate', f: n1, v: (x) => yr(x, x.culled + x.sold + x.died, x.avgBF) * 100, shade: short },
    { id: 'sumParCulled', label: 'Sum parity for bdg females culled', f: n0, v: (x) => x.culledParitySum },
    { id: 'parCulled', label: 'Avg. parity for bdg females culled', f: n2, v: (x) => div(x.culledParitySum, x.culled) },
    { id: 'sumParInv', label: 'Sum parity for bdg female inventory', f: n0, v: (x) => x.endParitySum },
    { id: 'avgPar', label: 'Avg. parity for bdg female inventory', f: n2, v: (x) => div(x.endParitySum, x.endBF) },
    // mating
    { id: 'services', label: 'Total number of services', f: n0, v: (x) => x.services },
    { id: 'repeatSvc', label: 'Number of repeat services', f: n0, v: (x) => x.repeatServices },
    { id: 'repeatPct', label: '% Repeat services', f: n1, v: (x) => U.pct(x.repeatServices, x.services), target: 'repeatPct', lower: true },
    { id: 'multiSvc', label: 'Number of multiple matings', f: n0, v: (x) => x.multipleSvc },
    { id: 'multiPct', label: '% Multiple matings', f: n1, v: (x) => U.pct(x.multipleSvc, x.services) },
    { id: 'sumWsi', label: 'Sum days weaning to first service', f: n0, v: (x) => sum(x.wsi) },
    { id: 'wsiCount', label: 'Sow count for first service interval', f: n0, v: (x) => x.wsi.length },
    { id: 'wsi', label: 'Weaning to first service interval', f: n1, v: (x) => U.avg(x.wsi), target: 'wsi', lower: true },
    { id: 'bred7', label: 'Breeding females bred by 7 days', f: n0, v: (x) => x.wsiWithin7 },
    { id: 'wsi7', label: '% Breeding females bred by 7 days', f: n1, v: (x) => U.pct(x.wsiWithin7, x.wsi.length) },
    { id: 'matings', label: 'Overall number of matings', f: n0, v: (x) => x.matings },
    { id: 'natPct', label: '% Natural boar matings', f: n1, v: (x) => U.pct(x.natMatings, x.aiMatings + x.natMatings) },
    { id: 'aiPct', label: '% Artificial inseminations', f: n1, v: (x) => U.pct(x.aiMatings, x.aiMatings + x.natMatings) },
    { id: 'pureNatPct', label: '% Pure natural services', f: n1, v: (x) => U.pct(x.pureNat, x.services) },
    { id: 'pureAiPct', label: '% Pure AI services', f: n1, v: (x) => U.pct(x.pureAI, x.services) },
    { id: 'mixedPct', label: '% Mixed services', f: n1, v: (x) => U.pct(x.mixMethod, x.services) },
    { id: 'openMbf', label: 'All open MBF', f: n0, v: (x) => x.endOpenMbf },
    { id: 'avgOpenMbf', label: 'Avg. open MBF', f: n1, v: (x) => x.npdMbf / x.days },
    // farrowing
    { id: 'litters', label: 'Number of breeding females farrowed', f: n0, v: (x) => x.litters },
    { id: 'totalBorn', label: 'Total pigs born', f: n0, v: (x) => x.totalBorn },
    { id: 'tb', label: 'Avg. total born / birth litter', f: n1, v: (x) => div(x.totalBorn, x.litters), target: 'totalBorn' },
    { id: 'bornAlive', label: 'Total born alive', f: n0, v: (x) => x.bornAlive },
    { id: 'ba', label: 'Avg. born alive / birth litter', f: n1, v: (x) => div(x.bornAlive, x.litters), target: 'bornAlive' },
    { id: 'stillborn', label: 'Total stillborn pigs', f: n0, v: (x) => x.stillborn },
    { id: 'sbLitter', label: 'Avg. stillborn pigs / birth litter', f: n2, v: (x) => div(x.stillborn, x.litters) },
    { id: 'sbPct', label: '% Still born pigs', f: n1, v: (x) => U.pct(x.stillborn, x.totalBorn) },
    { id: 'mummies', label: 'Total pigs born mummified', f: n0, v: (x) => x.mummies },
    { id: 'mmLitter', label: 'Avg. pigs born mummified/birth litter', f: n2, v: (x) => div(x.mummies, x.litters) },
    { id: 'mmPct', label: '% Pigs born mummified', f: n1, v: (x) => U.pct(x.mummies, x.totalBorn) },
    { id: 'sumParFarrowed', label: 'Sum parity for bdg females farrowed', f: n0, v: (x) => x.farrowedParitySum },
    { id: 'parFarrowed', label: 'Avg. parity for bdg females farrowed', f: n2, v: (x) => div(x.farrowedParitySum, x.litters) },
    { id: 'bwLitters', label: 'Litters farrowed with birth weights', f: n0, v: (x) => x.birthWt.length },
    { id: 'bwSum', label: 'Sum of all litter birth weights', f: n1, v: (x) => sum(x.birthWt) },
    { id: 'birthWt', label: 'Avg. birth litter weight', f: n1, v: (x) => U.avg(x.birthWt) },
    { id: 'bwPigs', label: 'Live born pigs with birth weights', f: n0, v: (x) => x.birthWtLiveBorn },
    { id: 'bwPig', label: 'Avg. birth weight / live born pig', f: n2, v: (x) => div(sum(x.birthWt), x.birthWtLiveBorn) },
    { id: 'weanedPerFarrowed', label: 'Pigs weaned per sow farrowed', f: n1, v: (x) => div(x.pigsWeaned, x.litters) },
    { id: 'small', label: '% Litters farrowed with  < 7 born alive', f: n1, v: (x) => U.pct(x.small, x.litters) },
    // weaning
    { id: 'littersWeaned', label: 'Number of breeding females weaned', f: n0, v: (x) => x.littersWeaned },
    { id: 'litterPigsWeaned', label: 'Total weaned pigs', f: n0, v: (x) => x.litterPigsWeaned },
    { id: 'pigsWeaned', label: 'Total weaned pigs (part wean basis)', f: n0, v: (x) => x.pigsWeaned },
    { id: 'liveBornWeaned', label: 'Live born pigs of bdg females weaned', f: n0, v: (x) => x.liveBornWeaned },
    { id: 'deaths', label: 'Total recorded pig deaths', f: n0, v: (x) => x.deaths },
    { id: 'pwm', label: '% Pre-weaning mortality (time period)', f: n1, v: (x) => U.pct(x.pwmBase - x.litterPigsWeaned, x.pwmBase), target: 'pwm', lower: true },
    { id: 'weanEvents', label: 'No. of litters weaned (incl. nurse)', f: n0, v: (x) => x.weanEvents },
    { id: 'weanLitter', label: 'Avg. weaned pigs / wean litter', f: n1, v: (x) => div(x.litterPigsWeaned, x.littersWeaned), target: 'weanedLitter' },
    { id: 'weanLitterNurse', label: 'Pigs weaned per litter weaned (incl.nurse)', f: n1, v: (x) => div(x.pigsWeaned, x.weanEvents) },
    { id: 'nurseWeaned', label: 'Number of nurse bdg females weaned', f: n0, v: (x) => x.nurseWeaned },
    { id: 'nursedPigs', label: 'Total pigs nursed of BF weaned', f: n0, v: (x) => x.nursedPigs },
    { id: 'netFostered', label: 'Net fostered', f: n0, v: (x) => x.netFostered },
    { id: 'wwLitters', label: 'No. of litters with weaning weights', f: n0, v: (x) => x.weanWtLitters },
    { id: 'wwSum', label: 'Sum of all litter weaning weights', f: n1, v: (x) => x.weanWt },
    { id: 'wwLitter', label: 'Avg. weaning weight / wean litter', f: n1, v: (x) => div(x.weanWt, x.weanWtLitters) },
    { id: 'wtLitPct', label: '% Litters with weaning weights', f: n1, v: (x) => U.pct(x.weanWtLitters, x.littersWeaned) },
    { id: 'wwPigs', label: 'Number of pigs with weaning weights', f: n0, v: (x) => x.weanWtPigs },
    { id: 'weanWt', label: 'Avg. weaning weight / pig weaned', f: n2, v: (x) => div(x.weanWt, x.weanWtPigs) },
    { id: 'sumWeanAge', label: 'Sum of litter ages at weaning', f: n0, v: (x) => sum(x.lactLens) },
    { id: 'weanAge', label: 'Avg. weaning age', f: n1, v: (x) => U.avg(x.lactLens) },
    { id: 'lifeWeanedMbf', label: 'Lifetime pigs weaned / MBF removed', f: n1, v: (x) => U.avg(x.removedMBF) },
    { id: 'lifeWeanedBf', label: 'Lifetime pigs weaned / BF removed', f: n1, v: (x) => U.avg(x.removedBF) },
    { id: 'disruptedPct', label: '% Disrupted litters weaned in period', f: n1, v: (x) => U.pct(x.disrupted, x.littersWeaned) },
    // reproductive cycle
    { id: 'sumGest', label: 'Sum of all gestation lengths', f: n0, v: (x) => sum(x.gestLens) },
    { id: 'gestLen', label: 'Avg. gestation length', f: n1, v: (x) => U.avg(x.gestLens) },
    { id: 'sumLact', label: 'Sum of all lactation lengths', f: n0, v: (x) => sum(x.lactLens) },
    { id: 'lact', label: 'Avg. lactation length', f: n1, v: (x) => U.avg(x.lactLens) },
    { id: 'fiCount', label: 'BF farrowed with previous farrow', f: n0, v: (x) => x.farrowIntervals.length },
    { id: 'sumFi', label: 'Sum of farrowing intervals', f: n0, v: (x) => sum(x.farrowIntervals) },
    { id: 'fi', label: 'Farrowing interval', f: n1, v: (x) => U.avg(x.farrowIntervals), target: 'farrowInterval', lower: true },
    { id: 'frServed', label: 'Served to farrow this period', f: n0, v: (x) => x.servedToFarrow, shade: (x) => x.frOpen > 0 },
    { id: 'fr', hideShaded: short, label: 'Farrowing rate', f: n1, v: (x) => U.pct(x.litters, x.servedToFarrow), shade: (x) => short(x) || x.frOpen > 0, target: 'farrowRate' },
    { id: 'frAdj', hideShaded: short, label: 'Adjusted farrowing rate', f: n1, v: (x) => U.pct(x.litters, x.servedToFarrow - x.frNoChance), shade: (x) => short(x) || x.frOpen > 0 },
    { id: 'bfDays', label: 'Total breeding female days', f: n0, v: (x) => x.bfDays },
    { id: 'unmatedDays', label: 'Unmated breeding female days', f: n0, v: (x) => x.bfDays - x.mbfDays },
    { id: 'mbfDays', label: 'Mated breeding female days', f: n0, v: (x) => x.mbfDays },
    { id: 'prospDays', label: 'Prospective breeding female days', f: n0, v: (x) => x.prospDays },
    { id: 'gestDays', label: 'Gestation days', f: n0, v: (x) => x.gestDays },
    { id: 'lactDays', label: 'Lactation days', f: n0, v: (x) => x.lactDays },
    { id: 'prodDays', label: 'Productive breeding female days', f: n0, v: (x) => x.gestDays + x.lactDays },
    { id: 'npdDays', label: 'Non-productive breeding female days', f: n0, v: (x) => x.npd, shade: (x) => x.npdIncomplete },
    { id: 'npd', label: 'Avg. non-prod.days / BF / year', f: n1, v: (x) => div(x.npd, x.bfDays) * 365, shade: (x) => x.npdIncomplete, target: 'npd', lower: true },
    { id: 'prodDaysYear', label: 'Avg. productive days / BF / year', f: n1, v: (x) => div(x.gestDays + x.lactDays, x.bfDays) * 365 },
    { id: 'npdMbfDays', label: 'Non-productive MBF days', f: n0, v: (x) => x.npdMbf, shade: (x) => x.npdIncomplete },
    { id: 'npdMbf', label: 'Avg. non-prod.days / MBF / year', f: n1, v: (x) => div(x.npdMbf, x.mbfDays) * 365, shade: (x) => x.npdIncomplete },
    // PigWIN: gestation days per (mated) female day, per year, divided by the average gestation length;
    // weaned pigs = that times the average weaned per litter
    { id: 'littersMbf', hideShaded: short, label: 'Litters farrowed / MBF / year', f: n2, v: (x) => div(x.gestDays * 365, x.mbfDays) / x.ahgl, shade: (x) => short(x) || x.npdIncomplete, target: 'littersMbfYear' },
    { id: 'littersBf', hideShaded: short, label: 'Litters farrowed / BF / year', f: n2, v: (x) => div(x.gestDays * 365, x.bfDays) / x.ahgl, shade: (x) => short(x) || x.npdIncomplete },
    { id: 'weanedMbf', hideShaded: short, label: 'Weaned pigs / MBF / year', f: n1, v: (x) => div(x.litterPigsWeaned * x.gestDays, x.mbfDays * x.littersWeaned) * 365 / x.ahgl, shade: (x) => short(x) || x.npdIncomplete, target: 'weanedMbfYear' },
    { id: 'weanedBf', hideShaded: short, label: 'Weaned pigs / BF / year', f: n1, v: (x) => div(x.litterPigsWeaned * x.gestDays, x.bfDays * x.littersWeaned) * 365 / x.ahgl, shade: (x) => short(x) || x.npdIncomplete },
    // SwineOS extras (not in PigWIN's lists; on the All tab and for Custom tabs)
    { id: 'firstSvc', label: 'First services (after wean / entry)', f: n0, v: (x) => x.firstServices },
    { id: 'giltSvc', label: 'Gilts first served', f: n0, v: (x) => x.giltServices },
    { id: 'matingsSvc', label: 'Matings per service', f: n2, v: (x) => div(x.matings, x.services) },
    { id: 'multiBoarPct', label: '% Services with more than one boar', f: n1, v: (x) => U.pct(x.mixedSvc, x.services) },
    { id: 'frPending', label: 'Services with unknown outcome', f: n0, v: (x) => x.frPending },
    { id: 'returnsPct', label: 'Returns to service %', f: n1, v: (x) => U.pct(x.returns + x.negs, x.frDone), shade: (x) => x.frPending > 0 },
    { id: 'frByService', label: 'Farrowing rate (services made in the period)', f: n1, v: (x) => U.pct(x.frFarrowed, x.frDone), shade: (x) => x.frPending > 0 },
    { id: 'pigDeathsNet', label: 'Piglet losses incl. difference at weaning', f: n0, v: (x) => x.pwmBase - x.litterPigsWeaned },
    { id: 'aborts', label: 'Abortions', f: n0, v: (x) => x.abortEvents },
    { id: 'pregNeg', label: 'Negative pregnancy checks', f: n0, v: (x) => x.pregNeg },
    { id: 'giltLitters', label: 'Gilt litters (parity 1) %', f: n1, v: (x) => U.pct(x.giltLitters, x.litters) },
    { id: 'giltsEntered', label: 'Gilts entered', f: n0, v: (x) => x.giltsEntered },
    { id: 'replRate', hideShaded: true, label: 'Gilt replacement rate', f: n1, v: (x) => yr(x, x.giltsEntered, x.avgBF) * 100, shade: short },
    { id: 'remPar', label: 'Avg. parity of removed females', f: n2, v: (x) => U.avg(x.removedParities) },
    { id: 'gestFemales', label: 'Ending gestating females', f: n0, v: (x) => x.endServed },
    { id: 'lactFemales', label: 'Ending lactating females', f: n0, v: (x) => x.endLactating },
    { id: 'openFemales', label: 'Ending open females (incl. gilts)', f: n0, v: (x) => x.endOpen + x.endGilts },
  ];
  const BY_ID = new Map(METRICS.map((m) => [m.id, m]));

  /** Which indicators each tab shows, in PigWIN's order. */
  const LAYOUT = {
    K: ['endBF', 'endBoars', 'weanedMbf', 'weanedBf', 'littersMbf', 'littersBf', 'tb', 'ba', 'weanLitter', 'pwm', 'fi', 'fr', 'wsi', 'npd', 'cullRate', 'mortRate', 'avgPar'],
    M: ['services', 'repeatSvc', 'repeatPct', 'multiSvc', 'multiPct', 'sumWsi', 'wsiCount', 'wsi', 'bred7', 'wsi7', 'matings', 'natPct', 'aiPct', 'pureNatPct', 'pureAiPct', 'mixedPct', 'openMbf', 'avgOpenMbf'],
    F: ['litters', 'totalBorn', 'tb', 'bornAlive', 'ba', 'stillborn', 'sbLitter', 'sbPct', 'mummies', 'mmLitter', 'mmPct', 'sumParFarrowed', 'parFarrowed', 'bwLitters', 'bwSum', 'birthWt', 'bwPigs', 'bwPig', 'weanedPerFarrowed', 'small'],
    W: ['littersWeaned', 'litterPigsWeaned', 'pigsWeaned', 'liveBornWeaned', 'deaths', 'pwm', 'weanEvents', 'weanLitter', 'weanLitterNurse', 'nurseWeaned', 'nursedPigs', 'netFostered', 'wwLitters', 'wwSum', 'wwLitter', 'wtLitPct', 'wwPigs', 'weanWt', 'sumWeanAge', 'weanAge', 'lifeWeanedMbf', 'lifeWeanedBf', 'disruptedPct'],
    R: ['sumGest', 'gestLen', 'sumLact', 'lact', 'fiCount', 'sumFi', 'fi', 'frServed', 'fr', 'frAdj', 'bfDays', 'unmatedDays', 'mbfDays', 'prospDays', 'gestDays', 'lactDays', 'prodDays', 'npdDays', 'npd', 'prodDaysYear', 'npdMbfDays', 'npdMbf', 'littersMbf', 'littersBf', 'weanedMbf', 'weanedBf'],
    T: ['days', 'beginBF', 'endBF', 'endBoars', 'bfBoar', 'arrEntry', 'endProsp', 'arrAge', 'avgProsp', 'avgUnmated', 'avgMBF', 'avgBF', 'entered', 'entryRate', 'sumEntrySvc', 'firstServed', 'entrySvc', 'culled', 'cullRate', 'died', 'mortRate', 'removed', 'removalRate', 'sumParCulled', 'parCulled', 'sumParInv', 'avgPar'],
  };
  // All: the Key indicators, then each tab in turn, then the SwineOS extras
  LAYOUT.A = [...new Set([...LAYOUT.K, ...LAYOUT.M, ...LAYOUT.F, ...LAYOUT.W, ...LAYOUT.R, ...LAYOUT.T, ...METRICS.map((m) => m.id)])];
  for (const m of METRICS) m.tabs = Object.keys(LAYOUT).filter((t) => t !== 'A' && LAYOUT[t].includes(m.id)).join('');

  const TABS = [
    ['K', 'Key'], ['A', 'All'], ['M', 'Mating'], ['F', 'Farrowing'], ['W', 'Weaning'], ['R', 'Reproductive cycle'], ['T', 'Herd turnover'], ['C1', 'Custom 1'], ['C2', 'Custom 2'],
  ];
  /** Indicators shown on a tab: user sets (Settings) override the built-in Key list. */
  function metricsFor(tab) {
    const sets = (S.store.settings && S.store.settings.hpSets) || {};
    if (sets[tab] && sets[tab].length && tab !== 'A') return sets[tab].map((id) => BY_ID.get(id)).filter(Boolean);
    if (tab === 'C1' || tab === 'C2') return [];
    return (LAYOUT[tab] || LAYOUT.K).map((id) => BY_ID.get(id));
  }

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

  S.calc = { LAYOUT, metricsFor, collect, periodStats, periods, METRICS, TABS, litterRecords, LITTER_FIELDS, productive, overlap };
})(window.SOS);
