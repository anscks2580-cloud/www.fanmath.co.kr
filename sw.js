/* 송우찬수학학원 PWA 서비스워커
 * - 홈페이지가 자주 바뀌므로 화면(HTML)은 항상 인터넷에서 새로 받음(네트워크 우선)
 * - 인터넷이 끊겼을 때만 마지막으로 본 화면 또는 오프라인 안내를 보여줌
 * - 외부 서버(파이어베이스·비메오 등) 요청과 이미지·스크립트는 건드리지 않음
 */
const CACHE = 'songmath-pwa-v1';
const OFFLINE_HTML = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>송우찬수학학원</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#F7F6FB;color:#1E1838;text-align:center;padding:24px}
.b{max-width:320px}img{width:96px;height:96px}h1{font-size:18px;margin:18px 0 8px}
p{font-size:14px;color:#6B6489;line-height:1.6;margin:0 0 20px}
button{background:#5B3FA6;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:14px;font-weight:700;font-family:inherit}</style></head>
<body><div class="b"><img src="/assets/icons/icon-192.png" alt=""><h1>인터넷에 연결되어 있지 않습니다</h1>
<p>와이파이나 데이터 연결을 확인한 뒤<br>다시 시도해 주세요.</p>
<button onclick="location.reload()">다시 시도</button></div></body></html>`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/assets/icons/icon-192.png')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('songmath-pwa-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 화면 이동(HTML)만 처리 — 네트워크 우선, 실패 시 저장본/오프라인 안내
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch (err) {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 아이콘만 저장본 사용(오프라인 안내 화면용)
  if (url.pathname.startsWith('/assets/icons/')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});
