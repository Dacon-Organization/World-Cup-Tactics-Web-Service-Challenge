/**
 * 예측 엔진 경계 타입
 *
 * 구현규약 §4의 Worker 계약(ML 설계 §6.1 이식)은 **B5에서 전량 이식**합니다.
 * B4가 정의하는 것은 조정 계층의 산출물, 즉 **엔진에 넘길 컨텍스트 하나**입니다 —
 * B4는 이 값을 만들어 `predictionStore`에 두고, B5의 Worker가 그것을 소비합니다.
 *
 * 여기에 `WorkerRequest`/`WorkerResponse`를 미리 쓰지 않는 이유: `Frame`·`Band`·
 * `InterventionContext`는 F06·F11의 설계에 딸린 타입이라, 그 기능의 구현 명세 없이
 * 지금 확정하면 B5가 문서를 고치면서 시작하게 됩니다 (구현규약 §0 — 앞 블록에서 배운
 * 것이 뒤 문서에 반영되어야 한다).
 */

import type { MatchId } from './data';

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
