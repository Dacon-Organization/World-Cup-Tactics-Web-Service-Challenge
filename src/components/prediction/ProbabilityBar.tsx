import { probabilityShares } from '@/lib/prediction/shares';
import type { Probabilities } from '@/types/data';

interface ProbabilityBarProps {
  probabilities: Probabilities | null;
  /** 값의 출처 — 화면에 "무엇을 보고 있는가"를 밝히는 데 쓴다 */
  source: 'precomputed' | 'inferred' | 'fallback';
}

const SEGMENTS = [
  { key: 'win', label: '승', color: 'var(--color-win)' },
  { key: 'draw', label: '무', color: 'var(--color-draw)' },
  { key: 'lose', label: '패', color: 'var(--color-lose)' },
] as const;

/**
 * 확률 3분할 막대 (F07의 기반 · F08 첫 페인트)
 *
 * ## 훅이 없는 이유
 *
 * 훅이 없으면 Server/Client 어느 쪽에서 렌더해도 같은 HTML이 나옵니다. 그래서
 * **JS 없이도 보여야 하는 요구(F08-R5)** 와 **JS로 갱신해야 하는 요구(F08-R3)** 를
 * 한 컴포넌트로 만족시킬 수 있습니다.
 *
 * ## 폭을 합으로 정규화하는 이유
 *
 * 확률 합은 계약상 1 ± 1e-6이지만, 어긋난 값이 들어와도 막대가 넘치거나 비지 않아야
 * 합니다. 화면이 데이터 오류를 증폭하지 않게 하는 최소 방어입니다.
 *
 * 색 단독으로 의미를 전달하지 않습니다 — 세그먼트마다 "승 49" 텍스트가 항상 붙습니다
 * (DESIGN.md §1.4 라벨 강제).
 */
export function ProbabilityBar({ probabilities, source }: ProbabilityBarProps) {
  if (!probabilities) {
    // 빈 패널을 만들지 않는다 (F05 계열 원칙 · F08-R2)
    return (
      <p className="text-[15px] text-text-2">
        기본 전술이 적용돼 있습니다. 확률은 곧 표시됩니다.
      </p>
    );
  }

  const shares = probabilityShares(probabilities);

  return (
    <div>
      <div
        className="flex h-[30px] overflow-hidden rounded-md"
        role="img"
        aria-label={SEGMENTS.map(
          (segment) => `${segment.label} ${Math.round(shares[segment.key] * 100)}%`,
        ).join(', ')}
      >
        {SEGMENTS.map((segment) => {
          const share = shares[segment.key];
          return (
            <div
              key={segment.key}
              className="flex items-center justify-center overflow-hidden text-[18px] font-bold whitespace-nowrap text-text"
              style={{
                width: `${share * 100}%`,
                backgroundColor: segment.color,
                transition: 'width 220ms ease-out',
              }}
            >
              <span aria-hidden="true">
                {segment.label} {Math.round(share * 100)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-text-3">
        {source === 'precomputed'
          ? '기본 전술 기준 사전 계산값 · 브라우저 안에서만 계산됩니다'
          : '브라우저 안에서만 계산됩니다'}
      </p>
    </div>
  );
}
