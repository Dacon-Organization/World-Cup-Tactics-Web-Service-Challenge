/**
 * JS 통계 폴백 — F05-R4 "간이 추정"의 실체
 *
 * 정본: [ML 설계 §6.3](../../../docs/planning/ml/version1.0/ML_설계_v1_0.md) ·
 * 구현 명세: [F05 impl §4.6](../../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * ```
 * E      = 1 / (1 + 10^(−Δ_eff/400))     // Elo 표준 기대승률
 * p_draw = d̂                              // 학습 데이터 실측 무승부 빈도 (빌드 타임 상수)
 * p_win  = (1 − d̂) · E
 * p_lose = (1 − d̂) · (1 − E)
 * ```
 *
 * ## 왜 슬라이더가 폴백에서도 확률을 움직이는가
 *
 * 입력 `Δ_eff`는 **조정 계층을 통과한 값**입니다(ADR-008). 라인 높이·압박·폭은 λ 비율을
 * 바꾸므로 Δ_eff를 통해 확률에 도달합니다.
 *
 * ## 왜 템포만은 움직이지 않는가
 *
 * 템포는 정의상 λ **비율**을 바꾸지 않고 λ **합**만 바꿉니다. Δ_eff는 비율의 함수라
 * 템포에 반응하지 않고, 정상 경로에서 그 몫을 맡는 무승부 몫 채널(`blendDrawShare`)은
 * 여기 없습니다 — §6.3의 `p_draw`가 상수이기 때문입니다.
 *
 * `blendDrawShare`를 폴백에 끼워 넣으면 4종이 다 움직이지만, 그것은 §6.3 산식을 임의로
 * 확장하는 것입니다. **하지 않습니다** — "간이 추정" 배지가 이미 이 한계를 고지하고
 * 있고, 정직 고지가 산식 미화보다 우선입니다.
 *
 * **메인 스레드에서 실행됩니다.** Worker가 없거나 죽은 상태가 폴백의 전제이므로,
 * 이 파일은 `self`·`postMessage`를 참조하지 않습니다.
 */

import type { Probabilities } from '@/types/data';

/**
 * @param effectiveEloDiff 조정 계층 산출 Δ_eff
 * @param drawRate `score-params.json`의 `fallback.dHat`
 */
export function fallbackProbabilities(
  effectiveEloDiff: number,
  drawRate: number,
): Probabilities {
  const expected = 1 / (1 + Math.pow(10, -effectiveEloDiff / 400));
  // d̂은 배포 상수라 정상 범위지만, 파일이 손상되면 음수 확률이 화면에 갈 수 있다
  const draw = Math.min(1, Math.max(0, drawRate));
  const rest = 1 - draw;

  return {
    win: rest * expected,
    draw,
    lose: rest * (1 - expected),
  };
}
