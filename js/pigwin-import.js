/* SwineOS – import a PigWIN farm backup (.BDR).
 * A .BDR file is a zip of Paradox database tables. This reads the zip and the
 * tables in the browser and converts animals and their events to SwineOS records.
 * Works in browsers and in Node 18+ (uses DecompressionStream and TextDecoder). */
(function (root) {
  'use strict';

  /* ---------------- zip ---------------- */
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  /** Returns { NAME.DB: Uint8Array } for the wanted file names (upper case). */
  async function unzip(buf, wanted) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This file is not a PigWIN backup (no zip directory found).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    const dec = new TextDecoder('latin1');
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true); const xlen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true);
      const loff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).toUpperCase().split(/[\\/]/).pop();
      p += 46 + nlen + xlen + clen;
      if (wanted && !wanted.includes(name)) continue;
      const lnl = dv.getUint16(loff + 26, true); const lxl = dv.getUint16(loff + 28, true);
      const data = u8.subarray(loff + 30 + lnl + lxl, loff + 30 + lnl + lxl + csize);
      out[name] = method === 0 ? data : await inflateRaw(data);
    }
    return out;
  }

  /* ---------------- Paradox tables ---------------- */
  const cp1252 = new TextDecoder('windows-1252');
  function paradox(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const rs = dv.getUint16(0, true); const hs = dv.getUint16(2, true);
    const bkb = u8[5]; const first = dv.getUint16(14, true);
    const nf = dv.getUint16(0x21, true); const ver = u8[0x39];
    const off = ver >= 5 ? 0x78 : 0x58;
    const types = []; for (let i = 0; i < nf; i++) types.push([u8[off + 2 * i], u8[off + 2 * i + 1]]);
    let p = off + 2 * nf + 4 + 4 * nf + (ver >= 12 ? 261 : 79);
    const names = [];
    for (let i = 0; i < nf; i++) { let e = p; while (u8[e]) e++; names.push(cp1252.decode(u8.subarray(p, e))); p = e + 1; }
    const bs = bkb * 1024; const rows = []; const seen = new Set();
    let blk = first;
    while (blk && !seen.has(blk)) {
      seen.add(blk);
      const base = hs + (blk - 1) * bs;
      if (base + 6 > u8.length) break;
      const next = dv.getUint16(base, true); const add = dv.getInt16(base + 4, true);
      const n = add >= 0 ? Math.floor(add / rs) + 1 : 0;
      for (let r = 0; r < n; r++) {
        let q = base + 6 + r * rs; const rec = {};
        for (let f = 0; f < nf; f++) { const [t, sz] = types[f]; rec[names[f]] = field(u8, dv, q, t, sz); q += sz; }
        rows.push(rec);
      }
      blk = next;
    }
    return rows;
  }
  const ORD1970 = 719163; // Paradox dates count days from Jan 1, year 1 (= day 1); Jan 1 1970 is day 719163
  function field(u8, dv, q, t, sz) {
    if (t === 1) { let e = q; const end = q + sz; while (e < end && u8[e]) e++; return cp1252.decode(u8.subarray(q, e)).trimEnd() || null; }
    let zero = true; for (let i = 0; i < sz; i++) if (u8[q + i]) { zero = false; break; }
    if (zero) return null;
    if (t === 2 || t === 3 || t === 4 || t === 0x16) {
      let raw = 0; for (let i = 0; i < sz; i++) raw = raw * 256 + u8[q + i];
      const bits = 8 * sz; const half = 2 ** (bits - 1);
      let v = raw >= half ? raw - half : raw + half; if (v >= half) v -= 2 * half;
      if (t === 2) return new Date((v - ORD1970) * 86400000).toISOString().slice(0, 10);
      return v;
    }
    if (t === 5 || t === 6) {
      const b = u8.slice(q, q + 8);
      if (b[0] & 0x80) b[0] &= 0x7f; else for (let i = 0; i < 8; i++) b[i] ^= 0xff;
      return new DataView(b.buffer).getFloat64(0, false);
    }
    if (t === 9) return u8[q] === 0x81 ? true : u8[q] === 0x80 ? false : null;
    if (t === 0x14) { let raw = 0; for (let i = 0; i < 4; i++) raw = raw * 256 + u8[q + i]; return raw - 2 ** 31; }
    return null;
  }

  /* ---------------- conversion ---------------- */
  const TABLES = ['BASISVKN.DB', 'BEDREIGENVKN.DB', 'AANAFVOERVKN.DB', 'DEKKEN.DB', 'WERPEN.DB', 'SPENEN.DB', 'UITVAL.DB', 'OVERLEGGEN.DB',
    'DRACHTIG.DB', 'OPMERKINGEN.DB', 'DGRCODELIJST.DB', 'RASSENVKN.DB', 'RELATIE.DB', 'OMNUMMEREN.DB', 'COMMENTVKN.DB', 'BASVARZG.DB', 'CONDITIE.DB'];
  // event order on the same day
  const ORDER = { editid: 0, preg: 1, abort: 2, farrow: 3, foster: 4, pigdeath: 5, partwean: 6, wean: 7, location: 8, heat: 9, mate: 10, condition: 11, remove: 12 };

  function convert(t, opts = {}) {
    const by = (rows, key) => { const m = new Map(); for (const r of rows || []) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
    const dgr = new Map((t['DGRCODELIJST.DB'] || []).map((r) => [r.RefDgr, (r.Oms || '').trim()]));
    const breeds = new Map((t['RASSENVKN.DB'] || []).map((r) => [r.RefRas, r.RasOms]));
    const rel = new Map((t['RELATIE.DB'] || []).map((r) => [r.RelNum, r.Nam]));
    const base = new Map((t['BASISVKN.DB'] || []).map((r) => [r.RefVkn, r]));
    const own = t['BEDREIGENVKN.DB'] || [];
    const idOf = new Map(own.map((r) => [r.RefVkn, r.VknNum || (base.get(r.RefVkn) || {}).Nam || String(r.RefVkn)]));
    // remarks attached to events (removal reasons, piglet death causes, farrowing notes)
    const remarkByEvent = new Map();
    for (const o of t['OPMERKINGEN.DB'] || []) {
      if (o.RefGbrCat == null) continue;
      const txt = dgr.get(o.RefDgr__1);
      if (txt) remarkByEvent.set(o.RefGbrCat, txt);
    }
    const arr = by(t['AANAFVOERVKN.DB'], 'RefVkn');
    const mates = by(t['DEKKEN.DB'], 'RefVkn');
    const farrows = by(t['WERPEN.DB'], 'RefVkn');
    const weans = by(t['SPENEN.DB'], 'RefVkn');
    const deaths = by(t['UITVAL.DB'], 'RefVkn');
    const fosters = by(t['OVERLEGGEN.DB'], 'RefVkn');
    const pregs = by(t['DRACHTIG.DB'], 'RefVkn');
    const renum = by(t['OMNUMMEREN.DB'], 'RefVkn');
    const comments = by(t['COMMENTVKN.DB'], 'RefVkn');
    const conds = by(t['CONDITIE.DB'], 'RefVkn');

    const lists = { cullReasons: new Set(), deathReasons: new Set(), pigDeathCauses: new Set(), technicians: new Set(), breeds: new Set() };
    const animals = [];
    let nEvents = 0;
    for (const o of own) {
      const ref = o.RefVkn; const b = base.get(ref) || {};
      const sex = b.GslCod === 2 ? 'M' : 'F';
      const breed = breeds.get(b.RefRas);
      const a = {
        uid: 'p' + ref, id: idOf.get(ref), sex, birthDate: b.GebDat || undefined,
        breed: breed && !/^(unknown|\.)$/i.test(breed) ? breed : undefined,
        entryParity: Math.max(0, (o.ErsCycNum || 1) - 1), altId: b.TatNum || b.ChpNum || undefined, responder: o.RspNum || undefined,
        name: b.Nam && b.Nam !== o.VknNum ? b.Nam : undefined, events: [], source: 'PigWIN',
      };
      if (a.breed) lists.breeds.add(a.breed);
      const ev = [];
      const push = (e) => { if (e.date) ev.push(e); };
      for (const r of arr.get(ref) || []) {
        if (r.AnvAfvCod === 21) { a.arrivalDate = r.AnvAfvDat; if (r.RelNum && rel.get(r.RelNum)) a.origin = rel.get(r.RelNum); if (r.Gew) a.arrivalWeight = r.Gew; }
        else if (r.AnvAfvCod === 78) a.entryDate = r.AnvAfvDat;
        else if (r.AnvAfvCod === 95 || r.AnvAfvCod === 97 || r.AnvAfvCod === 56) {
          const kind = r.AnvAfvCod === 97 ? 'death' : r.AnvAfvCod === 56 ? 'sold' : 'cull';
          const reason = remarkByEvent.get(r.RefGbr);
          if (reason) (kind === 'death' ? lists.deathReasons : lists.cullReasons).add(reason);
          push({ type: 'remove', date: r.AnvAfvDat, kind, reason });
        }
      }
      if (!a.entryDate) a.noEntry = true; // no herd entry recorded: not counted in breeding inventory
      if (!a.arrivalDate) a.arrivalDate = a.entryDate;
      for (const r of mates.get(ref) || []) {
        const tech = r.RelNumIns ? rel.get(r.RelNumIns) : undefined;
        if (tech) lists.technicians.add(tech);
        push({ type: 'mate', date: r.Dat, boar: r.RefVknDek ? idOf.get(r.RefVknDek) : undefined, method: r.SrtDek === 1 ? 'Natural' : 'AI', tech, _t: r.Tyd || 0 });
      }
      for (const r of pregs.get(ref) || []) push({ type: 'preg', date: r.Dat, result: '-', method: r.TstMth === 1 ? 'Not farrowed' : 'Not pregnant' });
      for (const r of farrows.get(ref) || []) {
        const lb = r.LevGebTot || 0;
        const note = remarkByEvent.get(r.RefGbr);
        push({ type: 'farrow', date: r.Dat, liveBorn: lb, stillborn: (r.DodGebVolTot || 0) + (r.DodGebOnvTot || 0), mummies: r.Mum || 0,
          birthWeight: r.GemGebGew ? Math.round(r.GemGebGew * lb * 10) / 10 : undefined, induced: note === 'Induced' ? true : undefined,
          remarks: note && note !== 'Induced' ? note : undefined });
      }
      for (const r of deaths.get(ref) || []) {
        const cause = remarkByEvent.get(r.RefGbr) || 'Unknown';
        lists.pigDeathCauses.add(cause);
        push({ type: 'pigdeath', date: r.Dat, count: r.UtvTot || 1, cause });
      }
      for (const r of fosters.get(ref) || []) {
        const n = (r.OvrTot || 0) * (r.OvrCod < 0 ? -1 : 1);
        if (n) push({ type: 'foster', date: r.Dat, count: n, otherSow: r.RefVknOvr ? idOf.get(r.RefVknOvr) : undefined });
      }
      for (const r of weans.get(ref) || []) {
        const n = r.SpnAnt || 0;
        push({ type: r.SrtVld === 0 && !r.LtsSpnDat_jn ? 'partwean' : 'wean', date: r.Dat, count: n, weight: r.GemSpnGew ? Math.round(r.GemSpnGew * n * 10) / 10 : undefined });
      }
      for (const r of conds.get(ref) || []) push({ type: 'condition', date: r.Dat, score: r.CndScr || undefined, backfat: r.SpkDkt || undefined });
      for (const r of renum.get(ref) || []) push({ type: 'editid', date: (r.DatTyd || '').slice(0, 10), oldId: r.OudVknNum, newId: r.NewVknNum });
      const rem = (comments.get(ref) || []).map((c) => c.Oms).filter((x) => x && !/missing in source farm/i.test(x));
      if (rem.length) a.remarks = [...new Set(rem)].join('; ');
      ev.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (ORDER[x.type] - ORDER[y.type]) || ((x._t || 0) - (y._t || 0))));
      let seq = 0;
      a.events = ev.map((e) => {
        const out = { eid: 'e' + (seq).toString(36), seq: seq++ };
        for (const [k, v] of Object.entries(e)) if (v !== undefined && v !== null && k !== '_t') out[k] = v;
        return out;
      });
      nEvents += a.events.length;
      if (!a.arrivalDate && a.events.length) a.arrivalDate = a.events[0].date;
      for (const k of Object.keys(a)) if (a[k] === undefined) delete a[k];
      animals.push(a);
    }
    const zg = (t['BASVARZG.DB'] || [])[0] || {};
    const farm = (t['RELATIE.DB'] || []).find((r) => r.RelNum === 1);
    return {
      animals,
      stats: { animals: animals.length, events: nEvents, active: animals.filter((a) => !a.events.some((e) => e.type === 'remove')).length },
      settings: {
        farmName: (farm && farm.Nam) || opts.farmName,
        farmNumber: opts.farmNumber,
        gestationLength: zg.GemDrgTyd || 115,
        lists: {
          cullReasons: [...lists.cullReasons].sort(), deathReasons: [...lists.deathReasons].sort(), pigDeathCauses: [...lists.pigDeathCauses].sort(),
          technicians: [''].concat([...lists.technicians].sort()), breeds: [...lists.breeds].sort(),
        },
      },
    };
  }

  /** Farm number and name from a backup file name like "01042301Veteran Colony (AB)[2020_2_3][10_18_26].BDR" */
  function parseName(fileName) {
    const m = String(fileName || '').replace(/^.*[\\/]/, '').match(/^0*(\d{5,9})\s*([^[]*)/);
    return m ? { farmNumber: m[1], farmName: m[2].replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/ AB$/, ' (AB)') || undefined } : {};
  }

  async function importBDR(buffer, fileName, onStep) {
    onStep && onStep('Unpacking backup…');
    const files = await unzip(buffer, TABLES);
    if (!files['BEDREIGENVKN.DB'] || !files['BASISVKN.DB']) throw new Error('This backup has no sow or boar tables (BEDREIGENVKN / BASISVKN). Is it a PigWIN / PigLITTER farm backup?');
    const tables = {};
    for (const name of TABLES) {
      if (!files[name]) continue;
      onStep && onStep('Reading ' + name + '…');
      await new Promise((r) => setTimeout(r, 0));
      tables[name] = paradox(files[name]);
    }
    onStep && onStep('Converting records…');
    await new Promise((r) => setTimeout(r, 0));
    return convert(tables, parseName(fileName));
  }

  const api = { importBDR, unzip, paradox, convert, parseName, TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SOS = root.SOS || {}; root.SOS.pigwin = api; }
})(typeof window !== 'undefined' ? window : globalThis);
