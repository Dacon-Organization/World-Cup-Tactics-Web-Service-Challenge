import type { OutcomeCounts } from '@/lib/prediction/allocate';
import { OUTCOME_ORDER } from '@/types/worker';

interface DotGrid10x10Props {
  /** 합이 정확히 100인 정수 3개 (`allocate100` 산출물) */
  counts: OutcomeCounts;
}

const FILL: Record<keyof OutcomeCounts, string> = {
  win: 'var(--color-win)',
  draw: 'var(--color-draw)',
  lose: 'var(--color-lose)',
};

const LABEL: Record<keyof OutcomeCounts, string> = {
  win: '승리',
  draw: '무승부',
  lose: '패배',
};

/**
 * 10×10 아이콘 배열 (F07-R1·R3)
 *
 * 구현 명세: [F07 impl §4.2](../../../docs/planning/impl/version1.0/F07_확률_시각화_impl.md)
 *
 * ## 채움 순서가 top/row인 이유
 *
 * P12가 배제한 것은 중앙 시작(central)과 무작위 배치(random)입니다. 둘 다 개수 지각을
 * 왜곡합니다. 행 우선·위에서 아래로 이어 채우면 "100번 중 몇 번"이 눈으로 셀 수 있는
 * 형태가 됩니다.
 *
 * ## 훅이 없다
 *
 * Server/Client 어느 쪽에서 렌더해도 같은 HTML이 나옵니다 — JS가 죽어도 배열이 화면에
 * 남습니다 (F08-R5).
 *
 * ## 색만으로 전달하지 않는다
 *
 * 결과 3색과 포지션 4색이 현재 같은 값이고, 이 배열은 형태 구분이 없는 유일한 화면이라
 * 충돌이 가장 크게 드러납니다. 토큰 교체는 디자인 재설계 블록의 소관이므로, 여기서는
 * 범례에 텍스트 라벨을 반드시 붙여 색 단독 전달을 막습니다.
 */
export function DotGrid10x10({ counts }: DotGrid10x10Props) {
  const cells: (keyof OutcomeCounts)[] = [];
  for (const outcome of OUTCOME_ORDER) {
    for (let i = 0; i < counts[outcome]; i += 1) cells.push(outcome);
  }

  return (
    <div>
      <svg
        viewBox="0 0 10 10"
        className="w-full max-w-[280px]"
        role="img"
        aria-label={`100번 중 승리 ${counts.win}번, 무승부 ${counts.draw}번, 패배 ${counts.lose}번`}
      >
        {cells.map((outcome, index) => (
          <rect
            key={index}
            // 행 우선 — index 0이 좌상단, 9가 우상단
            x={(index % 10) + 0.1}
            y={Math.floor(index / 10) + 0.1}
            width={0.8}
            height={0.8}
            rx={0.18}
            fill={FILL[outcome]}
            aria-hidden="true"
          />
        ))}
      </svg>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-2">
        {OUTCOME_ORDER.map((outcome) => (
          <li key={outcome} className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-[3px]"
              style={{ backgroundColor: FILL[outcome] }}
              aria-hidden="true"
            />
            {LABEL[outcome]} {counts[outcome]}번
          </li>
        ))}
      </ul>
    </div>
  );
}
