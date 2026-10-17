/* SwineOS – example herd generator (clearly marked as demo data). */
(function (S) {
  'use strict';
  const U = S.U;

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function generate(opts = {}) {
    const R = rng(opts.seed || 1042301);
    const rand = (a, b) => a + Math.floor(R() * (b - a + 1));
    const norm = (m, sd) => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const st = S.DEFAULT_SETTINGS;
    const today = U.today();
    const todayN = U.d2n(today);
    const startN = todayN - 900;
    const target = opts.size || 476;
    const animals = [];
    let seq = 0;
    let nextTag = 1001;

    // Boars
    const boars = [];
    for (let i = 41; i <= 80; i++) {
      const arrN = startN + Math.floor((i - 41) * 22) - 60;
      const b = { uid: U.uid('b'), id: 'B' + i, sex: 'M', breed: pick(['Duroc', 'Duroc', 'Pietrain', 'Hampshire']), birthDate: U.n2d(arrN - 235), arrivalDate: U.n2d(arrN), entryDate: U.n2d(arrN + 30), location: 'Boar barn', events: [] };
      if (arrN + 700 < todayN && i < 66) b.events.push({ eid: U.uid('e'), seq: seq++, type: 'remove', date: U.n2d(arrN + rand(600, 760)), kind: 'cull', reason: 'Old age / parity' });
      boars.push(b);
      animals.push(b);
    }
    const activeBoars = (n) => boars.filter((b) => U.d2n(b.entryDate) <= n && !b.events.some((e) => e.type === 'remove' && U.d2n(e.date) <= n)).map((b) => b.id);

    function simulate(sow, startPhaseN, parity) {
      const ev = (type, n, extra) => { if (n <= todayN) sow.events.push({ eid: U.uid('e'), seq: seq++, type, date: U.n2d(n), ...extra }); return n <= todayN; };
      let n = startPhaseN;
      let p = parity;
      let open = true;
      let returns = 0;
      while (n <= todayN) {
        // service
        if (open) n += p === 0 && returns === 0 ? rand(5, 40) : (R() < 0.85 ? rand(3, 6) : rand(7, 25));
        open = false;
        const bs = activeBoars(n);
        const nm = R() < 0.75 ? 2 : (R() < 0.6 ? 3 : 1);
        for (let k = 0; k < nm; k++) if (!ev('mate', n + k, { boar: pick(bs.length ? bs : ['B41']), tech: pick(['Tech 1', 'Tech 2']) })) return;
        const svcN = n;
        const o = R();
        if (o < 0.055) { // return
          n = svcN + rand(19, 23); if (!ev('heat', n, {})) return; returns++; open = false; n -= rand(0, 1); continue;
        }
        if (o < 0.09) { // negative preg check
          ev('preg', svcN + rand(27, 35), { result: '-', method: 'Ultrasound' });
          n = svcN + rand(30, 38); returns++; continue;
        }
        if (o < 0.10) { // abortion
          if (!ev('preg', svcN + 28, { result: '+', method: 'Ultrasound' })) return;
          n = svcN + rand(40, 100); if (!ev('abort', n, {})) return; returns++; n += rand(0, 4); continue;
        }
        if (o < 0.115) { // culled not pregnant
          if (!ev('preg', svcN + 30, { result: '-', method: 'Ultrasound' })) return;
          ev('remove', svcN + rand(32, 45), { kind: 'cull', reason: 'Not pregnant' });
          return 'removed';
        }
        if (o < 0.12) { ev('remove', svcN + rand(40, 100), { kind: 'death', reason: pick(['Sudden death', 'Torsion', 'Prolapse', 'Unknown']) }); return 'removed'; }
        if (!ev('preg', svcN + 28, { result: '+', method: 'Ultrasound' })) return;
        if (R() < 0.04) ev('disease', svcN + rand(30, 100), { disease: pick(['Lameness', 'Abscess', 'Vulva discharge']), treatment: pick(['Penicillin', 'Meloxicam', 'Oxytetracycline']), dose: '10 ml' });
        // farrow
        const fN = svcN + Math.round(norm(115.5, 1.4));
        const loc = pick(['Farr 1', 'Farr 2', 'Farr 3', 'Farr 4']);
        if (!ev('location', fN - rand(3, 6), { location: loc })) return;
        const mean = p === 0 ? 14.2 : p <= 4 ? 15.8 : p <= 6 ? 15.2 : 14.0;
        const tb = Math.max(3, Math.round(norm(mean, 3.4)));
        const sb = Math.min(tb - 1, Math.max(0, Math.round(norm(tb * 0.065, 1))));
        const mm = Math.min(tb - sb - 1, R() < 0.3 ? rand(1, 2) : 0);
        const lb = tb - sb - mm;
        if (!ev('farrow', fN, { liveBorn: lb, stillborn: sb, mummies: mm, location: loc, birthWeight: Math.round(lb * norm(1.38, 0.12) * 10) / 10 })) return;
        p++;
        // fostering to even up litters around 14
        let pigs = lb;
        const fd = fN + rand(1, 2);
        if (pigs > 15) { const k = pigs - 14; if (!ev('foster', fd, { count: -k, otherSow: '' })) return; pigs -= k; } else if (pigs < 12) { const k = rand(1, 13 - pigs); if (!ev('foster', fd, { count: k, otherSow: '' })) return; pigs += k; }
        // deaths during lactation
        const lact = rand(18, 24);
        const wN = fN + lact;
        let dead = 0;
        for (let i = 0; i < pigs; i++) if (R() < 0.105) dead++;
        let left = dead;
        while (left > 0) {
          const k = Math.min(left, rand(1, 2));
          const dd = fN + Math.min(lact - 1, Math.floor(Math.abs(norm(0, 4))) + 1);
          if (!ev('pigdeath', dd, { count: k, cause: pick(st.lists.pigDeathCauses.slice(0, 7).concat(['Crushed / laid on', 'Crushed / laid on', 'Low viability'])) })) return;
          left -= k;
        }
        const weaned = pigs - dead;
        if (R() < 0.03) ev('disease', fN + rand(1, 4), { disease: 'MMA / mastitis', treatment: pick(['Oxytocin', 'Penicillin']), dose: '5 ml' });
        if (!ev('wean', wN, { count: weaned, weight: Math.round(weaned * norm(6.3, 0.6) * 10) / 10 })) return;
        if (!ev('location', wN, { location: 'Breeding' })) return;
        n = wN; open = true; returns = 0;
        // culling after weaning
        const cullP = p === 1 ? 0.07 : p <= 4 ? 0.09 : p === 5 ? 0.18 : p === 6 ? 0.35 : 0.65;
        if (R() < cullP) {
          ev('remove', wN + rand(0, 3), { kind: R() < 0.1 ? 'sold' : 'cull', reason: p >= 6 ? 'Old age / parity' : pick(['Poor production', 'Lameness', 'Reproductive failure', 'Poor body condition', 'Udder problems']) });
          return 'removed';
        }
        if (R() < 0.01) { ev('remove', wN + rand(5, 60), { kind: 'death', reason: pick(['Sudden death', 'Lameness (euthanized)', 'Heat stress']) }); return 'removed'; }
      }
      return 'active';
    }

    function newSow(arrN, parity, phaseN, purchased) {
      const ageAtArr = parity ? 200 + parity * 150 : rand(165, 185);
      const sow = {
        uid: U.uid('s'), id: String(nextTag++), sex: 'F', breed: 'F1 (LxY)', birthDate: U.n2d(arrN - ageAtArr),
        arrivalDate: U.n2d(arrN), entryDate: U.n2d(arrN), entryParity: purchased ? parity : 0, location: parity ? 'Breeding' : 'Gilt pen', events: [],
      };
      animals.push(sow);
      const res = simulate(sow, phaseN, parity);
      const rem = sow.events.find((e) => e.type === 'remove');
      if (res === 'removed' && rem) {
        const rn = U.d2n(rem.date);
        // replacement gilt
        const gArr = rn - rand(20, 50);
        newSow(Math.max(startN, gArr), 0, Math.max(startN, gArr) + rand(35, 60), false);
      }
    }

    for (let i = 0; i < target; i++) {
      const parity = Math.min(6, Math.floor(Math.abs(norm(0, 2.6))));
      newSow(startN - 10, parity, startN + rand(0, 140), true);
    }
    // a few unserved gilts currently in the gilt pool
    for (let i = 0; i < 18; i++) {
      const arr = todayN - rand(5, 60);
      animals.push({ uid: U.uid('s'), id: String(nextTag++), sex: 'F', breed: 'F1 (LxY)', birthDate: U.n2d(arr - rand(165, 185)), arrivalDate: U.n2d(arr), entryDate: U.n2d(arr), entryParity: 0, location: 'Gilt pen', events: [] });
    }
    return animals;
  }

  S.demo = { generate };
})(window.SOS);
