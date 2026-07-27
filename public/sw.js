/**
 * Service Worker — 재방문·오프라인에서도 추론이 동작하게 한다 (F05 GWT 2)
 *
 * 구현 명세: docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md §4.7
 *
 * ## 자원별로 전략이 다른 이유
 *
 * | 대상 | 전략 | 근거 |
 * |---|---|---|
 * | /ort/ | cache-first | 13MB 불변 자산. 버전은 package.json이 고정한다 |
 * | /model/ | stale-while-revalidate | 작다(수 KB). B6이 모델을 교체해도 다음 방문에 따라잡는다 |
 * | /_next/static/ | cache-first | 내용 해시 파일명 — 옛 URL이 옛 내용인 것이 정상 |
 * | 내비게이션(HTML) | network-first + 캐시 폴백 | 오프라인에서 열리되, 온라인이면 항상 새 배포를 본다 |
 * | 그 외 | 통과 | 캐시하지 않는다 |
 *
 * **HTML을 cache-first로 두지 않습니다.** 배포해도 옛 화면이 남고, 되돌릴 방법이 사용자
 * 브라우저 밖에 없습니다. 마감이 있는 프로젝트에서 감당할 수 없는 실패 유형입니다.
 *
 * **`skipWaiting()`을 쓰지 않습니다.** 열려 있는 탭의 JS 청크가 교체되면 실행 중 화면이
 * 깨집니다. 새 버전은 다음 방문에 적용됩니다.
 */

const CACHE_VERSION = 'reformation-v1';
const OFFLINE_FALLBACK = '/';

self.addEventListener('install', () => {
  // 사전 캐싱을 하지 않는다 — 무엇이 필요한지는 실제 요청이 알려 준다.
  // 여기서 13MB wasm을 미리 받으면 첫 방문이 그만큼 느려진다
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** 캐시 쓰기 실패는 정상 경로다 — 용량 초과면 다음에 네트워크로 받으면 된다 */
async function putSafely(request, response) {
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response);
  } catch {
    // 무시
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await putSafely(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await putSafely(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  throw new Error('네트워크와 캐시 모두 실패');
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await putSafely(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (await caches.match(OFFLINE_FALLBACK));
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 외부 요청 0건 원칙(C1)상 교차 출처 요청은 존재하지 않아야 한다. 있더라도 캐시하지 않는다
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/ort/') || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/model/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
