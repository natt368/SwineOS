/* SwineOS – turn the barn's Excel workbooks into finance records.
 * Reads the "Expense & Income" workbook (sheets EXPENSE, HOGS SALES, CRIPPLES, CULL SOW & BOARS,
 * INFORMATION.SHEET, REPORT).
 * Columns are found by their header text, so added or moved columns do not break the import.
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
  function isoDate(year, m, d) {
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const day = Math.min(Math.max(1, Math.round(num(d) || 1)), last);
    return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  /** The year written in a sheet's title rows (e.g. "HOGS EXPENSE: 2026"). */
  function titleYear(s) {
    for (const row of s.rows.slice(0, 6)) for (const v of row || []) if (typeof v === 'number' && v >= 1990 && v <= 2100 && Number.isInteger(v)) return v;
    return null;
  }

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
    const C = { m: hd.cols.MONTH, d: col(hd, /^DATE$/, /^DAY$/), item: col(hd, /^PRODUCT/, /^ITEM/), comp: col(hd, /^COMP/), qty: col(hd, /^AMOUNT$/, /^AMO/, /^QU/), unit: col(hd, /^UNIT$/),
      total: col(hd, /^TOTAL/), cat: col(hd, /^TYPE$/, /^CODE$/), tag: col(hd, /^TYPE#?2/) };
    const out = [];
    for (let r = hd.row + 1; r < s.rows.length; r++) {
      const row = s.rows[r]; if (!row) continue;
      const m = month(at(row, C.m)); const item = str(at(row, C.item)); const total = num(at(row, C.total));
      if (!m || !item || total === null) continue;
      out.push({ id: `x${y}e${r + 1}`, kind: 'exp', date: isoDate(y, m, at(row, C.d)), item, company: str(at(row, C.comp)),
        qty: round(num(at(row, C.qty)), 4), unit: str(at(row, C.unit)), total: round(total), cat: num(at(row, C.cat)) || 0, tag: str(at(row, C.tag)) });
    }
    return out;
  }

  const STREAMS = [
    { stream: 'hogs', id: 'h', names: ['HOGS SALES', 'HOG SALES'] },
    { stream: 'cripples', id: 'k', names: ['CRIPPLES'] },
    { stream: 'culls', id: 'c', names: ['CULL SOW & BOARS', 'CULL SOWS & BOARS', 'CULLS'] },
  ];
  function income(wb, year) {
    const out = [];
    for (const st of STREAMS) {
      const s = sheet(wb, ...st.names);
      if (!s) continue;
      const hd = header(s.rows); if (!hd) continue;
      const y = titleYear(s) || year;
      const C = { m: hd.cols.MONTH, d: col(hd, /^DATE$/), comp: col(hd, /^COMP/), unit: col(hd, /^UNIT$/), head: col(hd, /^AMO/), total: col(hd, /^CHE/, /^TOTAL\$/),
        avgWt: col(hd, /^AVEWEI/, /^AVGWEI/), totalWt: col(hd, /^TOTALWEI/), index: col(hd, /^INDEX/), price: col(hd, /^PRICE/), fat: col(hd, /^FAT/), lean: col(hd, /^LEAN$/),
        bonus: col(hd, /^HEALTH/), leanInc: col(hd, /^LEANINC/), out: col(hd, /^OUTST/) };
      for (let r = hd.row + 1; r < s.rows.length; r++) {
        const row = s.rows[r]; if (!row) continue;
        const m = month(at(row, C.m)); const head = num(at(row, C.head)); const total = num(at(row, C.total));
        if (!m || (head === null && total === null) || (!head && !total && !str(at(row, C.comp)))) continue;
        const rec = { id: `x${y}${st.id}${r + 1}`, kind: 'inc', stream: st.stream, date: isoDate(y, m, at(row, C.d)), company: str(at(row, C.comp)), unit: str(at(row, C.unit)),
          head: head || 0, total: round(total || 0) };
        const opt = { avgWt: 2, totalWt: 1, index: 2, price: 4, fat: 2, lean: 2, bonus: 4, leanInc: 4 };
        for (const [k, d] of Object.entries(opt)) { const v = num(at(row, C[k])); if (v !== null) rec[k] = round(v, d); }
        const o = str(at(row, C.out)); if (o) rec.outstanding = o;
        out.push(rec);
      }
    }
    return out;
  }

  /** Workbook ({ sheets }) -> { year, farm, sows, codes, records } */
  function convert(wb, fallbackYear) {
    const info = farmInfo(wb);
    const exp = sheet(wb, 'EXPENSE');
    const year = info.year || (exp && titleYear(exp)) || fallbackYear || new Date().getFullYear();
    const records = [...expenses(wb, year), ...income(wb, year)];
    return { year, farm: info.farm || '', sows: info.sows || 0, codes: reportCodes(wb), records };
  }

  const api = { convert, month };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SOS = root.SOS || {}; root.SOS.finImport = api; }
})(typeof window !== 'undefined' ? window : globalThis);
