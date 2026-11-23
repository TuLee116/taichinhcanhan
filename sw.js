/* Sổ Cá Nhân – service worker
 * Lưu giao diện để app chạy được khi không có mạng.
 * Khi phát hành bản mới: tăng VERSION để máy người dùng tải lại bộ đệm.
 */
const VERSION = '1.0.2';
const APP_CACHE = 'so-ca-nhan-app-' + VERSION;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './fonts/montserrat-vietnamese.woff2',
  './fonts/montserrat-latin-ext.woff2',
  './fonts/montserrat-latin.woff2'
];

// Không tự skipWaiting: app hiện thanh "Có bản mới" và gửi 'skip' khi người dùng bấm.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('so-ca-nhan-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skip' || (event.data && event.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Các yêu cầu ra ngoài khác (vd. máy chủ đồng bộ) đi thẳng mạng.
  if (url.origin !== self.location.origin) return;

  // App dùng sw.js?ping=... để kiểm tra mạng thật → không được trả từ bộ đệm.
  if (url.pathname.endsWith('/sw.js')) return;
  // Tệp người dùng tải lên phục vụ qua /_blob/ – không lưu đệm.
  if (url.pathname.includes('/_blob/')) return;
  // API của máy chủ đồng bộ – luôn đi thẳng mạng.
  if (url.pathname === '/health' || url.pathname.startsWith('/sync')) return;

  if (req.mode === 'navigate') {
    event.respondWith(pageNetworkFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, event));
});

// Trang: ưu tiên mạng (để nhận bản mới), quá 4 giây hoặc mất mạng thì dùng bản đã lưu.
async function pageNetworkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await withTimeout(fetch(req), 4000);
    // Chỉ nhận trang HTML; máy chủ trả thứ khác (JSON lỗi, trang bảo trì…) thì dùng bản đã lưu.
    const isHtml = res && res.ok && (res.headers.get('content-type') || '').includes('text/html');
    if (isHtml) { cache.put('./index.html', res.clone()); return res; }
    const saved = await cache.match('./index.html');
    if (saved) return saved;
    return res;
  } catch (e) {
    return (await cache.match('./index.html')) || (await cache.match('./')) ||
      new Response('<!doctype html><meta charset="utf-8"><title>Sổ Cá Nhân</title><p style="font-family:sans-serif;padding:24px">Không có mạng và chưa có bản lưu. Hãy mở app một lần khi có mạng.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

// Tệp tĩnh: trả bản lưu ngay, cập nhật ngầm từ mạng.
async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(network); return cached; }
  return (await network) || new Response('', { status: 504 });
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
