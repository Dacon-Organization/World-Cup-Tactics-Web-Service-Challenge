import { allocate100 } from '@/lib/prediction/allocate';
import { probabilityShares } from '@/lib/prediction/shares';
import type { Probabilities } from '@/types/data';

interface ProbabilityBarProps {
  probabilities: Probabilities | null;
}

/**
 * 세그먼트 배경은 동결 결과 3색이고, **글자색만** 그 위에서 읽히는 쪽으로 고른다.
 *
 * 실측 대비(18px/700 → 4.5:1 요구):
 *   승 #2E7D5B — 흰 글자 5.00 ✓
 *   패 #B0413E — 흰 글자 5.72 ✓
 *   무 #C98A21 — 흰 글자 **2.94 ✗** / 잉크(#1A1D24) 글자 **5.73 ✓**
 *
 * 앰버 위 흰 글자는 f13 공유 카드가 쓴 조합이지만, 인쇄물과 달리 화면에서는 접근성
 * 기준에 걸립니다. 배경색(= 그림과 대조되는 부분)은 그대로 두고 글자색만 바꿉니다.
 */
const SEGMENTS = [
  { key: 'win', label: '승', color: 'var(--color-win)', ink: '#FFFFFF' },
  { key: 'draw', label: '무', color: 'var(--color-draw)', ink: '#1A1D24' },
  { key: 'lose', label: '패', color: 'var(--color-lose)', ink: '#FFFFFF' },
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
 * ## 폭과 라벨의 근거가 다른 것은 의도입니다
 *
 * **폭**은 연속값(`shares`)입니다 — 1%p 미만의 차이가 막대에서 사라지면 안 됩니다.
 * **라벨 숫자**는 `allocate100`입니다 — 10×10 배열(F07)과 같은 정수를 공유해야
 * "배열은 100칸인데 퍼센트 합이 101"인 화면이 나오지 않습니다. `Math.round`를 따로
 * 쓰면 실제로 그렇게 됩니다 (F07 impl §4.1에 실측 사례).
 *
 * ## 막대만 그린다
 *
 * 대표 숫자(40px)와 출처 문구는 이 컴포넌트 밖에 있습니다. 이 막대는 화면 하단에 상주하는
 * 도크의 부품이고, **도크는 높이 예산이 빡빡합니다** — `position: sticky`는 부모 상자 위로
 * 올라가지 못하므로(실측: 첫 화면에서 50px 잘림) 도크에 들어가는 것은 조작 중 계속 필요한
 * 것만입니다. 출처 문구는 한 번 읽으면 되는 정보라 상세 쪽으로 옮겼습니다.
 *
 * 색 단독으로 의미를 전달하지 않습니다 — 세그먼트마다 "승 49" 텍스트가 항상 붙습니다
 * (DESIGN.md §1.4 라벨 강제).
 */
export function ProbabilityBar({ probabilities }: ProbabilityBarProps) {
  if (!probabilities) {
    // 빈 패널을 만들지 않는다 (F05 계열 원칙 · F08-R2)
    return (
      <p className="text-[15px] text-text-2">
        기본 전술이 적용돼 있습니다. 확률은 곧 표시됩니다.
      </p>
    );
  }

  const shares = probabilityShares(probabilities);
  const counts = allocate100(probabilities);

  return (
    <div
      className="flex h-[30px] overflow-hidden rounded-md"
      role="img"
      aria-label={SEGMENTS.map((segment) => `${segment.label} ${counts[segment.key]}%`).join(', ')}
    >
      {SEGMENTS.map((segment) => (
        <div
          key={segment.key}
          // 글자색이 테마 토큰이 아닌 이유: 배경이 동결 결과 3색이라 라이트·다크 어느
          // 쪽에서도 **같은 세 색** 위에 앉습니다. 테마를 따라가면 오히려 대비가 깨집니다.
          className="flex items-center justify-center overflow-hidden text-[18px] font-bold whitespace-nowrap"
          style={{
            width: `${shares[segment.key] * 100}%`,
            backgroundColor: segment.color,
            color: segment.ink,
            transition: 'width 220ms ease-out',
          }}
        >
          <span aria-hidden="true">
            {segment.label} {counts[segment.key]}
          </span>
        </div>
      ))}
    </div>
  );
}
