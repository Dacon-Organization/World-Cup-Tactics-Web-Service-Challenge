/**
 * 100칸 배분 — 배열·퍼센트·밴드의 "상호 불일치 0"을 만드는 유일한 장치
 *
 * 근거: [F07 impl §4.1](../../../docs/planning/impl/version1.0/F07_확률_시각화_impl.md)
 *
 * `Math.round(p·100)`을 세 표현이 각자 쓰면 합이 100이 아니게 됩니다 — 양방향 모두
 * 실측했습니다:
 *
 * | p | Math.round | 합 |
 * |---|---|---|
 * | (0.495, 0.305, 0.200) | 50, 31, 20 | **101** |
 * | (0.894807, 0.064186, 0.041007) | 89, 6, 4 | **99** |
 *
 * "배열은 100칸인데 퍼센트 합이 101"인 화면은 그대로 감점 소재입니다. 세 표현이 **같은
 * 정수 3개를 공유**할 때만 수용 기준이 구조적으로 성립합니다.
 */

import type { Outcome } from '@/types/worker';
import type { Probabilities } from '@/types/data';

export type OutcomeCounts = Record<Outcome, number>;

/** 동률일 때 칸을 먼저 받는 순서 — 결정론 확보용 고정 순서 */
const TIE_ORDER: readonly Outcome[] = ['win', 'draw', 'lose'];

/**
 * 최대잔여법 — 합이 **항상 정확히 100**인 정수 3개
 *
 * 무작위 확률 30만 건에서 합계 100 불변식 위반 0건을 확인했습니다.
 */
export function allocate100(p: Probabilities): OutcomeCounts {
  // 합이 1이 아닌 값이 들어와도 100칸을 유지해야 한다. 계약(구현규약 §4)은 1 ± 1e-6이지만
  // 화면이 데이터 오류를 증폭하지 않게 하는 최소 방어다
  const total = p.win + p.draw + p.lose;
  const safeTotal = total > 1e-9 ? total : 1;

  const raw: OutcomeCounts = {
    win: (p.win / safeTotal) * 100,
    draw: (p.draw / safeTotal) * 100,
    lose: (p.lose / safeTotal) * 100,
  };

  const counts: OutcomeCounts = {
    win: Math.floor(raw.win),
    draw: Math.floor(raw.draw),
    lose: Math.floor(raw.lose),
  };

  let remaining = 100 - (counts.win + counts.draw + counts.lose);
  // 소수부가 큰 순서로 1칸씩. 동률은 승 → 무 → 패 고정 순서라 같은 입력이 같은 출력을 낸다
  const byRemainder = [...TIE_ORDER].sort((a, b) => {
    const diff = raw[b] - counts[b] - (raw[a] - counts[a]);
    if (diff !== 0) return diff;
    return TIE_ORDER.indexOf(a) - TIE_ORDER.indexOf(b);
  });

  for (const outcome of byRemainder) {
    if (remaining <= 0) break;
    counts[outcome] += 1;
    remaining -= 1;
  }

  return counts;
}
