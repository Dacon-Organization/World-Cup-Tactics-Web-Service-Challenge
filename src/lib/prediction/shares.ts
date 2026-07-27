/**
 * 확률 → 표시 폭 (F07 기반 · F08 첫 페인트)
 *
 * 렌더 안에 두지 않고 분리한 이유: 순수 함수라 단위 테스트가 가능해집니다 (구현규약 §7).
 */

import type { Probabilities } from '@/types/data';

/**
 * 세그먼트 폭 — 합으로 정규화한다
 *
 * 확률 합은 계약상 1 ± 1e-6(구현규약 §4)이지만, 어긋난 값이 들어와도 막대가 넘치거나
 * 비어서는 안 됩니다. 화면이 데이터 오류를 증폭하지 않게 하는 최소 방어입니다.
 */
export function probabilityShares(probabilities: Probabilities): Probabilities {
  const total = probabilities.win + probabilities.draw + probabilities.lose;
  // 합이 0이면 NaN·Infinity가 폭에 들어가 레이아웃이 깨진다
  const safeTotal = total > 1e-9 ? total : 1;
  return {
    win: probabilities.win / safeTotal,
    draw: probabilities.draw / safeTotal,
    lose: probabilities.lose / safeTotal,
  };
}
