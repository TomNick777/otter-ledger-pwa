const CACHE_NAME = 'otter-ledger-v8';
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

// 网络优先策略：先请求网络，失败才用缓存
// 这样每次部署新版本，用户不需要清缓存就能看到最新代码
self.addEventListener('fetch', event => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // 网络成功：更新缓存并返回
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // 网络失败：从缓存读取（离线模式）
        return caches.match(event.request)
          .then(cached => cached || caches.match(BASE_URL + '/index.html'));
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
