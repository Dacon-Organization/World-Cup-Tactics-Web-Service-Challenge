'use client';

import { useState } from 'react';
import type { OutcomeCounts } from '@/lib/prediction/allocate';
import { OUTCOME_ORDER } from '@/types/worker';

type Outcome = keyof OutcomeCounts;

interface DotGrid10x10Props {
  /** 합이 정확히 100인 정수 3개 (`allocate100` 산출물) */
  counts: OutcomeCounts;
}

const FILL: Record<Outcome, string> = {
  win: 'var(--color-win)',
  draw: 'var(--color-draw)',
  lose: 'var(--color-lose)',
};

const LABEL: Record<Outcome, string> = {
  win: '승리',
  draw: '무승부',
  lose: '패배',
};

/**
 * 10×10 아이콘 배열 (F07-R1·R3)
 *
 * 구현 명세: [F07 impl §4.2](../../../docs/planning/impl/version1.0/F07_확률_시각화_impl.md)
 *
 * ## 왜 기획서 원본(f12)의 부호화로 되돌렸는가
 *
 * 이 배열의 원본은 기획서 그림 `f12_probability()` ①번 패널입니다
 * ([make_figures.py:682](../../../dev/typeset/make_figures.py)). 원본은
 * **원(`plt.Circle`) + 1색 채움 + 중립 미채움**으로 "① 100번 중 62번"을 말합니다.
 * 구현은 모난 사각 + 승·무·패 3색 동시였습니다 — 형태와 부호화가 둘 다 원본과 달랐습니다.
 *
 * DESIGN.md §1.4가 "배열은 모난 사각"으로 정한 근거(토큰이 원이니 배열은 사각으로 분리)는
 * **원본 배열도 원이었다는 사실을 놓친 것**입니다. §0이 "문서와 원본이 어긋나면 원본이
 * 우선"이라고 스스로 정해 뒀으므로 원본을 따릅니다.
 *
 * ## 그 결과로 색 충돌이 사라진다
 *
 * 결과 3색과 포지션 4색은 값이 같습니다(제출된 상태). 3색 동시 표시일 때는 한 화면에
 * 두 의미의 같은 색이 공존했지만, 1색 + 중립으로 돌아가면 **한 번에 결과색이 하나만**
 * 존재합니다. 팔레트를 바꾸지 않고 충돌 표면 자체가 없어집니다.
 *
 * ## 탭을 두면서도 F08-R5(JS 없이 화면이 남는다)를 지키는 방법
 *
 * `useState`의 초기값이 `'win'`이므로 **서버가 그리는 HTML은 훅이 없던 때와 동일**합니다.
 * JS가 죽으면 승리 배열이 그대로 남고 탭 전환만 되지 않습니다 — 정보가 사라지지 않습니다.
 *
 * ## 색만으로 전달하지 않는다
 *
 * 탭은 텍스트 라벨이고, 배열 위에 "100번 중 n번"이 항상 붙습니다 (DESIGN.md §1.4 라벨 강제).
 */
export function DotGrid10x10({ counts }: DotGrid10x10Props) {
  const [outcome, setOutcome] = useState<Outcome>('win');
  const filled = counts[outcome];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[15px]">
          100번 중 <strong className="text-[22px] font-bold tabular-nums">{filled}</strong>번
          {' '}
          {LABEL[outcome]}
        </p>
      </div>

      {/* 결과 전환 — `role="tablist"`가 아니라 버튼 그룹입니다. 탭 패널 의미론(방향키 순회·
          `aria-controls`)까지 흉내 내면 구현이 커지는데, 여기서 바뀌는 것은 같은 그래픽의
          **강조 대상**뿐이라 누름 버튼(`aria-pressed`)이 실제 동작에 더 가깝습니다. */}
      <div className="segmented mb-3" role="group" aria-label="확률 배열에 표시할 결과">
        {OUTCOME_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className="segment"
            data-active={outcome === key}
            aria-pressed={outcome === key}
            onClick={() => setOutcome(key)}
          >
            {LABEL[key]} {counts[key]}
          </button>
        ))}
      </div>

      <svg
        viewBox="0 0 10 10"
        className="w-full max-w-[280px]"
        role="img"
        aria-label={`100번 중 ${LABEL[outcome]} ${filled}번. 승리 ${counts.win}번, 무승부 ${counts.draw}번, 패배 ${counts.lose}번.`}
      >
        {Array.from({ length: 100 }, (_, index) => (
          <circle
            key={index}
            // 행 우선 — index 0이 좌상단, 9가 우상단.
            // P12가 배제한 것은 중앙 시작·무작위 배치입니다(둘 다 개수 지각을 왜곡).
            cx={(index % 10) + 0.5}
            cy={Math.floor(index / 10) + 0.5}
            r={0.36}
            fill={index < filled ? FILL[outcome] : 'var(--color-neutral)'}
            aria-hidden="true"
          />
        ))}
      </svg>
    </div>
  );
}
