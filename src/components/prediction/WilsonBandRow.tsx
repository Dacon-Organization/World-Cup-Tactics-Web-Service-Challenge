import type { OutcomeCounts } from '@/lib/prediction/allocate';
import { OUTCOME_ORDER, type Band } from '@/types/worker';

interface WilsonBandRowProps {
  counts: OutcomeCounts;
  /** `null`이면 MC가 아직 돌지 않았다 — 행 전체를 숨긴다 */
  band: Band | null;
  iterations: number | null;
  degraded: boolean;
  /** 정밀 모드 10초 초과 시 소요 시간을 함께 표기한다 (F06-R5) */
  elapsedMs: number | null;
}

const LABEL = { win: '승', draw: '무', lose: '패' } as const;

/**
 * 밴드 끝점은 **소수 1자리**로 찍는다
 *
 * 정수로 반올림하면 5,000회와 25,000회의 밴드가 같은 숫자로 보입니다 — p=0.49 기준
 * `[47.58, 50.35]`와 `[48.35, 49.59]`가 둘 다 `48–50`이 됩니다. 그러면 F06 수용 기준
 * ("정밀 모드 밴드가 빠른 모드보다 좁다")이 화면에서 **관측 불가능**해집니다.
 *
 * 없는 정밀도를 주장하는 것이 아닙니다 — 밴드 끝점은 `p`와 `N`의 결정론적 함수라
 * 이 자리까지 정확합니다. 표본 오차를 담은 것은 폭이지 끝점의 표기 자릿수가 아닙니다.
 * (점추정 퍼센트는 그대로 정수입니다 — 10×10 배열과 같은 정수를 공유해야 하므로.)
 */
const pct = (value: number): string => (value * 100).toFixed(1);

/**
 * Wilson 밴드 표시 (F06-R3 · F07-R1·R3·R4)
 *
 * 구현 명세: [F07 impl §4.3](../../../docs/planning/impl/version1.0/F07_확률_시각화_impl.md)
 *
 * ## 왜 막대 위 도형이 아니라 텍스트 3행인가
 *
 * 3분할 막대 위에 신뢰구간 3개를 겹쳐 그리면 360px 화면에서 서로 침범합니다. 텍스트는
 * 좁은 화면에서도 정확하고, 스크린리더에서 그대로 읽히며, F07-R3(숫자 병기)을 자동으로
 * 만족합니다.
 *
 * ## 밴드가 뜻하는 것
 *
 * 모델 자체의 불확실성이 아니라 **시뮬레이션의 표본 오차**입니다 — "N회 돌렸을 때 이
 * 결과가 나오는 빈도가 들어갈 범위". 화면 문구도 그렇게 씁니다.
 */
export function WilsonBandRow({
  counts,
  band,
  iterations,
  degraded,
  elapsedMs,
}: WilsonBandRowProps) {
  // 자리표시자를 넣지 않는다 — 없는 정보를 있는 것처럼 보이게 하는 것이 가장 나쁘다
  if (!band || iterations === null) return null;

  const seconds = elapsedMs !== null && elapsedMs >= 10_000 ? (elapsedMs / 1000).toFixed(1) : null;

  return (
    <div className="mt-3">
      <dl className="flex flex-col gap-1 text-[13px]">
        {OUTCOME_ORDER.map((outcome) => (
          <div key={outcome} className="flex items-baseline gap-2">
            <dt className="w-4 shrink-0 font-semibold text-text-2">{LABEL[outcome]}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 text-text-2">
              <span className="font-semibold text-text">{counts[outcome]}%</span>
              <span className="text-text-3">
                95% 구간 {pct(band[outcome].low)}–{pct(band[outcome].high)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[13px] text-text-3">
        {iterations.toLocaleString('ko-KR')}회 시뮬레이션
        {seconds ? ` · ${seconds}초` : ''}
        {degraded ? ' · 기기 성능에 맞춰 반복 횟수를 낮췄습니다' : ''}
      </p>
    </div>
  );
}
