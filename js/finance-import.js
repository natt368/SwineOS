/* SwineOS – turn the barn's Excel workbooks into finance records.
 * Reads the "Expense & Income" workbook (sheets EXPENSE, HOGS SALES, CRIPPLES, CULL SOW & BOARS,
 * INFORMATION.SHEET, REPORT), and the MOVED TO FINISHER sheet for Herd records → Moved to finisher.
 * Columns are found by their header text, so added or moved columns do not break the import.
 * Also reads the older workbooks (2003–2007: dates written "09 2006", expense types as words such as VET or GF,
 * no INFORMATION sheet) and a combined several-year workbook with a YEAR column on every row.
 * Works in browsers and Node 18+. */
(function (root) {
  'use strict';

  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const key = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9$#]/g, '');
  const str = (v) => (v === undefined || v === null ? '' : String(typeof v === 'number' ? +v.toFixed(6) : v).trim());
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*-?[\d,]*\.?\d+\s*$/.test(v) ? Number(v.replace(/,/g, '')) : null);
  const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

  function month(v) {
    if (typeof v === 'number' && v >= 1 && v <= 12 && Number.isInteger(v)) return v;
    const i = MON.indexOf(String(v || '').trim().toUpperCase().slice(0, 3));
    return i >= 0 ? i + 1 : 0;
  }
  /** Day of the month: a number, or the older workbooks' "09 2006" (day and year). */
  function dayOf(d) {
    if (typeof d === 'string') { const x = d.trim().match(/^(\d{1,2})(?:\s+\d{2,4})?$/); return x ? +x[1] : null; }
    return num(d);
  }
  function isoDate(year, m, d) {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const day = Math.min(Math.max(1, Math.round(dayOf(d) || 1)), last);
    return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * Record ids made from a line's contents (year, kind, date, product or company, amounts), so the same line gets the
   * same id in a one-year workbook and in a combined one, whatever row it is on. Repeats of an identical line are
   * numbered. Ids from an import start with x (lines typed in SwineOS do not).
   */
  function idMaker() {
    const seen = {};
    return (year, letter, ...parts) => {
      let h1 = 0x811c9dc5;
      for (const ch of parts.map((p) => String(p ?? '')).join('|')) { h1 ^= ch.charCodeAt(0); h1 = Math.imul(h1, 16777619) >>> 0; }
      const base = `x${year}${letter}${h1.toString(36)}`;
      seen[base] = (seen[base] || 0) + 1;
      return seen[base] > 1 ? `${base}-${seen[base]}` : base;
    };
  }

  /** Header row (the one starting with MONTH) and a lookup from header text to column. */
  function header(rows, max = 40) {
    for (let r = 0; r < Math.min(rows.length, max); r++) {
      const row = rows[r] || [];
      const c = row.findIndex((v) => key(v) === 'MONTH');
      if (c >= 0) {
        const cols = {};
        row.forEach((v, i) => { const k = key(v); if (k && !(k in cols)) cols[k] = i; });
        return { row: r, cols };
      }
    }
    return null;
  }
  /** Column whose header matches one of the patterns. */
  function col(hd, ...pats) {
    for (const p of pats) for (const [k, i] of Object.entries(hd.cols)) if (p.test(k)) return i;
    return -1;
  }
  const at = (row, c) => (c >= 0 ? row[c] : undefined);

  function sheet(wb, ...names) {
    const want = names.map(key);
    return wb.sheets.find((s) => want.includes(key(s.name)));
  }

  function farmInfo(wb) {
    const info = sheet(wb, 'INFORMATION.SHEET', 'INFORMATION');
    const out = {};
    if (info) for (const row of info.rows) {
      if (!row) continue;
      row.forEach((v, i) => {
        const k = key(v);
        const next = row.slice(i + 1).find((x) => x !== undefined && x !== '');
        if (k === 'FARMNAME') out.farm = str(next);
        else if (k === 'YEAR' && num(next)) out.year = num(next);
        else if (k === 'NUMBEROFSOWS' && num(next)) out.sows = num(next);
      });
    }
    return out;
  }
  /** The year written in a sheet's title rows (e.g. "HOGS EXPENSE: 2026"), above the column headers. */
  function titleYear(s) {
    const hd = header(s.rows);
    for (const row of s.rows.slice(0, hd ? hd.row : 6)) for (const v of row || []) if (typeof v === 'number' && v >= 1990 && v <= 2100 && Number.isInteger(v)) return v;
    return null;
  }

  /** The year most dates of a sheet are written with ("09 2006"), for workbooks without an INFORMATION sheet. */
  function datesYear(s) {
    const hd = s && header(s.rows); if (!hd) return null;
    const c = col(hd, /^DATE$/); const n = {};
    for (const row of s.rows.slice(hd.row + 1)) {
      const x = typeof (row || [])[c] === 'string' && row[c].trim().match(/^\d{1,2}\s+(\d{4})$/);
      if (x) n[x[1]] = (n[x[1]] || 0) + 1;
    }
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return best ? +best[0] : null;
  }
  /** A number beside a label on the REPORT sheet (e.g. AVERAGE NUMBER OF BREEDING FEMALE). */
  function reportValue(wb, label) {
    const rep = sheet(wb, 'REPORT');
    for (const row of rep ? rep.rows : []) {
      const i = (row || []).findIndex((v) => key(v) === key(label));
      if (i >= 0) { const v = row.slice(i + 1).find((x) => typeof x === 'number'); if (v !== undefined) return v; }
    }
    return null;
  }
  /** Expense types written as words in the older workbooks -> the type codes of the later ones. */
  const TYPE_WORDS = { BOAR: 1, BOARS: 1, LIME: 2, UTIL: 3, CHOL: 4, CHOLINE: 4, MIS: 5, MISC: 5, SHAVE: 5, VET: 6, CREEP: 7, CF: 7, OIL: 8, MED: 9, DICAL: 10, PIT: 11,
    GF: 12, FLY: 13, SALT: 14, PS: 15, GILT: 16, GILTS: 16, SOW: 17, BLEND: 18, PREMIX: 18, GRAIN: 19, SOY: 20, SOYA: 20 };
  function typeCode(v) { return num(v) || TYPE_WORDS[key(v)] || 0; }

  /** Expense category codes and names from the REPORT sheet ("1 BOAR REPORT" with its unit below). */
  function reportCodes(wb) {
    const rep = sheet(wb, 'REPORT');
    const out = [];
    if (!rep) return out;
    rep.rows.forEach((row, r) => (row || []).forEach((v, c) => {
      const m = typeof v === 'string' && v.match(/^\s*(\d+)\s+(.+?)\s+REPORT\s*$/i);
      if (!m) return;
      const unit = str((rep.rows[r + 1] || [])[c]);
      out.push({ code: +m[1], name: m[2].replace(/\s+/g, ' ').trim(), unit: /^[A-Z ]+$/i.test(unit) ? unit : '' });
    }));
    return out;
  }

  function expenses(wb, year) {
    const s = sheet(wb, 'EXPENSE', 'EXPENSES');
    if (!s) return [];
    const hd = header(s.rows); if (!hd) return [];
    const y = titleYear(s) || year;
    const C = { y: col(hd, /^YEAR$/), m: hd.cols.MONTH, d: col(hd, /^DATE$/, /^DAY$/), item: col(hd, /^PRODUCT/, /^ITEM/), comp: col(hd, /^COMP/), qty: col(hd, /^AMOUNT$/, /^AMO/, /^QU/), unit: col(hd, /^UNIT$/),
      total: col(hd, /^TOTAL/), cat: col(hd, /^TYPE$/, /^CODE$/), tag: col(hd, /^TYPE#?2/) };
    const out = []; const id = idMaker();
    for (let r = hd.row + 1; r < s.rows.length; r++) {
      const row = s.rows[r]; if (!row) continue;
      const m = month(at(row, C.m)); const item = str(at(row, C.item)); const total = num(at(row, C.total));
      if (!m || !item || total === null) continue;
      const ry = num(at(row, C.y)) || y; // a combined workbook gives each row its year
      const rec = { kind: 'exp', date: isoDate(ry, m, at(row, C.d)), item, company: str(at(row, C.comp)),
        qty: round(num(at(row, C.qty)), 4), unit: str(at(row, C.unit)), total: round(total), cat: typeCode(at(row, C.cat)), tag: str(at(row, C.tag)) };
      out.push({ id: id(ry, 'e', rec.date, rec.item, rec.company, rec.qty, rec.unit, rec.total), ...rec });
    }
    return out;
  }

  const STREAMS = [
    { stream: 'hogs', id: 'h', names: ['HOGS SALES', 'HOG SALES'] },
    { stream: 'cripples', id: 'k', names: ['CRIPPLES', 'CRIPPLES & WEANERS'] },
    { stream: 'culls', id: 'c', names: ['CULL SOW & BOARS', 'CULL SOWS & BOARS', 'CULLS'] },
  ];
  function income(wb, year) {
    const out = [];
    for (const st of STREAMS) {
      const s = sheet(wb, ...st.names);
      if (!s) continue;
      const hd = header(s.rows); if (!hd) continue;
      const y = titleYear(s) || year;
      const C = { y: col(hd, /^YEAR$/), m: hd.cols.MONTH, d: col(hd, /^DATE$/), comp: col(hd, /^COMP/), unit: col(hd, /^UNIT$/), head: col(hd, /^AMO/), total: col(hd, /^CHE/, /^TOTAL\$/),
        avgWt: col(hd, /^AVEWEI/, /^AVGWEI/), totalWt: col(hd, /^TOTALWEI/), index: col(hd, /^INDEX/), price: col(hd, /^PRICE/), fat: col(hd, /^FAT/), lean: col(hd, /^LEAN$/),
        bonus: col(hd, /^HEALTH/), leanInc: col(hd, /^LEANINC/), out: col(hd, /^OUTST/) };
      const id = idMaker();
      for (let r = hd.row + 1; r < s.rows.length; r++) {
        const row = s.rows[r]; if (!row) continue;
        const m = month(at(row, C.m)); const head = num(at(row, C.head)); const total = num(at(row, C.total));
        if (!m || (head === null && total === null) || (!head && !total && !str(at(row, C.comp)))) continue;
        const ry = num(at(row, C.y)) || y;
        const rec = { kind: 'inc', stream: st.stream, date: isoDate(ry, m, at(row, C.d)), company: str(at(row, C.comp)), unit: str(at(row, C.unit)),
          head: head || 0, total: round(total || 0) };
        rec.id = id(ry, st.id, rec.date, rec.company, rec.unit, rec.head, rec.total);
        const opt = { avgWt: 2, totalWt: 1, index: 2, price: 4, fat: 2, lean: 2, bonus: 4, leanInc: 4 };
        for (const [k, d] of Object.entries(opt)) { const v = num(at(row, C[k])); if (v !== null) rec[k] = round(v, d); }
        const o = str(at(row, C.out)); if (o) rec.outstanding = o;
        out.push(rec);
      }
    }
    return out;
  }

  /** A combined workbook's SOWS sheet: YEAR and NUMBER OF SOWS on each row -> { year: sows }. */
  function sowsSheet(wb) {
    const s = sheet(wb, 'SOWS'); const out = {};
    if (!s) return out;
    for (const row of s.rows) { const y = num((row || [])[0]); const n = num((row || [])[1]); if (y >= 1990 && y <= 2100 && n) out[y] = n; }
    return out;
  }

  /**
   * Workbook ({ sheets }) -> { year, years, farm, sows, sowsByYear, codes, records }.
   * year: the workbook's year (the latest one for a combined workbook); years: every year with records.
   */
  function convert(wb, fallbackYear) {
    const info = farmInfo(wb);
    const exp = sheet(wb, 'EXPENSE');
    const year = info.year || (exp && titleYear(exp)) || datesYear(exp) || fallbackYear || new Date().getFullYear();
    const records = [...expenses(wb, year), ...income(wb, year)];
    const years = [...new Set(records.map((r) => +r.date.slice(0, 4)))].sort((a, b) => a - b);
    const sowsByYear = sowsSheet(wb);
    const sows = info.sows || reportValue(wb, 'AVERAGE NUMBER OF BREEDING FEMALE') || 0;
    if (sows && !Object.keys(sowsByYear).length) sowsByYear[year] = sows;
    return { year: years.length > 1 ? years[years.length - 1] : year, years, farm: info.farm || '', sows: sowsByYear[year] || sows, sowsByYear, codes: reportCodes(wb), records };
  }

  /** The MOVED TO FINISHER sheet -> { year, records } (kind 'move': date, head, rooms, days, pen). */
  function convertMoves(wb, fallbackYear) {
    const s = sheet(wb, 'MOVED TO FINISHER', 'MOVED TO FINISHERS', 'FINISHER');
    if (!s) return { year: fallbackYear, records: [] };
    const info = farmInfo(wb);
    const year = titleYear(s) || info.year || fallbackYear || new Date().getFullYear();
    const hd = header(s.rows);
    if (!hd) return { year, records: [] };
    const row0 = s.rows[hd.row] || [];
    // ROOM # comes up to three times: the room the pigs left, then the finisher's room (DAYS and PEN # beside it)
    const rooms = row0.map((v, i) => (key(v).startsWith('ROOM') ? i : -1)).filter((i) => i >= 0);
    const C = { m: hd.cols.MONTH, d: col(hd, /^DATE$/), head: col(hd, /^AMOUNT$/, /^AMO/), days: col(hd, /^DAYS/), pen: col(hd, /^PEN/) };
    const out = []; const id = idMaker();
    for (let r = hd.row + 1; r < s.rows.length; r++) {
      const row = s.rows[r]; if (!row) continue;
      const m = month(at(row, C.m)); const head = num(at(row, C.head));
      if (!m || !head) continue;
      const date = isoDate(year, m, at(row, C.d));
      const rec = { id: id(year, 'm', date, head, str(at(row, rooms[0]))), kind: 'move', date, head };
      const room = str(at(row, rooms[0])); if (room) rec.room = room;
      const fin = [rooms[1], rooms[2]].map((c) => str(at(row, c))).filter(Boolean).join(' / '); if (fin) rec.finRoom = fin;
      const days = num(at(row, C.days)); if (days) rec.days = days;
      const pen = str(at(row, C.pen)); if (pen) rec.pen = pen;
      out.push(rec);
    }
    return { year, records: out };
  }

  const api = { convert, convertMoves, month, reportValue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SOS = root.SOS || {}; root.SOS.finImport = api; }
})(typeof window !== 'undefined' ? window : globalThis);
