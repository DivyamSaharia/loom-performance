// W2 Looms service worker: an offline copy of the app itself (audit #20).
// The page, its scripts, styles and icons come from the network first (so a publish shows on the first open) and fall back to
// the saved copy when offline or slow. The data comes from the database (Supabase, another origin) and is never cached here:
// with no connection the app opens and says it cannot reach the database. The sealed data files left from the passcode view
// (switchover, 14 Nov 2026) are deleted from the device on activate. BUILD is stamped by pipeline/publish_site.py.
'use strict';
const BUILD = '0e5761a8530e';
const SHELL = 'w2-shell-' + BUILD;
const NET_WAIT = 4000;   // ms to wait for the network before using the saved copy
const OLD_DATA = 'w2-data';   // the passcode view's sealed data copies: removed
const SHELL_FILES = ['./', 'index.html', 'app/style.css', 'app/core.js', 'app/model.js', 'app/calc.js', 'app/panel.js', 'app/pages-looms.js', 'app/trends.js',
  'app/pages-config.js', 'app/charts.js', 'app/visuals.js', 'app/costing.js', 'app/guide.js', 'app/db.js', 'app/fabric_calc.js', 'app/fabric.js', 'app/nav.js', 'app/loader.js', 'manifest-db.webmanifest', 'pick-manifest.js', 'manifest-db.webmanifest', 'pick-manifest.js', 'logo.svg', 'icon.svg',
  'icon-192.png', 'apple-touch-icon.png'];

const scopeUrl = new URL(self.registration.scope);
const isShell = (u) => u.origin === scopeUrl.origin && u.pathname.startsWith(scopeUrl.pathname);
const keyOf = (u) => { const k = new URL(u.href); k.searchParams.delete('t'); k.searchParams.delete('v'); return k.href; };   // ?t= and ?v= are cache busters

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(async (f) => {
      try { const r = await fetch(new Request(f, {cache: 'reload'})); if (r.ok) await c.put(keyOf(new URL(r.url)), r); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith('w2-shell-') && k !== SHELL) || k === OLD_DATA) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (isShell(u)) {
    // newest copy first: the page and its scripts come from the network, so a publish shows on the first open. The saved copy
    // is used only when the network fails or takes longer than NET_WAIT. The scripts follow the page the same way, so they
    // are never older than the page (the cache key ignores ?v=, which is why a cache-first page would mix versions).
    ev.respondWith((async () => {
      const c = await caches.open(SHELL);
      const key = keyOf(u);
      const net = fetch(req).then((r) => { if (r.ok) c.put(key, r.clone()); return r; });
      const saved = () => c.match(key, {ignoreSearch: false}).then((h) => h || (req.mode === 'navigate' ? c.match(keyOf(new URL('index.html', scopeUrl))) : null));
      let timer;
      const slow = new Promise((res) => { timer = setTimeout(() => res(null), NET_WAIT); });
      try {
        const r = await Promise.race([net, slow]);   // a slow network keeps running and still refreshes the cache
        if (r) return r;
        const hit = await saved();
        if (hit) { ev.waitUntil(net.catch(() => {})); return hit; }
        return await net;
      } catch (e) {
        const hit = await saved();
        if (hit) return hit;
        return new Response('Offline and no copy of the app on this device yet.', {status: 503, headers: {'Content-Type': 'text/plain'}});
      } finally { clearTimeout(timer); }
    })());
  }
});
