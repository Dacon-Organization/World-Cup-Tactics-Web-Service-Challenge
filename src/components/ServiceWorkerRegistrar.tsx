'use client';

import { useEffect } from 'react';

/**
 * Service Worker 등록 (F05 GWT 2 — 재방문 오프라인)
 *
 * 구현 명세: [F05 impl §4.7](../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * **등록 실패는 무시합니다.** SW는 재방문 최적화이지 기능이 아닙니다. `serviceWorker`가
 * 없거나(사파리 프라이빗 모드) 등록이 거부돼도 앱은 완전히 동작해야 합니다 — 여기서
 * 예외가 새어 나가면 콘솔 에러 0건(B8 게이트)이 깨집니다.
 *
 * 개발 모드에서는 등록하지 않습니다. HMR 청크가 캐시에 잡히면 코드를 고쳐도 화면이
 * 바뀌지 않는 상태가 되고, 그 원인을 찾는 데 드는 시간이 캐싱으로 얻는 것보다 큽니다.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 조용히 넘어가는 유일한 예외 — 실패해도 사용자가 잃는 기능이 없다
    });
  }, []);

  return null;
}
