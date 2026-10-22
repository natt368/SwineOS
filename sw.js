/* SwineOS – service worker: keeps a copy of the app on this computer so it opens without internet.
 * Pages are fetched from the network first (so updates arrive right away) and the saved copy is
 * used when the network is down or too slow. Google sign-in and Drive requests are never touched. */
const VERSION = '__BUILD__';
const CACHE = 'swineos-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'css/swineos.css',
  'js/util.js', 'js/config.js', 'js/model.js', 'js/store.js', 'js/calc.js', 'js/ui.js', 'js/demo.js', 'js/entry.js',
  'js/reports.js', 'js/sowcard.js', 'js/actionlists.js', 'js/settings.js', 'js/pigwin-import.js', 'js/actionentry.js',
  'js/reportgen.js', 'js/drive.js', 'js/safety.js', 'js/mainmenu.js', 'js/xls.js', 'js/finance-import.js', 'js/finance.js', 'js/landing.js', 'js/app.js',
];
const NET_TIMEOUT = 4000; // slow barn internet: fall back to the saved copy after 4 s

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('swineos-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    net.catch(() => {}); // offline: handled below
    const timeout = new Promise((r) => setTimeout(r, NET_TIMEOUT));
    try {
      const res = await Promise.race([net, timeout]);
      if (res) return res;
    } catch (err) { /* offline */ }
    const saved = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    return saved || net;
  })());
});
