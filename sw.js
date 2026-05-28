// Phase 2: ネットワーク優先、失敗時のみキャッシュ。
// 本格的なキャッシュ更新戦略は Phase 3 で実装する(設計図 §5.キャッシュ更新戦略 参照)

const CACHE_NAME = 'asagiri-inventory-v0.4.0';
const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './config.js',
  './manifest.json',
  './inventory.html',
  './inventory.js',
  './inventory.css',
  './icons/ui-scan.svg',
  './icons/ui-manual.svg',
  './icons/ui-stockin.svg',
  './icons/ui-stockout.svg',
  './icons/ui-move.svg',
  './icons/ui-dispose.svg',
  './icons/ui-stocktake.svg',
  './icons/ui-settings.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // GAS API リクエストはキャッシュしない(常にネットワーク)
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // 静的アセットはネットワーク優先、失敗時キャッシュ
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
