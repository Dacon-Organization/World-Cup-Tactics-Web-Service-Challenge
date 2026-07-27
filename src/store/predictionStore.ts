/**
 * 예측 스토어 — 엔진이 채우는 것 (구현규약 §3 predictionSlice)
 *
 * `tacticsStore`와 **분리된 스토어**인 이유는 F05-R2("추론 중에는 직전 값을 유지")를
 * 구조로 보장하기 위해서입니다. 전술이 변해도 `p`는 새 결과가 도착할 때까지 그대로입니다.
 * 한 스토어에 섞으면 "조작했는데 확률이 잠깐 비는" 상태가 코드상 가능해집니다.
 *
 * ## B4 범위
 *
 * B4가 채우는 것은 `context` 하나입니다 — 조정 계층 산출물이고, **B5의 Worker가 이것을
 * 읽어 `p`를 갱신**합니다. `p`의 초기값은 `defaults.precomputed`(F08-R1)이며, B5가 같은
 * 기본 상태를 추론해도 값이 같으므로 사용자에게는 아무 일도 일어나지 않습니다 —
 * 그것이 F08-R3의 "무단절 교체"입니다.
 *
 * `frames`·`band`·`progress`·`degraded`는 F06·F07의 타입에 딸려 있어 B5에서 신설합니다
 * (구현규약 §0 — 쓰이지 않을 정의를 미리 굳히지 않는다).
 */

import { create } from 'zustand';
import { defaults } from '@/lib/data';
import type { Probabilities } from '@/types/data';
import type { TacticContext } from '@/types/worker';

/**
 * `precomputed`가 `null`이면 F08(첫 페인트에 확률)이 깨집니다. B3 완료 후에는 값이 있고
 * G2가 그것을 검사하지만, 타입이 `| null`이므로 분기는 남겨 둡니다 — 조용히 0으로
 * 채우면 "승률 0%"가 화면에 뜹니다 (구현규약 §6 침묵 실패 금지).
 */
export const INITIAL_PROBABILITIES: Probabilities | null = defaults.precomputed;

interface PredictionState {
  /** 표시 확률. B4에서는 사전 계산값에 고정 */
  p: Probabilities | null;
  /** 어떤 엔진이 낸 값인가 — B5가 채운다. `null` = 아직 추론된 적 없음(사전 계산값) */
  engine: 'onnx' | 'fallback' | null;
  status: 'idle' | 'loading' | 'inferring' | 'simulating' | 'error';
  /** 조정 계층 산출물 — **B4가 쓰고 B5가 읽는 인계 지점** */
  context: TacticContext | null;
  setContext: (context: TacticContext) => void;
}

export const usePredictionStore = create<PredictionState>()((set) => ({
  p: INITIAL_PROBABILITIES,
  engine: null,
  status: 'idle',
  context: null,

  setContext: (context) => set({ context }),
}));
