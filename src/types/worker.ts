/**
 * 예측 엔진 경계 타입 — ML 설계 §6.1 이식 (B5)
 *
 * 정본: [ML 설계 §6.1](../../docs/planning/ml/version1.0/ML_설계_v1_0.md) ·
 * 구현 명세: [F05 impl §4.1](../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * 판별 유니온의 `type`·`payload` 구조는 §6.1 그대로입니다. 두 곳만 의도적으로 갈리며
 * 근거는 F05 impl §4.1과 §7에 있습니다:
 *
 * 1. **응답 봉투에 `generation`** — §6.1에는 세대 식별자가 없어, 취소가 청크 경계에서만
 *    반영되는 구조와 겹치면 구식 결과를 새 결과로 오인하는 경로가 실재합니다(F04-R4 위반).
 * 2. **`Iterations`에 강등값 2종 추가** — §6.1의 `5000 | 25000` 으로는 F06-R7의
 *    "반복 횟수를 절반으로" 상태를 타입으로 표현할 수 없습니다.
 *
 * `replay`(F11)는 **일부러 넣지 않았습니다** — `InterventionContext`는 F11 구현 명세 없이는
 * 추측이 되고, 그것이 B4가 이 파일을 비워 둔 이유와 같습니다(구현규약 §0). B6에서 유니온에
 * 추가하면 Worker의 exhaustive switch가 컴파일 에러로 처리 누락을 잡아 줍니다.
 */

import type { MatchId, Probabilities } from './data';

/**
 * 조정 계층이 산출한 "엔진이 실제로 볼 값"
 *
 * 계약 벡터 10원소 중 런타임에 변하는 것은 `elo_diff` 하나이고, 그 자리에
 * `effectiveEloDiff`가 들어갑니다. 나머지 9개는 상대별 상수라
 * `public/model/score-params.json`의 `contexts[matchId]`에 있습니다.
 */
export interface TacticContext {
  matchId: MatchId;
  /** Δ_eff — 분류기 입력의 `elo_diff` 자리 (구현규약 §5-7) */
  effectiveEloDiff: number;
  /** 조정 후 λ 쌍 [자기, 상대] — 스코어 모델 입력 */
  lambda: readonly [number, number];
  /**
   * 조정 전 기준 λ 쌍. 무승부 몫 채널이 **변화량**을 쓰기 때문에 기준값이 함께 가야
   * 합니다 (03장 §6.2 — `d_shift = p_λ(λ_adj).draw − p_λ(λ⁰).draw`).
   */
  lambda0: readonly [number, number];
  /**
   * 이 컨텍스트를 만든 커밋의 세대 번호. Worker 응답이 자기 세대와 다르면 구식이므로
   * 버립니다 (F04-R4 "구식 결과 표시 금지").
   */
  generation: number;
}

/** 결과 3범주. `score-params.json`의 `model.classOrder`와 같은 순서 */
export type Outcome = 'win' | 'draw' | 'lose';

/** `classOrder` 순서 — 배열 인덱스 ↔ 범주 변환의 유일한 정본 */
export const OUTCOME_ORDER: readonly Outcome[] = ['win', 'draw', 'lose'];

/** 한 범주의 신뢰구간 끝점. 중심은 표시 확률이 이미 들고 있으므로 담지 않는다 */
export interface Interval {
  low: number;
  high: number;
}

/**
 * §6.1이 `wilson: Band` 단수로 적은 것의 실체 — **3범주 묶음**입니다.
 * 이름을 복수로 바꾸지 않은 것은 계약 문구를 보존하기 위해서입니다.
 */
export interface Band {
  win: Interval;
  draw: Interval;
  lose: Interval;
}

/** HOPs 1프레임 = 몬테카를로 1회 (평가_설계 §4.5) */
export interface Frame {
  outcome: Outcome;
  /** 자기 득점 */
  self: number;
  /** 상대 득점 */
  opp: number;
}

/**
 * 반복 횟수 — 정상값 2종과 각각의 절반(F06-R7 자동 강등)
 *
 * `number`로 넓히지 않는 이유: 임의의 반복 수가 들어오면 화면에 표기되는 "N회 시뮬레이션"이
 * 무엇이든 될 수 있고, 평가_설계 §4.3이 근거를 댄 값과 무관해집니다.
 */
export type Iterations = 2500 | 5000 | 12500 | 25000;

export const FAST_ITERATIONS = 5000 satisfies Iterations;
export const PRECISE_ITERATIONS = 25000 satisfies Iterations;

/** 강등 = 절반. 유니온 안에서 닫혀 있으므로 분기 누락이 컴파일에 걸린다 */
export function halveIterations(iterations: Iterations): Iterations {
  switch (iterations) {
    case 25000:
      return 12500;
    case 12500:
      return 12500;
    case 5000:
      return 2500;
    case 2500:
      return 2500;
  }
}

/* ---------------------------------------------------------------------------
 * 메시지 프로토콜 (ML 설계 §6.1)
 * ------------------------------------------------------------------------- */

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'infer'; payload: TacticContext }
  | { type: 'simulate'; payload: TacticContext & { iterations: Iterations } }
  | { type: 'cancel' };

export type WorkerResponse =
  | { type: 'ready' }
  | {
      type: 'result';
      payload: { p: [number, number, number]; wilson: Band; frames: Frame[] };
    }
  | { type: 'progress'; payload: { done: number; total: number } }
  | { type: 'cancelled' }
  | { type: 'error'; payload: { stage: 'load' | 'infer' | 'simulate' } };

/**
 * 실제로 `postMessage` 되는 것 — 응답에 세대를 얹은 봉투
 *
 * `init`에 대한 `ready`처럼 세대가 없는 응답은 `0`을 씁니다. 세대 판정은 "현재 적용된
 * 세대보다 낮으면 버린다"이므로 0은 언제나 폐기 대상이 아닌 값(초기 세대는 1부터)입니다.
 */
export type WorkerResponseEnvelope = WorkerResponse & { generation: number };

/** 폴백 배지가 밝히는 이유 — 화면 본문이 아니라 보조 설명에 쓴다 */
export type EstimateReason = 'load-failed' | 'timeout' | 'unavailable' | 'infer-failed';

/** Worker 결과를 앱 타입으로 옮긴 것. 스토어에 들어가는 형태 */
export interface EngineResult {
  p: Probabilities;
  band: Band;
  frames: Frame[];
  iterations: Iterations;
  /** 요청 전송 → 결과 수신 왕복 시간. F06-R5 표기·F06-R7 강등 판정에 쓴다 */
  elapsedMs: number;
}
