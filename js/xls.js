/* SwineOS – read Excel workbooks (.xls and .xlsx) in the browser, for the finance import.
 * .xls (Excel 97–2003): a compound document holding the BIFF8 "Workbook" stream.
 * .xlsx: a zip of XML parts (uses the zip reader of the PigWIN import).
 * Returns { sheets: [{ name, rows }] } where rows[r][c] is a number, a string or undefined.
 * Formulas give their last calculated value, as Excel shows them. Works in browsers and Node 18+. */
(function (root) {
  'use strict';

  /* ---------------- compound document (OLE2) ---------------- */
  function cfbStream(u8, names) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== 0xe011cfd0 || dv.getUint32(4, true) !== 0xe11ab1a1) return null;
    const secSize = 1 << dv.getUint16(30, true);
    const miniSize = 1 << dv.getUint16(32, true);
    const nFat = dv.getUint32(44, true);
    const dirStart = dv.getUint32(48, true);
    const cutoff = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true);
    let difat = dv.getUint32(68, true);
    const off = (s) => (s + 1) * secSize;
    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(76 + 4 * i, true));
    for (let guard = 0; fatSecs.length < nFat && difat < 0xfffffffa && guard < 100000; guard++) {
      const per = secSize / 4 - 1;
      for (let i = 0; i < per && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(off(difat) + 4 * i, true));
      difat = dv.getUint32(off(difat) + 4 * per, true);
    }
    const fat = [];
    for (const s of fatSecs) for (let i = 0; i < secSize / 4; i++) fat.push(dv.getUint32(off(s) + 4 * i, true));
    const chain = (start, table) => {
      const out = []; const seen = new Set();
      for (let s = start; s < 0xfffffffa && !seen.has(s) && s < table.length; s = table[s]) { seen.add(s); out.push(s); }
      return out;
    };
    const read = (start, size) => {
      const out = new Uint8Array(size); let p = 0;
      for (const s of chain(start, fat)) {
        const n = Math.min(secSize, size - p);
        if (n <= 0) break;
        out.set(u8.subarray(off(s), off(s) + n), p); p += n;
      }
      return out;
    };
    const dirSecs = chain(dirStart, fat);
    const dir = read(dirStart, dirSecs.length * secSize);
    const ddv = new DataView(dir.buffer);
    const entries = [];
    for (let p = 0; p + 128 <= dir.length; p += 128) {
      const len = ddv.getUint16(p + 64, true);
      let name = '';
      for (let i = 0; i + 2 < len; i += 2) name += String.fromCharCode(ddv.getUint16(p + i, true));
      entries.push({ name, type: dir[p + 66], start: ddv.getUint32(p + 116, true), size: ddv.getUint32(p + 120, true) });
    }
    const rootE = entries[0];
    const ent = entries.find((e) => e.type === 2 && names.includes(e.name));
    if (!ent) return null;
    if (ent.size >= cutoff) return read(ent.start, ent.size);
    // small stream: lives in the mini stream (held by the root entry)
    const miniFat = [];
    for (const s of chain(miniFatStart, fat)) for (let i = 0; i < secSize / 4; i++) miniFat.push(dv.getUint32(off(s) + 4 * i, true));
    const ministream = read(rootE.start, rootE.size);
    const out = new Uint8Array(ent.size); let p = 0;
    for (const s of chain(ent.start, miniFat)) {
      const n = Math.min(miniSize, ent.size - p);
      if (n <= 0) break;
      out.set(ministream.subarray(s * miniSize, s * miniSize + n), p); p += n;
    }
    return out;
  }

  /* ---------------- BIFF8 ---------------- */
  const cp1252 = new TextDecoder('windows-1252');
  function rk(v) {
    let n;
    if (v & 2) n = v >> 2;
    else {
      const b = new DataView(new ArrayBuffer(8));
      b.setUint32(4, v & 0xfffffffc, true); b.setUint32(0, 0, true);
      n = b.getFloat64(0, true);
    }
    return v & 1 ? n / 100 : n;
  }
  /** Characters of a string: 8-bit (compressed) or UTF-16. */
  function chars(u8, p, n, wide) {
    if (!wide) return cp1252.decode(u8.subarray(p, p + n));
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + 2 * i] | (u8[p + 2 * i + 1] << 8));
    return s;
  }

  /** Shared strings: one SST record plus its CONTINUE records; strings may break across them. */
  function readSST(parts) {
    const out = [];
    let pi = 0; let u8 = parts[0]; let p = 8;
    const total = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true);
    const next = () => { pi++; u8 = parts[pi]; p = 0; return !!u8; };
    const need = () => { if (p >= u8.length) next(); };
    const u16 = () => { need(); const v = u8[p] | (u8[p + 1] << 8); p += 2; return v; };
    const u32 = () => { need(); const v = (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16)) + u8[p + 3] * 16777216; p += 4; return v; };
    const skip = (n) => { while (n > 0 && u8) { const k = Math.min(n, u8.length - p); p += k; n -= k; if (n > 0 && !next()) return; } };
    for (let i = 0; i < total && u8; i++) {
      need(); if (!u8) break;
      const cch = u16(); const flags = u8[p++];
      let wide = flags & 1;
      const runs = flags & 8 ? u16() : 0;
      const ext = flags & 4 ? u32() : 0;
      let s = ''; let left = cch;
      while (left > 0) {
        if (p >= u8.length) { if (!next()) break; wide = u8[p++] & 1; } // a new CONTINUE repeats the flags byte
        const fit = Math.min(left, Math.floor((u8.length - p) / (wide ? 2 : 1)));
        s += chars(u8, p, fit, wide); p += fit * (wide ? 2 : 1); left -= fit;
      }
      skip(runs * 4 + ext);
      out.push(s);
    }
    return out;
  }

  function readBIFF(wb) {
    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const recs = (start, fn) => {
      for (let p = start; p + 4 <= wb.length;) {
        const type = dv.getUint16(p, true); const len = dv.getUint16(p + 2, true);
        if (fn(type, p + 4, len) === false) return;
        p += 4 + len;
      }
    };
    const bof = dv.getUint16(0, true);
    if (bof !== 0x0809) throw new Error('This Excel file is too old to read (save it again in Excel as .xls or .xlsx).');
    const sheets = []; let sst = [];
    let sstParts = null;
    recs(0, (type, p, len) => {
      if (type === 0x002f) throw new Error('This Excel file is password protected. Remove the password in Excel and try again.');
      if (type === 0x0085) {
        const pos = dv.getUint32(p, true); const kind = wb[p + 5];
        const n = wb[p + 6]; const wide = wb[p + 7] & 1;
        if (kind === 0) sheets.push({ name: chars(wb, p + 8, n, wide), pos });
      } else if (type === 0x00fc) sstParts = [wb.subarray(p, p + len)];
      else if (type === 0x003c && sstParts) sstParts.push(wb.subarray(p, p + len));
      else if (sstParts && sstParts.length) { sst = readSST(sstParts); sstParts = null; }
      if (type === 0x000a) return false; // end of the workbook globals
      return undefined;
    });
    if (sstParts) sst = readSST(sstParts);
    return sheets.map((sh) => {
      const rows = [];
      const put = (r, c, v) => { (rows[r] || (rows[r] = []))[c] = v; };
      let pendingString = null;
      recs(sh.pos, (type, p, len) => {
        if (type === 0x000a) return false; // EOF
        if (len < 4) return undefined;
        const r = dv.getUint16(p, true); const c = dv.getUint16(p + 2, true);
        switch (type) {
          case 0x00fd: put(r, c, sst[dv.getUint32(p + 6, true)]); break; // LABELSST
          case 0x0203: put(r, c, dv.getFloat64(p + 6, true)); break; // NUMBER
          case 0x027e: put(r, c, rk(dv.getUint32(p + 6, true))); break; // RK
          case 0x00bd: { // MULRK
            const last = dv.getUint16(p + len - 2, true);
            for (let k = c; k <= last; k++) put(r, k, rk(dv.getUint32(p + 4 + (k - c) * 6 + 2, true)));
            break;
          }
          case 0x0204: { const n = dv.getUint16(p + 6, true); put(r, c, chars(wb, p + 9, n, wb[p + 8] & 1)); break; } // LABEL
          case 0x0205: if (!wb[p + 7]) put(r, c, wb[p + 6] ? 1 : 0); break; // BOOLERR
          case 0x0006: { // FORMULA: the cached result
            if (dv.getUint16(p + 12, true) !== 0xffff) put(r, c, dv.getFloat64(p + 6, true));
            else if (wb[p + 6] === 0) pendingString = [r, c]; // text follows in a STRING record
            else if (wb[p + 6] === 1) put(r, c, wb[p + 8] ? 1 : 0);
            break;
          }
          case 0x0207: // STRING
            if (pendingString) { const n = dv.getUint16(p, true); put(pendingString[0], pendingString[1], chars(wb, p + 3, n, wb[p + 2] & 1)); pendingString = null; }
            break;
          default:
        }
        return undefined;
      });
      return { name: sh.name, rows };
    });
  }

  /* ---------------- xlsx ---------------- */
  const ent = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()] || String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))));
  const texts = (xml) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => ent(m[1])).join('');
  function colNum(ref) { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
  async function readXLSX(buf, unzip) {
    const dec = new TextDecoder();
    const files = await unzip(buf);
    const get = (n) => (files[n.toUpperCase()] ? dec.decode(files[n.toUpperCase()]) : '');
    const shared = [...get('sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
    const rels = {};
    for (const m of get('workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
      const id = (m[0].match(/\bId="([^"]+)"/) || [])[1]; const t = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
      if (id && t) rels[id] = t.split('/').pop();
    }
    const out = [];
    for (const m of get('workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
      const name = ent((m[0].match(/\bname="([^"]*)"/) || [])[1] || '');
      const rid = (m[0].match(/\br:id="([^"]+)"/) || [])[1];
      const xml = get(rels[rid] || '');
      const rows = [];
      for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/\br="([A-Z]+)(\d+)"/) || []);
        if (!ref[1]) continue;
        const t = (c[1].match(/\bt="(\w+)"/) || [])[1];
        const body = c[2] || '';
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val;
        if (t === 's') val = shared[+v];
        else if (t === 'inlineStr') val = texts(body);
        else if (t === 'str' || t === 'e') val = v === undefined ? undefined : ent(v);
        else if (v !== undefined && v !== '') val = Number(v);
        if (val === undefined || val === '') continue;
        const r = +ref[2] - 1;
        (rows[r] || (rows[r] = []))[colNum(ref[1])] = val;
      }
      out.push({ name, rows });
    }
    return out;
  }

  /** bytes of an .xls or .xlsx file -> { sheets }. unzip: the zip reader (SOS.pigwin.unzip). */
  async function readWorkbook(buf, unzip) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      if (!unzip) throw new Error('Cannot open .xlsx files here.');
      return { sheets: await readXLSX(u8, unzip) };
    }
    const wb = cfbStream(u8, ['Workbook', 'Book']);
    if (!wb) throw new Error('This file is not an Excel workbook (.xls or .xlsx).');
    return { sheets: readBIFF(wb) };
  }

  const api = { readWorkbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SOS = root.SOS || {}; root.SOS.xls = api; }
})(typeof window !== 'undefined' ? window : globalThis);
