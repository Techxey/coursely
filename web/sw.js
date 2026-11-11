/* 课序 · Service Worker（离线可用）
   策略：network-first，失败回退缓存。开发时不会看到旧文件。 */
const CACHE = 'coursely-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './css/tokens.css',
  './css/base.css',
  './css/today.css',
  './css/schedule.css',
  './css/todos.css',
  './css/focus.css',
  './css/me.css',
  './js/store.js',
  './js/domain.js',
  './js/ui.js',
  './js/app.js',
  './js/pages/today.js',
  './js/pages/schedule.js',
  './js/pages/todos.js',
  './js/pages/focus.js',
  './js/pages/me.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
