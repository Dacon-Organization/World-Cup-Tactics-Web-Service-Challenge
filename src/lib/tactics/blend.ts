/**
 * 무승부 몫 채널 — 템포가 확률을 움직이게 하는 경로
 *
 * 정본: `notebooks/03_model_baseline.py` §6.2 (`blend`) · [ITERATION-LOG c3](../../../notebooks/ITERATION-LOG.md)
 *
 * ## 왜 이 파일이 있는가
 *
 * 피처_정의서 §4.1은 λ 변화를 분류기에 **Δ_eff 하나로만** 전달합니다. 그런데 템포는
 * 정의상 λ **비율**을 바꾸지 않고 λ **합**만 바꾸므로(§4.2), Δ_eff 경로만으로는 템포가
 * 확률을 전혀 움직이지 못합니다 — c3에서 실측으로 드러난 설계 공백입니다.
 *
 * 빠진 것은 "λ 합이 무승부 몫을 바꾼다"는 사실이고, 그것을 스코어 격자에서 직접 읽어
 * 채웁니다. 승/패 **비율**은 Δ_eff 채널이 계속 전담하므로 두 채널이 같은 정보를 두 번
 * 세지 않습니다.
 *
 * 기본 상태에서는 `λ_adj == λ⁰` 이므로 `d_shift = 0`, 즉 **분류기 출력 그대로**입니다
 * (FT-R3 항등 유지).
 */

import type { Probabilities } from '@/types/data';

/** `score-params.json`의 `score` 블록 중 격자 산출에 쓰이는 부분 */
export interface ScoreGridConstants {
  /** Dixon–Coles τ 보정 계수 */
  rho: number;
  /** 대각(무승부) 정합 보정 — ML-R8 발동으로 도입 (c3) */
  gamma: number;
  /** 격자 상한 골 수 (0~gridMax) */
  gridMax: number;
  /** 무승부 몫 반영 후 클램프 [하한, 상한] */
  drawShiftClamp: readonly [number, number];
}

/**
 * 포아송 확률질량 0..gridMax
 *
 * 재귀식 `pmf(k) = pmf(k−1) · λ / k` 를 쓰는 이유: `λ^k / k!` 를 직접 계산하면 분자·분모가
 * 각각 커져 상대 오차가 쌓입니다. 재귀는 매 단계가 O(1) 곱셈 하나라 오차가 최소입니다.
 */
function poissonPmf(lambda: number, gridMax: number): number[] {
  const pmf = new Array<number>(gridMax + 1);
  pmf[0] = Math.exp(-lambda);
  for (let k = 1; k <= gridMax; k += 1) {
    pmf[k] = (pmf[k - 1] as number) * (lambda / k);
  }
  return pmf;
}

/**
 * λ 쌍 → 승/무/패 확률 (파이썬 `grid_probs`)
 *
 * 격자 `M[i][j]` = 자기 i골 · 상대 j골. Dixon–Coles τ가 저점수 네 칸을 보정하고,
 * γ가 대각(무승부) 전체를 보정합니다 — τ가 2-2 이상의 대각을 손대지 못해서 생긴
 * 무승부 과소 예측을 일반화해 메웁니다 (c3 (4)).
 */
export function gridProbabilities(
  lambdaSelf: number,
  lambdaOpp: number,
  k: ScoreGridConstants,
): Probabilities {
  const { rho, gamma, gridMax } = k;
  const self = poissonPmf(lambdaSelf, gridMax);
  const opp = poissonPmf(lambdaOpp, gridMax);
  const diagonalFactor = Math.exp(gamma);

  let win = 0;
  let draw = 0;
  let lose = 0;
  let total = 0;

  for (let i = 0; i <= gridMax; i += 1) {
    for (let j = 0; j <= gridMax; j += 1) {
      let cell = (self[i] as number) * (opp[j] as number);
      // Dixon–Coles τ — 저점수 네 칸만
      if (i === 0 && j === 0) cell *= 1 - lambdaSelf * lambdaOpp * rho;
      else if (i === 0 && j === 1) cell *= 1 + lambdaSelf * rho;
      else if (i === 1 && j === 0) cell *= 1 + lambdaOpp * rho;
      else if (i === 1 && j === 1) cell *= 1 - rho;
      // 대각 보정 γ — τ 적용 뒤에 곱한다 (파이썬과 같은 순서)
      if (i === j) cell *= diagonalFactor;
      // τ가 음수 칸을 만들 수 있다 — 확률에 음수가 섞이면 정규화가 무의미해진다
      if (cell < 0) cell = 0;

      total += cell;
      if (i > j) win += cell;
      else if (i === j) draw += cell;
      else lose += cell;
    }
  }

  return { win: win / total, draw: draw / total, lose: lose / total };
}

/**
 * 분류기 확률 + 격자 무승부 몫 변화 → 표시 확률 (파이썬 `blend`)
 *
 * ```
 * d_shift = p_λ(λ_adj).draw − p_λ(λ⁰).draw
 * p_draw  = clamp(p_cls.draw + d_shift, 하한, 상한)
 * p_win, p_lose 를 (1 − p_draw) 로 비례 재정규화
 * ```
 */
export function blendDrawShare(
  classifier: Probabilities,
  lambda: readonly [number, number],
  lambda0: readonly [number, number],
  k: ScoreGridConstants,
): Probabilities {
  const base = gridProbabilities(lambda0[0], lambda0[1], k);
  const adjusted = gridProbabilities(lambda[0], lambda[1], k);
  const [low, high] = k.drawShiftClamp;

  const draw = Math.min(high, Math.max(low, classifier.draw + (adjusted.draw - base.draw)));
  const rest = classifier.win + classifier.lose;
  // 분류기가 무승부에 전 질량을 준 극단에서 0으로 나누지 않는다. 이때는 승/패를
  // 반씩 나눠 갖는 것이 유일하게 정보 없는 선택이다.
  const scale = rest > 1e-12 ? (1 - draw) / rest : 0;
  return rest > 1e-12
    ? { win: classifier.win * scale, draw, lose: classifier.lose * scale }
    : { win: (1 - draw) / 2, draw, lose: (1 - draw) / 2 };
}
