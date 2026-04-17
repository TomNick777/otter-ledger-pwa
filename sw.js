const CACHE_NAME = 'otter-ledger-v10';
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

// 网络优先 + 绕过HTTP缓存：对 HTML/JS 文件强制从服务器获取最新版
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppAsset = url.pathname.endsWith('.html') ||
                     url.pathname.endsWith('.js') ||
                     url.pathname.endsWith('.json') ||
                     url.pathname.endsWith('.css');

  // HTML/JS: 强制绕过HTTP缓存，始终从服务器获取最新
  if (isAppAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(networkResponse => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || caches.match(BASE_URL + '/index.html'));
        })
    );
    return;
  }

  // 其他资源（图片等）：正常网络优先
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
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
