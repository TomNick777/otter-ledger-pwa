const CACHE_NAME = 'otter-ledger-v6';
const BASE_URL = self.location.pathname.replace(/\/sw\.js$/, '');

const urlsToCache = [
  BASE_URL + '/',
  BASE_URL + '/index.html',
  BASE_URL + '/app.js',
  BASE_URL + '/manifest.json',
  BASE_URL + '/icons/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(networkResponse => {
          // 缓存新资源
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        }).catch(() => {
          // 网络失败时返回缓存的首页
          return caches.match(BASE_URL + '/index.html');
        });
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});
