/* SwineOS – landing page (Herd records / Finances). */
(function (S) {
  'use strict';
  const U = S.U; const h = U.h;
  const ui = () => S.ui;

  const ICON_HERD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_MONEY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 9.5v5M18 9.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function farmLine() {
    const st = S.store.settings || {};
    return `${st.farmNumber || ''} ${st.farmName || ''}`.trim();
  }

  /** The first screen: pig, name and the two parts of SwineOS. */
  function landing() {
    const win = h('section.win.landing-win');
    win.appendChild(h('div.win-title.ld-title', h('span.win-name', farmLine() ? `SwineOS  -  [${farmLine()}]` : 'SwineOS'), S.dataMgmt.gear()));
    const btn = (icon, label, sub, fn) => h('button.ld-btn', { type: 'button', onclick: fn },
      h('span.ld-ico', { html: icon }), h('span.ld-txt', h('b', label), h('small', sub)));
    win.appendChild(h('main.ld-main',
      h('div.ld-pig', { html: ui().ICONS.sow }),
      h('h1.ld-name', h('span.l1', 'Swine'), h('span.l2', 'OS')),
      h('p.ld-tag', 'Sow herd records and farm finances'),
      h('div.ld-btns',
        btn(ICON_HERD, 'Herd records', 'Matings, farrowings, weaning, sow cards and reports', () => S.app.home()),
        btn(ICON_MONEY, 'Finances', 'Income, expenses and year end', () => S.app.finances()))));
    win.appendChild(h('footer.ld-foot', farmLine()));
    return win;
  }

  S.landing = { landing };
})(window.SOS);
