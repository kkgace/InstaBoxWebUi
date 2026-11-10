/* InstaBox Console service worker：静态资源缓存优先，API/WS 永不缓存 */
const CACHE = 'instabox-ui-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 代理 API、WebSocket、登录、webhook 收件箱：永不缓存
  if (url.pathname.startsWith('/p/') || url.pathname.startsWith('/ws') ||
      url.pathname === '/auth' || url.pathname.startsWith('/hook') || url.pathname === '/healthz') return;
  if (e.request.method !== 'GET') return;
  // 静态资源（带 hash）：缓存优先
  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/icon.svg') {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      }))
    );
    return;
  }
  // SPA 路由：网络优先，失败回退缓存的 index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return resp;
      }).catch(() => caches.match('/'))
    );
  }
});
