/* SwineOS – UI kit: windows, toolbars, modals, grids, charts, toasts, file save. */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;

  const ICONS = {
    sow: '<svg viewBox="0 0 48 32"><path d="M8 14c0-6 7-9 16-9 8 0 13 2 15 5l4-2 1 3-3 2c1 1 1 3 0 5-1 3-4 4-7 5l-1 5h-3l-1-4H17l-1 4h-3l-1-5c-3-2-4-5-4-9z" fill="#f7a9c8" stroke="#444" stroke-width="1.6"/><circle cx="37" cy="12" r="1.3" fill="#222"/><path d="M6 13c-2-1-3 0-3 2" fill="none" stroke="#444" stroke-width="1.5"/></svg>',
    piglets: '<svg viewBox="0 0 48 32"><g stroke="#444" stroke-width="1.4" fill="#f7a9c8"><path d="M4 12c0-4 4-6 10-6 5 0 8 1 9 3l3-1 1 2-2 2c0 3-2 5-5 5l-1 3h-2l-1-3H9l-1 3H6l-1-3c-1-1-1-3-1-5z"/><path d="M20 21c0-4 4-6 10-6 5 0 8 1 9 3l3-1 1 2-2 2c0 3-2 5-5 5l-1 3h-2l-1-3h-7l-1 3h-2l-1-3c-1-1-1-3-1-5z"/></g></svg>',
    boar: '<svg viewBox="0 0 48 32"><path d="M8 16c0-6 7-9 16-9 8 0 13 2 15 5l4-2 1 3-3 2c1 1 1 3 0 5-1 3-4 4-7 5l-1 4h-3l-1-3H17l-1 3h-3l-1-4c-3-2-4-5-4-9z" fill="#f7a9c8" stroke="#444" stroke-width="1.6"/><circle cx="37" cy="14" r="1.3" fill="#222"/><circle cx="22" cy="5" r="3" fill="none" stroke="#333" stroke-width="1.3"/><path d="M24 3l3-3m0 0h-2.5m2.5 0v2.5" stroke="#333" stroke-width="1.3" fill="none"/></svg>',
    help: '<svg viewBox="0 0 32 32"><path d="M6 8l12-4 8 4-12 4z" fill="#d9a35b" stroke="#5a3a12" stroke-width="1.2"/><path d="M6 8v14l8 4V12z" fill="#8a5a2b" stroke="#5a3a12" stroke-width="1.2"/><path d="M14 12l12-4v14l-12 4z" fill="#b97a3b" stroke="#5a3a12" stroke-width="1.2"/><path d="M17 15l6-2M17 18l6-2" stroke="#fff" stroke-width="1"/></svg>',
    close: '<svg viewBox="0 0 32 32"><path d="M4 15L16 4l12 11v13H4z" fill="#fff" stroke="#b00" stroke-width="2"/><path d="M16 20h12M24 16l4 4-4 4" stroke="#1a9a2a" stroke-width="3" fill="none"/></svg>',
    update: '<svg viewBox="0 0 32 32"><path d="M26 16a10 10 0 1 1-3-7" fill="none" stroke="#1f5fa8" stroke-width="3.5"/><path d="M24 3v7h-7" fill="none" stroke="#1f5fa8" stroke-width="3.5"/></svg>',
    info: '<svg viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" fill="#fff" stroke="#444" stroke-width="1.5"/><path d="M10 12h12M10 17h12M10 22h8" stroke="#1f5fa8" stroke-width="2"/></svg>',
    settings: '<svg viewBox="0 0 32 32"><rect x="5" y="4" width="18" height="22" fill="#fff" stroke="#444" stroke-width="1.5"/><path d="M8 10l3 3 5-6M8 19l3 3 5-6" stroke="#222" stroke-width="2" fill="none"/><path d="M22 18l6 8-3 1z" fill="#e8c840" stroke="#444"/></svg>',
    graph: '<svg viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" fill="#fff" stroke="#444" stroke-width="1.5"/><rect x="8" y="16" width="4" height="10" fill="#d22"/><rect x="14" y="10" width="4" height="16" fill="#e8c840"/><rect x="20" y="13" width="4" height="13" fill="#2a4fd0"/></svg>',
    print: '<svg viewBox="0 0 32 32"><rect x="9" y="3" width="14" height="10" fill="#fff" stroke="#444" stroke-width="1.5"/><rect x="4" y="12" width="24" height="11" rx="2" fill="#bbb" stroke="#444" stroke-width="1.5"/><rect x="9" y="19" width="14" height="10" fill="#fff" stroke="#444" stroke-width="1.5"/></svg>',
    export: '<svg viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" fill="#222"/><rect x="8" y="4" width="16" height="10" fill="#e8c840"/><rect x="9" y="18" width="14" height="10" fill="#ddd"/></svg>',
    enter: '<svg viewBox="0 0 32 32"><rect x="3" y="4" width="14" height="18" fill="#ffe680" stroke="#444" stroke-width="1.4"/><rect x="14" y="12" width="14" height="16" fill="#ffe680" stroke="#444" stroke-width="1.4"/><path d="M6 26h8M10 22l-4 4 4 4" stroke="#1a6" stroke-width="2" fill="none"/></svg>',
    edit: '<svg viewBox="0 0 32 32"><rect x="3" y="4" width="14" height="18" fill="#ffe680" stroke="#444" stroke-width="1.4"/><circle cx="21" cy="20" r="7" fill="#ffe680" stroke="#444" stroke-width="1.4"/><path d="M12 8l14-2-4 6" stroke="#1a6" stroke-width="2" fill="none"/></svg>',
    del: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="7" rx="10" ry="3" fill="#c9a13a" stroke="#5a4512"/><path d="M6 7l2 20c2 2 14 2 16 0l2-20" fill="#e2bd52" stroke="#5a4512" stroke-width="1.4"/><path d="M11 11v13M16 11v14M21 11v13" stroke="#5a4512"/></svg>',
    find: '<svg viewBox="0 0 32 32"><circle cx="13" cy="13" r="8" fill="#e6f2ff" stroke="#333" stroke-width="2.5"/><path d="M19 19l9 9" stroke="#333" stroke-width="3.5"/></svg>',
    details: '<svg viewBox="0 0 32 32"><rect x="4" y="4" width="20" height="24" fill="#fff" stroke="#444" stroke-width="1.5"/><path d="M8 10h12M8 15h12M8 20h8" stroke="#555" stroke-width="2"/><text x="25" y="28" font-size="16" font-weight="bold" fill="#c00">!</text></svg>',
    tools: '<svg viewBox="0 0 32 32"><path d="M5 27l12-12M17 15l4-9 6 6-9 4" stroke="#333" stroke-width="2.4" fill="#aaa"/><path d="M27 27L14 14M10 6a5 5 0 0 0 4 8" stroke="#333" stroke-width="2.4" fill="none"/></svg>',
    backup: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="8" rx="10" ry="4" fill="#9cc6f0" stroke="#24527a" stroke-width="1.5"/><path d="M6 8v16c0 2 4 4 10 4s10-2 10-4V8" fill="#c6e0f8" stroke="#24527a" stroke-width="1.5"/><path d="M6 16c0 2 4 4 10 4s10-2 10-4" fill="none" stroke="#24527a" stroke-width="1.5"/></svg>',
    reports: '<svg viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="26" fill="#fff" stroke="#444" stroke-width="1.5"/><rect x="9" y="17" width="3" height="8" fill="#d22"/><rect x="14" y="12" width="3" height="13" fill="#2a4fd0"/><rect x="19" y="14" width="3" height="11" fill="#1a9a2a"/><path d="M9 7h14M9 10h10" stroke="#555"/></svg>',
    entry: '<svg viewBox="0 0 32 32"><rect x="4" y="3" width="20" height="26" fill="#fff" stroke="#444" stroke-width="1.5"/><path d="M8 9h12M8 14h12M8 19h8" stroke="#555" stroke-width="2"/><path d="M18 26l2-6 9-9 4 4-9 9z" fill="#e8c840" stroke="#444" stroke-width="1.3"/></svg>',
    actions: '<svg viewBox="0 0 32 32"><rect x="5" y="3" width="22" height="26" fill="#fff" stroke="#444" stroke-width="1.5"/><path d="M9 10l2 2 4-4M9 18l2 2 4-4" stroke="#1a9a2a" stroke-width="2" fill="none"/><path d="M18 10h6M18 18h6M9 25h15" stroke="#555" stroke-width="2"/></svg>',
  };
  const icon = (name) => h('span.ico', { html: ICONS[name] || '' });

  /* ---------- toasts ---------- */
  function toast(msg, kind = 'info') {
    let host = U.$('#toasts');
    if (!host) { host = h('div#toasts'); document.body.appendChild(host); }
    const t = h('div.toast.' + kind, msg);
    host.appendChild(t);
    setTimeout(() => t.classList.add('out'), kind === 'error' ? 7000 : 3200);
    setTimeout(() => t.remove(), kind === 'error' ? 7600 : 3800);
  }

  /* ---------- modal dialogs (Windows style) ---------- */
  function modal({ title, body, buttons = [], width = 520, onClose, cls }) {
    const back = h('div.modal-back');
    const box = h('div.dlg' + (cls ? '.' + cls : ''), { style: { width: width + 'px' }, role: 'dialog', 'aria-label': title });
    const close = () => { back.remove(); document.removeEventListener('keydown', key); onClose && onClose(); };
    const bar = h('div.dlg-title', h('span', title), h('button.dlg-x', { onclick: close, title: 'Close', 'aria-label': 'Close' }, '✕'));
    const content = h('div.dlg-body', body);
    const foot = h('div.dlg-foot');
    buttons.forEach((b) => {
      const el = h('button.wbtn' + (b.primary ? '.primary' : '') + (b.cls ? '.' + b.cls : ''), {
        type: 'button',
        onclick: async () => { const keep = b.onClick ? await b.onClick(close) : false; if (keep !== true && !b.manual) close(); },
      }, b.label);
      if (b.right) el.style.marginLeft = 'auto';
      foot.appendChild(el);
    });
    box.append(bar, content);
    if (buttons.length) box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);
    const key = (e) => {
      const backs = document.querySelectorAll('.modal-back');
      if (backs[backs.length - 1] !== back) return; // only the top dialog reacts to keys
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && !e.isComposing && ['INPUT', 'SELECT'].includes(e.target.tagName) && content.contains(e.target)) {
        // Enter walks down the form: next field, and from the last field to the main button (Enter there saves).
        // A dialog with a single field saves straight away.
        const fs = fields(); const i = fs.indexOf(e.target);
        const primary = foot.querySelector('.primary');
        e.preventDefault();
        if (fs.length > 1 && i >= 0 && i < fs.length - 1) { const n = fs[i + 1]; n.focus(); selectAll(n); }
        else if (fs.length > 1 && primary) primary.focus();
        else if (primary) primary.click();
      }
    };
    /** Fields the cursor can go to, in screen order. */
    const fields = () => [...content.querySelectorAll('input:not([type=hidden]):not([disabled]):not([readonly]):not(.dt-native),select:not([disabled]),textarea:not([disabled])')].filter((f) => f.offsetParent !== null);
    // text already in a field is highlighted, so typing replaces it (dates are left alone: they are changed by hand)
    content.addEventListener('focusin', (e) => {
      const f = e.target;
      selectAll(f); setTimeout(() => { if (document.activeElement === f) selectAll(f); }, 0);
    });
    function selectAll(f) { if (f.tagName === 'INPUT' && !f.classList.contains('dt') && !['date', 'checkbox', 'radio', 'file', 'button'].includes(f.type)) try { f.select(); } catch (err) { /* not selectable */ } }
    // attach after the current event finishes, so the Enter that opened the dialog does not submit it
    setTimeout(() => { if (back.isConnected) document.addEventListener('keydown', key); }, 0);
    setTimeout(() => {
      const fs = fields();
      const f = fs.find((x) => x.type !== 'date' && !x.classList.contains('dt')) || fs[0];
      if (f) f.focus();
    }, 30);
    return { close, box, content };
  }

  function confirmBox(title, message, okLabel = 'OK') {
    return new Promise((resolve) => {
      let ok = false;
      modal({ title, body: h('p.msg', message), width: 420, onClose: () => resolve(ok), buttons: [
        { label: okLabel, primary: true, onClick: () => { ok = true; } },
        { label: 'Cancel' },
      ] });
    });
  }

  function alertBox(title, message) {
    return new Promise((resolve) => modal({ title, body: h('p.msg', message), width: 420, onClose: resolve, buttons: [{ label: 'OK', primary: true }] }));
  }

  /* ---------- application window (title bar + toolbar) ---------- */
  function appWindow({ title, toolbar = [], cls = '', onClose }) {
    const farm = S.store.settings;
    const sub = farm ? `  -  [${farm.farmNumber} ${farm.farmName}]` : '';
    const win = h('section.win' + (cls ? '.' + cls.trim().split(/\s+/).join('.') : ''));
    const bar = h('div.win-title', h('span.win-name', title + sub), h('button.win-x', { title: 'Close', 'aria-label': 'Close', onclick: () => (onClose ? onClose() : S.app.home()) }, '✕'));
    const tb = h('div.toolbar');
    toolbar.forEach((t) => {
      if (t === '|') { tb.appendChild(h('span.tb-sep')); return; }
      const b = h('button.tb-btn' + (t.active ? '.active' : '') + (t.icon === 'print' ? '.print-btn' : ''), { type: 'button', title: t.title || t.label, onclick: t.onClick, disabled: t.disabled }, icon(t.icon), h('span', t.label));
      if (t.id) b.id = t.id;
      tb.appendChild(b);
    });
    win.append(bar, tb);
    return win;
  }

  /* ---------- sortable data grid ---------- */
  function grid({ columns, rows, onRowClick, onRowDblClick, onRowContext, selectedKey, rowKey = (r, i) => i, rowClass, cls = '', emptyText = 'No records', maxRows = 3000 }) {
    let sortCol = null; let sortDir = 1;
    const wrap = h('div.grid-wrap' + (cls ? '.' + cls : ''));
    const table = h('table.grid');
    wrap.appendChild(table);
    function render() {
      table.innerHTML = '';
      const thead = h('thead', h('tr', columns.map((c, i) => h('th', {
        class: (c.num ? 'num ' : '') + (sortCol === i ? 'sorted' : ''), style: c.width ? { width: c.width } : null,
        onclick: () => { if (sortCol === i) sortDir = -sortDir; else { sortCol = i; sortDir = 1; } render(); },
      }, c.label, sortCol === i ? h('span.sort', sortDir > 0 ? ' ▲' : ' ▼') : null))));
      let data = rows.slice();
      if (sortCol !== null) {
        const c = columns[sortCol];
        const val = c.sort || c.value;
        data.sort((a, b) => {
          const x = val(a); const y = val(b);
          if (x === y) return 0;
          if (x === '' || x === null || x === undefined) return 1;
          if (y === '' || y === null || y === undefined) return -1;
          return (typeof x === 'number' && typeof y === 'number' ? x - y : U.natCmp(x, y)) * sortDir;
        });
      }
      const tbody = h('tbody');
      if (!data.length) tbody.appendChild(h('tr.empty', h('td', { colspan: columns.length }, emptyText)));
      data.slice(0, maxRows).forEach((r, i) => {
        const key = rowKey(r, i);
        const tr = h('tr', { class: [selectedKey === key ? 'sel' : '', rowClass ? rowClass(r) : ''].join(' ').trim() || null, tabindex: onRowClick ? 0 : null, 'data-key': key != null ? String(key) : null });
        columns.forEach((c) => {
          const v = c.render ? c.render(r) : c.value(r);
          tr.appendChild(h('td', { class: c.num ? 'num' : null }, v instanceof Node ? v : (v ?? '')));
        });
        if (onRowClick) {
          tr.addEventListener('click', () => { U.$$('tr.sel', tbody).forEach((x) => x.classList.remove('sel')); tr.classList.add('sel'); onRowClick(r); });
          tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') onRowDblClick ? onRowDblClick(r) : onRowClick(r); });
        }
        if (onRowDblClick) tr.addEventListener('dblclick', () => onRowDblClick(r));
        if (onRowContext) {
          // right-click, or press and hold on a touch screen: select the row, then show its menu
          const open = (x, y) => { U.$$('tr.sel', tbody).forEach((t) => t.classList.remove('sel')); tr.classList.add('sel'); if (onRowClick) onRowClick(r); onRowContext(r, x, y); };
          tr.addEventListener('contextmenu', (e) => { e.preventDefault(); open(e.clientX, e.clientY); });
          let hold = null;
          tr.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; hold = setTimeout(() => { hold = 'done'; open(e.clientX, e.clientY); }, 550); });
          const cancel = () => { if (hold && hold !== 'done') clearTimeout(hold); hold = null; };
          tr.addEventListener('pointerup', cancel); tr.addEventListener('pointercancel', cancel); tr.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' && hold && hold !== 'done' && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancel(); });
        }
        tbody.appendChild(tr);
      });
      if (data.length > maxRows) tbody.appendChild(h('tr.empty', h('td', { colspan: columns.length }, `Showing first ${maxRows} of ${data.length}`)));
      table.append(thead, tbody);
    }
    render();
    wrap.update = (newRows, newSel) => { rows = newRows; if (newSel !== undefined) selectedKey = newSel; render(); };
    wrap.getRows = () => rows;
    wrap.toCSV = () => U.csv([columns.map((c) => c.label), ...rows.map((r) => columns.map((c) => { const v = c.value(r); return v instanceof Node ? v.textContent : v; }))]);
    return wrap;
  }

  /* ---------- right-click menu ---------- */
  /** items: [{ label, onClick, disabled, danger, checked, items: [sub-items] }] or '-' for a separator. */
  function contextMenu(x, y, items) {
    U.$$('.ctx-menu').forEach((m) => m.remove());
    const menus = [];
    function closeAll() {
      menus.forEach((m) => m.remove()); menus.length = 0;
      document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', closeAll); window.removeEventListener('blur', closeAll);
    }
    function place(menu, px, py, alt) {
      document.body.appendChild(menu);
      const r = menu.getBoundingClientRect();
      let left = px; if (left + r.width > innerWidth - 4) left = alt !== undefined ? alt - r.width : innerWidth - r.width - 4;
      menu.style.left = Math.max(4, left) + 'px';
      menu.style.top = Math.max(4, Math.min(py, innerHeight - r.height - 4)) + 'px';
    }
    function build(list, level) {
      const menu = h('div.ctx-menu', { role: 'menu' });
      menu.close = closeAll;
      list.filter(Boolean).forEach((it) => {
        if (it === '-') { menu.appendChild(h('div.ctx-sep')); return; }
        const b = h('button.ctx-item' + (it.danger ? '.danger' : '') + (it.items ? '.has-sub' : ''), { type: 'button', role: 'menuitem', disabled: !!it.disabled },
          h('span.ctx-check', it.checked === undefined ? '' : it.checked ? '✓' : ''), h('span.ctx-label', it.label), it.items ? h('span.ctx-arrow', '▸') : null);
        const openSub = () => {
          while (menus.length > level + 1) menus.pop().remove();
          if (!it.items) return;
          const sub = build(it.items, level + 1);
          const r = b.getBoundingClientRect();
          place(sub, r.right - 2, r.top - 4, r.left + 2);
          menus.push(sub);
        };
        b.addEventListener('mouseenter', openSub);
        b.addEventListener('click', () => { if (it.items) { openSub(); const f = menus[level + 1] && menus[level + 1].querySelector('.ctx-item:not(:disabled)'); if (f) f.focus(); return; } closeAll(); it.onClick(); });
        menu.appendChild(b);
      });
      return menu;
    }
    const onDown = (e) => { if (!menus.some((m) => m.contains(e.target))) closeAll(); };
    const onKey = (e) => {
      const cur = menus.find((m) => m.contains(document.activeElement)) || menus[menus.length - 1];
      const live = cur ? [...cur.querySelectorAll('.ctx-item:not(:disabled)')] : []; const i = live.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAll(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (live[i + 1] || live[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (live[i - 1] || live[live.length - 1]).focus(); }
      else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.classList.contains('has-sub')) { e.preventDefault(); document.activeElement.click(); }
      else if (e.key === 'ArrowLeft' && menus.length > 1 && cur !== menus[0]) { e.preventDefault(); const idx = menus.indexOf(cur); menus.splice(idx).forEach((m) => m.remove()); const f = menus[menus.length - 1].querySelector('.ctx-item.has-sub'); if (f) f.focus(); }
    };
    const root = build(items, 0);
    place(root, x, y);
    menus.push(root);
    setTimeout(() => { document.addEventListener('pointerdown', onDown, true); document.addEventListener('keydown', onKey, true); window.addEventListener('resize', closeAll); window.addEventListener('blur', closeAll); }, 0);
    const first = root.querySelector('.ctx-item:not(:disabled)'); if (first) first.focus({ preventScroll: true });
    return root;
  }

  /* ---------- simple SVG charts ---------- */
  function lineChart({ labels, series, width = 760, height = 320, yLabel = '', bars = false, target }) {
    const pad = { l: 56, r: 20, t: 20, b: 64 };
    const W = width - pad.l - pad.r; const H = height - pad.t - pad.b;
    const all = series.flatMap((s) => s.values).filter(Number.isFinite).concat(Number.isFinite(target) ? [target] : []);
    if (!all.length) return h('p.msg', 'No data to chart for this selection.');
    let min = Math.min(0, ...all); let max = Math.max(...all);
    if (max === min) max = min + 1;
    const step = niceStep((max - min) / 5);
    max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
    const y = (v) => pad.t + H - ((v - min) / (max - min)) * H;
    const n = labels.length;
    const x = (i) => pad.l + (n === 1 ? W / 2 : bars ? (i + 0.5) * (W / n) : i * (W / (n - 1)));
    let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" role="img">`;
    for (let v = min; v <= max + 1e-9; v += step) {
      svg += `<line x1="${pad.l}" x2="${pad.l + W}" y1="${y(v)}" y2="${y(v)}" class="grid-l"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${+v.toFixed(2)}</text>`;
    }
    const every = Math.ceil(n / 16);
    labels.forEach((lb, i) => { if (i % every === 0) svg += `<text x="${x(i)}" y="${pad.t + H + 14}" text-anchor="end" transform="rotate(-35 ${x(i)} ${pad.t + H + 14})" class="ax">${U.esc(lb)}</text>`; });
    if (Number.isFinite(target)) svg += `<line x1="${pad.l}" x2="${pad.l + W}" y1="${y(target)}" y2="${y(target)}" class="target-l"/><text x="${pad.l + W}" y="${y(target) - 4}" text-anchor="end" class="ax target-t">Target ${target}</text>`;
    const colors = ['#1f3fbf', '#d0302a', '#1a8a3a', '#c88a00', '#7a2aa8'];
    series.forEach((s, si) => {
      const c = s.color || colors[si % colors.length];
      if (bars) {
        const bw = (W / n) * 0.7 / series.length;
        s.values.forEach((v, i) => { if (Number.isFinite(v)) svg += `<rect x="${x(i) - (W / n) * 0.35 + si * bw}" y="${Math.min(y(v), y(0))}" width="${bw}" height="${Math.abs(y(0) - y(v))}" fill="${c}"><title>${U.esc(labels[i])}: ${+v.toFixed(2)}</title></rect>`; });
      } else {
        const pts = s.values.map((v, i) => (Number.isFinite(v) ? `${x(i)},${y(v)}` : null)).filter(Boolean);
        svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
        s.values.forEach((v, i) => { if (Number.isFinite(v)) svg += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${c}"><title>${U.esc(labels[i])}: ${+v.toFixed(2)}</title></circle>`; });
      }
    });
    if (yLabel) svg += `<text x="14" y="${pad.t + H / 2}" transform="rotate(-90 14 ${pad.t + H / 2})" text-anchor="middle" class="ax">${U.esc(yLabel)}</text>`;
    svg += '</svg>';
    const legend = series.length > 1 ? h('div.legend', series.map((s, si) => h('span', h('i', { style: { background: s.color || colors[si % colors.length] } }), s.name))) : null;
    return h('div.chart-box', { html: svg }, legend);
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  function scatter({ points, xLabel, yLabel, width = 760, height = 360 }) {
    const pad = { l: 56, r: 20, t: 20, b: 48 };
    const W = width - pad.l - pad.r; const H = height - pad.t - pad.b;
    if (!points.length) return h('p.msg', 'No data to chart for this selection.');
    const xs = points.map((p) => p[0]); const ys = points.map((p) => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x0 === x1) x1 = x0 + 1; if (y0 === y1) y1 = y0 + 1;
    const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * W; const Y = (v) => pad.t + H - ((v - y0) / (y1 - y0)) * H;
    let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%">`;
    const sx = niceStep((x1 - x0) / 6); const sy = niceStep((y1 - y0) / 5);
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1; v += sy) svg += `<line x1="${pad.l}" x2="${pad.l + W}" y1="${Y(v)}" y2="${Y(v)}" class="grid-l"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="ax">${+v.toFixed(2)}</text>`;
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1; v += sx) svg += `<text x="${X(v)}" y="${pad.t + H + 16}" text-anchor="middle" class="ax">${+v.toFixed(2)}</text>`;
    points.forEach((p) => { svg += `<circle cx="${X(p[0]) + (Math.random() - 0.5) * 4}" cy="${Y(p[1]) + (Math.random() - 0.5) * 4}" r="3" fill="#1f3fbf" fill-opacity="0.45"/>`; });
    // regression line
    const n = points.length; const mx = U.avg(xs); const my = U.avg(ys);
    const b = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / (points.reduce((s, p) => s + (p[0] - mx) ** 2, 0) || 1);
    const a = my - b * mx;
    svg += `<line x1="${X(x0)}" y1="${Y(a + b * x0)}" x2="${X(x1)}" y2="${Y(a + b * x1)}" stroke="#d0302a" stroke-width="2"/>`;
    svg += `<text x="${pad.l + W / 2}" y="${height - 8}" text-anchor="middle" class="ax">${U.esc(xLabel)}</text><text x="14" y="${pad.t + H / 2}" transform="rotate(-90 14 ${pad.t + H / 2})" text-anchor="middle" class="ax">${U.esc(yLabel)}</text></svg>`;
    return h('div.chart-box', { html: svg }, h('div.legend', `n = ${n}   ·   y = ${a.toFixed(2)} + ${b.toFixed(3)}·x`));
  }

  /* ---------- saving files ---------- */
  async function saveFile(filename, text, mime = 'text/plain') {
    if (/^swineos-backup/i.test(filename) && S.safety) setTimeout(() => S.safety.markDownload(), 0);
    try {
      if (window.claude && window.claude.use) {
        const dl = await Promise.race([window.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 1500))]);
        if (dl) { await dl.save({ filename, data: text }); return; }
      }
    } catch (e) { if (e && e.code && e.code !== 'not_granted' && e.code !== 'unavailable') { toast('Download cancelled.', 'info'); return; } }
    const blob = new Blob([text], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /** Open printable HTML (report preview window). Falls back to an in-page preview. */
  /** opts.bare: no title lines (the content brings its own, e.g. sow cards); opts.css: extra styles for "Save as file". */
  function printPreview(title, contentNode, opts = {}) {
    const body = h('div.print-sheet' + (opts.bare ? '.bare' : ''), opts.bare ? null : h('h2', title), opts.bare ? null : h('div.print-farm', `${S.store.settings.farmNumber} ${S.store.settings.farmName}  ·  printed ${U.fmt(U.today())}`), contentNode);
    const m = modal({ title: 'Preview – ' + title, body, width: 980, cls: 'preview', buttons: [
      { label: 'Print', primary: true, manual: true, cls: 'print-btn', onClick: () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); return true; } },
      { label: 'Save as file', manual: true, onClick: () => {
        const css = 'body{font:12px Arial,sans-serif;margin:16px}table{border-collapse:collapse;margin:4px 0 12px}th,td{border:1px solid #999;padding:2px 6px;white-space:nowrap}th{background:#eee}h2{margin:0}h4{margin:12px 0 2px;color:#000080}.write{min-width:150px}.sowcard{border:2px solid #000;padding:8px;margin-bottom:12px;page-break-inside:avoid}.sc-line{border-bottom:1px solid #999;height:22px}.al-sec{page-break-inside:avoid}';
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${U.esc(title)}</title><style>${css}${opts.css || ''}</style></head><body>${body.outerHTML}</body></html>`;
        saveFile(title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + U.today() + '.html', html, 'text/html');
        return true;
      } },
      { label: 'Close' },
    ] });
    m.box.parentElement.classList.add('print-target');
    return m;
  }

  /** Labelled form row. */
  function field(label, input, note) {
    return h('label.frow', h('span.flabel', label), input, note ? h('span.fnote', note) : null);
  }
  function select(id, options, value, attrs = {}) {
    return h('select', { id, ...attrs }, options.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(value) ? 'selected' : null }, t);
    }));
  }
  function input(id, value, attrs = {}) { return h('input', { id, value: value ?? '', ...attrs }); }
  /**
   * Date box showing "Feb/19/26" (the browser's own date box can only show month numbers).
   * Type a date (Feb 19, 2/19/26, feb/19/2026 …) or use the calendar button. Up / Down change it by a day.
   * .value reads and sets an ISO date (YYYY-MM-DD) like a normal date input, so code using it does not change.
   */
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  function dateInput(id, value, attrs = {}) {
    const { max, min, ...rest } = attrs;
    const text = h('input.dt', { id, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Mmm/DD/YY', 'aria-label': rest['aria-label'] || 'Date', ...rest });
    const pick = h('input.dt-native', { type: 'date', tabindex: -1, 'aria-hidden': 'true', max: max || null, min: min || null });
    const btn = h('button.dt-btn', { type: 'button', tabindex: -1, title: 'Pick a date', 'aria-label': 'Pick a date', html: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="none" stroke="currentColor"/><path d="M1.5 6h13M5 1v3M11 1v3" stroke="currentColor"/></svg>' });
    const wrap = h('span.dt-wrap', text, btn, pick);
    let iso = '';
    const raw = () => NATIVE.get.call(text);
    const check = (v) => { const bad = !!v && (!!(max && v > max) || !!(min && v < min)); text.classList.toggle('bad', bad); text.title = bad ? (max && v > max ? `Latest allowed: ${U.fmt(max)}` : `Earliest allowed: ${U.fmt(min)}`) : ''; };
    const put = (v) => { iso = v || ''; NATIVE.set.call(text, U.fmt(iso)); pick.value = iso; check(iso); };
    Object.defineProperty(text, 'value', {
      configurable: true,
      // while typing, the text is read as a date as soon as it makes one
      // text that is not a date reads as no date (so Save asks for one instead of keeping an old date)
      get: () => { const t = raw(); if (!t.trim()) return ''; return U.parseDate(t) || ''; },
      set: (v) => put(v),
    });
    const fire = (type) => text.dispatchEvent(new Event(type, { bubbles: true }));
    text.addEventListener('change', () => {
      const t = raw();
      if (!t.trim()) { iso = ''; pick.value = ''; text.classList.remove('bad'); return; }
      const p = U.parseDate(t);
      if (p) put(p); else { text.classList.add('bad'); text.title = 'Not a date – type it like Feb/19/26'; }
    }, true);
    text.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const base = text.value || U.today();
      put(U.addDays(base, e.key === 'ArrowUp' ? 1 : -1)); fire('input'); fire('change');
    });
    btn.addEventListener('click', () => { pick.value = text.value || U.today(); try { pick.showPicker(); } catch (e) { pick.focus(); pick.click(); } });
    pick.addEventListener('change', () => { if (!pick.value) return; put(pick.value); fire('input'); fire('change'); text.focus(); });
    put(value || '');
    // the wrapper behaves like the input for code that holds on to it
    Object.defineProperty(wrap, 'value', { get: () => text.value, set: (v) => { text.value = v; } });
    wrap.input = text;
    wrap.focus = (o) => text.focus(o);
    wrap.dispatchEvent = (ev) => EventTarget.prototype.dispatchEvent.call(text, new Event(ev.type, { bubbles: true }));
    return wrap;
  }

  S.ui = { icon, ICONS, toast, modal, confirmBox, alertBox, appWindow, grid, contextMenu, lineChart, scatter, saveFile, printPreview, field, select, input, dateInput };
})(window.SOS);
