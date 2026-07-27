/**
 * Wilson score 신뢰구간 — 순수 함수
 *
 * 정본: [평가_설계 §4.4](../../../docs/planning/ml/version1.0/평가_설계_v1_0.md) ·
 * 구현 명세: [F06 impl §4.4](../../../docs/planning/impl/version1.0/F06_몬테카를로_시뮬레이션_impl.md)
 *
 * Wald(p̂ ± z·SE)와 달리 p̂이 0%·100%에 근접해도 구간이 [0,1] 내부입니다 —
 * F07-R4("밴드가 [0,1]을 벗어나는 표시를 하지 않는다")의 수학적 근거입니다.
 * ORT와 무관한 순수 JS라 **폴백 모드에서도 그대로 동작**합니다 (P12·P4 정합).
 */

import type { Band, Interval, Outcome } from '@/types/worker';
import type { Probabilities } from '@/types/data';

/** 95% 양측 */
const Z = 1.96;

/**
 * `q`에 **표시 확률 `p`** 를 넣습니다 (F06 impl §4.4 `[설계 결정]`)
 *
 * MC 집계 `p̂`를 넣으면 밴드 중심이 표시 퍼센트에서 최대 ~1.4%p 벗어나, 밴드가 표시값을
 * 품지 않는 화면이 5% 확률로 나옵니다 — F07 수용 기준 "상호 불일치 0"이 확률적으로만
 * 성립하게 됩니다. `p`는 입력의 결정론적 함수라 표본 오차가 없는 점추정이고,
 * 평가_설계 §4.2가 `p̂ → p`를 증명했으므로 `p`가 곧 `p̂`이 추정하려던 값입니다.
 *
 * 밴드의 **폭**은 여전히 `n`이 지배합니다 — 정밀 모드가 좁아지는 성질은 그대로입니다.
 */
export function wilsonInterval(q: number, n: number): Interval {
  // n=0이면 0으로 나눈다. 시뮬레이션을 돌리지 않은 값에 구간을 붙일 수는 없다
  if (n <= 0) return { low: 0, high: 1 };

  const z2 = Z * Z;
  const denominator = 1 + z2 / n;
  const center = (q + z2 / (2 * n)) / denominator;
  const half = (Z / denominator) * Math.sqrt((q * (1 - q)) / n + z2 / (4 * n * n));

  // 클램프는 장식이 아니다 — q=1·n=5,000 을 넣으면 상한이 1+ε(ε~1e-16)로 나온다.
  // 없으면 화면에 "100.0000000000001%"가 찍힌다 (F06 impl §4.4에서 실측 확인)
  return {
    low: Math.max(0, center - half),
    high: Math.min(1, center + half),
  };
}

/** 3범주 묶음. `Band`가 단수 이름인 이유는 계약 문구 보존 (types/worker.ts 주석) */
export function wilsonBand(p: Probabilities, n: number): Band {
  return {
    win: wilsonInterval(p.win, n),
    draw: wilsonInterval(p.draw, n),
    lose: wilsonInterval(p.lose, n),
  };
}

/**
 * 표본 오차 — 샘플러 자기 검사에 쓴다
 *
 * `|p̂ − p| > 5·SE` 는 정상적인 난수로는 사실상 불가능합니다(정규 근사로 ~6e-7).
 * 이 임계를 넘으면 난수가 아니라 **샘플러가 망가진 것**입니다 — 분할 오류·CDF 역전처럼
 * 그럴듯한 숫자를 조용히 내는 실패를 잡는 유일한 장치입니다 (F06 impl §4.4).
 */
export function standardError(q: number, n: number): number {
  if (n <= 0) return Infinity;
  return Math.sqrt((q * (1 - q)) / n);
}

export function convergenceOutlier(
  p: Probabilities,
  empirical: Probabilities,
  n: number,
): Outcome | null {
  const outcomes: Outcome[] = ['win', 'draw', 'lose'];
  for (const outcome of outcomes) {
    const se = standardError(p[outcome], n);
    // p가 0이나 1이면 SE=0이라 어떤 편차도 이상으로 잡힌다. 그 경우 편차 자체가
    // 0이어야 정상이므로 절대 허용치를 하나 둔다
    const tolerance = Math.max(5 * se, 1e-9);
    if (Math.abs(empirical[outcome] - p[outcome]) > tolerance) return outcome;
  }
  return null;
}
