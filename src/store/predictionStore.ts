/**
 * 예측 스토어 — 엔진이 채우는 것 (구현규약 §3 predictionSlice)
 *
 * `tacticsStore`와 **분리된 스토어**인 이유는 F05-R2("추론 중에는 직전 값을 유지")를
 * 구조로 보장하기 위해서입니다. 전술이 변해도 `p`는 새 결과가 도착할 때까지 그대로입니다.
 * 한 스토어에 섞으면 "조작했는데 확률이 잠깐 비는" 상태가 코드상 가능해집니다.
 *
 * ## B5에서 신설한 것
 *
 * `band`·`frames`·`iterations`·`progress`·`degraded`·`appliedGeneration`.
 * `context`는 B4가 쓰고 B5가 읽는 인계 지점이며 그대로 유지합니다.
 */

import { create } from 'zustand';
import { defaults } from '@/lib/data';
import type { EngineStatus } from '@/lib/prediction/client';
import type { Probabilities } from '@/types/data';
import type { Band, EngineResult, EstimateReason, Frame, TacticContext } from '@/types/worker';

/**
 * `precomputed`가 `null`이면 F08(첫 페인트에 확률)이 깨집니다. B3 완료 후에는 값이 있고
 * G2가 그것을 검사하지만, 타입이 `| null`이므로 분기는 남겨 둡니다 — 조용히 0으로
 * 채우면 "승률 0%"가 화면에 뜹니다 (구현규약 §6 침묵 실패 금지).
 */
export const INITIAL_PROBABILITIES: Probabilities | null = defaults.precomputed;

interface PredictionState {
  /** 표시 확률. 초기값은 사전 계산값이고, 엔진 결과가 도착할 때만 교체된다 */
  p: Probabilities | null;
  /** 어떤 엔진이 낸 값인가. `null` = 아직 추론된 적 없음(사전 계산값) */
  engine: 'onnx' | 'fallback' | null;
  status: EngineStatus;
  /** 조정 계층 산출물 — **B4가 쓰고 B5가 읽는 인계 지점** */
  context: TacticContext | null;

  /** 승/무/패 Wilson 묶음. `null`이면 MC가 아직 돌지 않았다는 뜻 */
  band: Band | null;
  /** HOPs 재료 (F07). 세션 메모리만 — URL에 싣지 않는다 */
  frames: Frame[];
  /** 화면에 표기할 실제 반복 횟수 (F06-R3) */
  iterations: number | null;
  /** 마지막 결과의 왕복 시간 — 정밀 모드 10초 초과 표기용 (F06-R5) */
  elapsedMs: number | null;
  progress: { done: number; total: number } | null;
  /** F06-R7 자동 강등. 세션 동안 되돌리지 않는다 */
  degraded: boolean;
  fallbackReason: EstimateReason | null;
  /**
   * 화면에 반영된 최신 세대. 이보다 낮은 결과는 구식이므로 버린다 (F04-R4).
   *
   * 훅 로컬 ref가 아니라 스토어에 두는 이유: 훅이 두 번 마운트되는 상황에서 판정 기준이
   * 갈라지면 안 됩니다. 표시값과 같은 곳에 있어야 "지금 화면의 값은 몇 세대인가"가
   * 하나로 정해집니다.
   */
  appliedGeneration: number;

  setContext: (context: TacticContext) => void;
  setStatus: (status: EngineStatus) => void;
  setEngine: (engine: 'onnx' | 'fallback', reason: EstimateReason | null) => void;
  setProgress: (generation: number, progress: { done: number; total: number } | null) => void;
  setResult: (generation: number, result: EngineResult) => void;
  setDegraded: (degraded: boolean) => void;
}

export const usePredictionStore = create<PredictionState>()((set) => ({
  p: INITIAL_PROBABILITIES,
  engine: null,
  status: 'idle',
  context: null,
  band: null,
  frames: [],
  iterations: null,
  elapsedMs: null,
  progress: null,
  degraded: false,
  fallbackReason: null,
  appliedGeneration: 0,

  setContext: (context) => set({ context }),

  setStatus: (status) => set({ status }),

  setEngine: (engine, reason) => set({ engine, fallbackReason: engine === 'fallback' ? reason : null }),

  setProgress: (generation, progress) =>
    set((state) => (generation < state.appliedGeneration ? {} : { progress })),

  setResult: (generation, result) =>
    set((state) => {
      // 늦게 도착한 옛 세대의 결과가 최신 화면을 덮어쓰지 못하게 한다
      if (generation < state.appliedGeneration) return {};
      return {
        appliedGeneration: generation,
        p: result.p,
        band: result.band,
        frames: result.frames,
        iterations: result.iterations,
        elapsedMs: result.elapsedMs,
        progress: null,
      };
    }),

  setDegraded: (degraded) => set({ degraded }),
}));
