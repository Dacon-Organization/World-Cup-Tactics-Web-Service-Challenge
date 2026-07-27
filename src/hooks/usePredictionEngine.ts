'use client';

/**
 * 예측 엔진 수명주기 — Worker 생성은 **Client 마운트 이후**여야 한다
 *
 * 구현 명세: [F05 impl §2·§4.3](../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * 훅 경계가 구현규약 §2의 "SSR 중 `Worker` 참조 금지"를 강제합니다. S2b(F11)·S3(F13)가
 * 같은 훅을 재사용합니다.
 */

import { useCallback, useEffect, useRef } from 'react';
import { createPredictionClient, type PredictionClient } from '@/lib/prediction/client';
import { usePredictionStore } from '@/store/predictionStore';

export interface PredictionEngine {
  /** 정밀 모드 실행 (F06-R2) */
  runPrecise(): void;
  cancel(): void;
}

export function usePredictionEngine(): PredictionEngine {
  const context = usePredictionStore((state) => state.context);
  const clientRef = useRef<PredictionClient | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    const store = usePredictionStore.getState();
    const client = createPredictionClient({
      host: {
        setStatus: store.setStatus,
        setEngine: store.setEngine,
        setProgress: store.setProgress,
        setResult: store.setResult,
        setDegraded: store.setDegraded,
      },
      // `new URL(..., import.meta.url)`은 번들러가 Worker 청크를 만들어 내는 표준 형태다.
      // 문자열 경로를 주면 번들에 포함되지 않아 프로덕션에서 404가 된다
      createWorker: () =>
        new Worker(new URL('../lib/prediction/worker.ts', import.meta.url), { type: 'module' }),
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  // 전술이 커밋될 때마다 빠른 모드를 자동 실행한다 (F06-R1).
  // `context`는 B4의 스케줄러가 debounce 후에만 갱신하므로 여기서 다시 지연시키지 않는다
  useEffect(() => {
    if (!context) return;
    clientRef.current?.request(context, 'fast');
  }, [context]);

  const runPrecise = useCallback(() => {
    const current = contextRef.current;
    if (current) clientRef.current?.request(current, 'precise');
  }, []);

  const cancel = useCallback(() => {
    clientRef.current?.cancel();
  }, []);

  return { runPrecise, cancel };
}
