/* SwineOS – shared helpers (dates, DOM, formatting). */
window.SOS = window.SOS || {};

(function (S) {
  'use strict';
  const DAY = 86400000;

  const U = {
    DAY,
    /** ISO date (YYYY-MM-DD) -> integer day number. */
    d2n(iso) {
      if (!iso) return NaN;
      const [y, m, d] = iso.split('-').map(Number);
      return Math.round(Date.UTC(y, m - 1, d) / DAY);
    },
    /** day number -> ISO date. */
    n2d(n) {
      const dt = new Date(n * DAY);
      return dt.toISOString().slice(0, 10);
    },
    today() {
      const t = new Date();
      return [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-');
    },
    addDays(iso, n) { return U.n2d(U.d2n(iso) + n); },
    diff(a, b) { return U.d2n(a) - U.d2n(b); },
    addMonths(iso, n) {
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1 + n, 1));
      const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
      dt.setUTCDate(Math.min(d, last));
      return dt.toISOString().slice(0, 10);
    },
    MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    /** ISO -> "Feb/19/26": the month as letters so nobody has to decode month numbers. */
    fmt(iso) {
      if (!iso) return '';
      const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
      if (!y || !m || !d) return '';
      return `${U.MONTHS[m - 1]}/${String(d).padStart(2, '0')}/${String(y % 100).padStart(2, '0')}`;
    },
    /** Date and time (a timestamp, Date or ISO string) -> "Feb/19/26 2:05 PM", in this computer's time zone. */
    fmtDT(t) {
      if (t === undefined || t === null || t === '') return '';
      const dt = t instanceof Date ? t : new Date(t);
      if (isNaN(dt)) return '';
      const iso = [dt.getFullYear(), String(dt.getMonth() + 1).padStart(2, '0'), String(dt.getDate()).padStart(2, '0')].join('-');
      return `${U.fmt(iso)} ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    },
    /** Typed date -> ISO, or null. Takes Feb/19/26, feb 19 2026, 2/19/26, 2/19/2026, 2026-02-19, 19-Feb-26. */
    parseDate(text) {
      const t = String(text || '').trim().toLowerCase();
      if (!t) return null;
      let y; let m; let d;
      let x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (x) [, y, m, d] = x.map(Number);
      else if ((x = t.match(/^([a-z]{3,9})[\s/.,-]+(\d{1,2})(?:[\s/.,-]+(\d{2,4}))?$/))) { m = U.MONTHS.findIndex((n) => x[1].startsWith(n.toLowerCase())) + 1; d = +x[2]; y = x[3] ? +x[3] : new Date().getFullYear(); }
      else if ((x = t.match(/^(\d{1,2})[\s/.,-]+([a-z]{3,9})(?:[\s/.,-]+(\d{2,4}))?$/))) { m = U.MONTHS.findIndex((n) => x[2].startsWith(n.toLowerCase())) + 1; d = +x[1]; y = x[3] ? +x[3] : new Date().getFullYear(); }
      else if ((x = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/))) { m = +x[1]; d = +x[2]; y = x[3] ? +x[3] : new Date().getFullYear(); }
      else return null;
      if (y < 100) y += 2000;
      if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return U.n2d(U.d2n(iso)) === iso ? iso : null; // rejects 2/30 and the like
    },
    weekday(iso) {
      return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(U.d2n(iso) * DAY).getUTCDay()];
    },
    /** ISO week label e.g. 2026-W41 */
    isoWeek(iso) {
      const dt = new Date(U.d2n(iso) * DAY);
      const day = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - day + 3);
      const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
      const wk = 1 + Math.round(((dt - firstThu) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
      return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
    },
    /**
     * Week number as PigWIN counts it (mating groups "26-25"): weeks start on Monday, and week 1 is the week
     * holding 1 January only when that is a Monday, Tuesday or Wednesday; otherwise week 1 starts the next Monday.
     * (ISO puts Thursday 1 January in week 1, so in years like 2026 PigWIN's numbers are one lower.)
     */
    pigWeek(iso) {
      const n = U.d2n(iso);
      const start = (y) => { const j = U.d2n(`${y}-01-01`); const dow = (new Date(j * DAY).getUTCDay() + 6) % 7; return dow <= 2 ? j - dow : j + 7 - dow; };
      let y = Number(iso.slice(0, 4));
      if (n < start(y)) y -= 1; else if (n >= start(y + 1)) y += 1;
      return `${y}-W${String(Math.floor((n - start(y)) / 7) + 1).padStart(2, '0')}`;
    },
    /** Mating group "yy-ww" for a service date. */
    matingGroup(iso) { const w = U.pigWeek(iso); return w.slice(2, 4) + '-' + w.slice(6); },
    /** Monday of the week containing iso. */
    weekStart(iso) {
      const n = U.d2n(iso);
      const day = (new Date(n * DAY).getUTCDay() + 6) % 7;
      return U.n2d(n - day);
    },
    inRange(iso, b, e) { return !!iso && iso >= b && iso <= e; },

    uid(prefix = 'a') {
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    num(v, dec = 1) {
      if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return '';
      return Number(v).toFixed(dec);
    },
    pct(a, b, dec = 1) { return b ? (100 * a / b) : NaN; },
    avg(arr) { const v = arr.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; },
    sum(arr) { return arr.reduce((s, x) => s + (Number(x) || 0), 0); },
    sd(arr) {
      const v = arr.filter((x) => Number.isFinite(x));
      if (v.length < 2) return NaN;
      const m = U.avg(v);
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    },
    median(arr) {
      const v = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
      if (!v.length) return NaN;
      const h = Math.floor(v.length / 2);
      return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
    },

    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    /** Tiny element builder: h('div.cls#id', {attrs}, children...) */
    h(tag, attrs, ...kids) {
      const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
      const el = document.createElement(m[1] || 'div');
      (m[2].match(/[.#][\w-]+/g) || []).forEach((t) => {
        if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1);
      });
      if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (v === undefined || v === null || v === false) continue;
          if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
          else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
          else if (k === 'html') el.innerHTML = v;
          else if (k === 'value') el.value = v;
          else if (k === 'checked') el.checked = !!v;
          else el.setAttribute(k, v === true ? '' : v);
        }
      }
      const add = (k) => {
        if (k === null || k === undefined || k === false) return;
        if (Array.isArray(k)) k.forEach(add);
        else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
      };
      kids.forEach(add);
      return el;
    },

    $(sel, root = document) { return root.querySelector(sel); },
    $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },

    /** Parse a parity filter like "1", "2-5", "6+", "1,3" -> predicate */
    parityFilter(text) {
      const t = (text || '').trim();
      if (!t) return () => true;
      const parts = t.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
        if (/^\d+\+$/.test(p)) { const a = +p.slice(0, -1); return (x) => x >= a; }
        if (/^\d+\s*-\s*\d+$/.test(p)) { const [a, b] = p.split('-').map((s) => +s.trim()); return (x) => x >= a && x <= b; }
        if (/^\d+$/.test(p)) { const a = +p; return (x) => x === a; }
        return () => true;
      });
      return (x) => parts.some((f) => f(x));
    },

    csv(rows) {
      return rows.map((r) => r.map((c) => {
        const s = String(c ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')).join('\r\n');
    },

    debounce(fn, ms) {
      let t;
      return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },

    /** Natural compare for ear tags: "B9" < "B10", "12" < "100". */
    natCmp(a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    },
  };

  S.U = U;
})(window.SOS);
