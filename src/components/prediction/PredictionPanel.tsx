'use client';

import { allocate100 } from '@/lib/prediction/allocate';
import { usePredictionEngine } from '@/hooks/usePredictionEngine';
import { usePredictionStore } from '@/store/predictionStore';
import { DotGrid10x10 } from './DotGrid10x10';
import { EstimateBadge } from './EstimateBadge';
import { HopsPlayer } from './HopsPlayer';
import { ProbabilityBar } from './ProbabilityBar';
import { ProgressBar } from './ProgressBar';
import { WilsonBandRow } from './WilsonBandRow';

/**
 * 예측 패널 (F05·F06·F07) — **요약 도크**와 **상세**로 쪼갠다
 *
 * 구현 명세: [F05 impl §2](../../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * ## 왜 하나였던 패널을 둘로 나눴는가 (디자인 재설계 블록)
 *
 * 하나의 카드 안에 요약(확률 바)과 상세(밴드·배열·HOPs·정밀)를 전부 넣었더니 패널 높이가
 * **749px**이 됐습니다 — DESIGN.md §3.2가 정한 예산 132px의 5.7배입니다. 그 결과 슬라이더가
 * 문서 1505px 지점으로 밀려나, **슬라이더를 조작하는 동안 확률이 화면에 없었습니다.**
 * 조작과 피드백이 같은 화면에 없으면 "실시간 반응"은 지각되지 않습니다.
 *
 * 그래서 요약만 떼어 화면 하단에 고정하고(`.prob-dock`), 상세는 본문 흐름에 둡니다.
 * 화면흐름 v1.0의 S1 골격과 f10 와이어프레임이 처음부터 "예측 패널 (하단 고정)"으로
 * 그려 뒀던 구조입니다 — 새 설계가 아니라 미구현분입니다.
 *
 * ## 엔진 훅을 상세 쪽이 소유하는 이유
 *
 * `usePredictionEngine`은 마운트 시 Worker를 만듭니다. 두 컴포넌트가 각각 호출하면
 * **Worker가 둘** 생깁니다. 정밀 실행·취소 버튼이 있는 상세 쪽이 소유하고, 도크는
 * 스토어만 읽습니다(훅 없음). 도크는 조건부 렌더가 아니므로 수명주기도 그대로입니다.
 */

/**
 * 요약 도크 — 모바일에서 화면 하단 고정, `lg`에서 우측 패널 하단 (DESIGN.md §3.1)
 *
 * 추론 중에도 화면을 비우지 않습니다 (F05-R2). `p`는 스토어가 들고 있고 새 결과가
 * **도착할 때만** 교체됩니다 — 여기서는 갱신 인디케이터만 덧붙입니다.
 *
 * ## 높이 예산이 88px인 이유 (실측으로 정해진 값)
 *
 * `position: sticky`는 **부모 상자 위로 올라가지 못합니다.** 이 도크의 부모는 우측 열이고,
 * 375×667에서 그 열은 y=533에서 시작합니다(위쪽은 피치 열). 그래서 첫 화면에서 도크가
 * 올라갈 수 있는 최고점은 557이고, 쓸 수 있는 세로는 `667 - 557 = 110px`입니다.
 * 처음 만든 160px 구성은 여기서 50px 잘렸습니다 — 실측으로 확인하고 줄였습니다.
 *
 * 그래서 도크에는 **조작하는 내내 필요한 것**만 둡니다: 대표 숫자와 3분할 막대.
 * 출처 문구·신뢰구간·배열은 한 번 읽으면 되는 정보라 상세로 내렸습니다.
 */
export function PredictionDock({ opponentName }: { opponentName: string }) {
  const p = usePredictionStore((state) => state.p);
  const engine = usePredictionStore((state) => state.engine);
  const status = usePredictionStore((state) => state.status);
  const fallbackReason = usePredictionStore((state) => state.fallbackReason);

  const busy = status === 'simulating' || status === 'inferring';
  const counts = p ? allocate100(p) : null;

  return (
    <section className="prob-dock" aria-label={`${opponentName}전 예측`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* 대표 숫자가 무엇의 확률인지는 여기서만 말합니다 — 숫자 옆에 "% 승리 확률"을
            붙이면 40px 숫자와 경합해 도크가 두 줄이 됩니다 */}
        <h2 className="text-[12px] text-text-3">{opponentName}전 승리 확률</h2>
        {engine === 'fallback' ? <EstimateBadge reason={fallbackReason} /> : null}
        {busy ? (
          <span className="text-[12px] text-text-3" aria-live="polite">
            계산 중…
          </span>
        ) : null}
        {status === 'loading' && engine === null ? (
          <span className="text-[12px] text-text-3">모델 준비 중</span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {/* DESIGN.md §2가 "확률 수치 40px / 700"을 정의해 뒀는데 화면 어디에도 쓰이지
            않아, 실제 화면의 최대 글자가 22px 제목이었습니다. 이 서비스가 보여 주려는
            단 하나의 수치가 제목보다 작으면 위계가 뒤집힙니다. */}
        {counts ? (
          <p className="flex shrink-0 items-baseline gap-0.5">
            <span className="text-[40px] leading-none font-bold tracking-[-0.02em] tabular-nums">
              {counts.win}
            </span>
            <span className="text-[13px] text-text-2">%</span>
          </p>
        ) : null}

        <div className="min-w-0 flex-1">
          <ProbabilityBar probabilities={p} />
        </div>
      </div>
    </section>
  );
}

/**
 * 상세 — 신뢰구간·10×10 배열·HOPs·정밀 시뮬레이션
 *
 * 첫 화면을 복잡하게 만들지 않되(F08 §3), 배열은 이 서비스의 핵심 시각화라 접지 않습니다.
 * 접는 것은 **정밀 시뮬레이션**뿐입니다 — 실행 전에는 볼 것이 없는 영역이기 때문입니다.
 */
export function PredictionDetails() {
  const { runPrecise, cancel } = usePredictionEngine();

  const p = usePredictionStore((state) => state.p);
  const engine = usePredictionStore((state) => state.engine);
  const status = usePredictionStore((state) => state.status);
  const band = usePredictionStore((state) => state.band);
  const frames = usePredictionStore((state) => state.frames);
  const iterations = usePredictionStore((state) => state.iterations);
  const elapsedMs = usePredictionStore((state) => state.elapsedMs);
  const progress = usePredictionStore((state) => state.progress);
  const degraded = usePredictionStore((state) => state.degraded);

  const busy = status === 'simulating' || status === 'inferring';
  const counts = p ? allocate100(p) : null;

  return (
    <section aria-label="예측 상세">
      {/* 출처 고지 — 도크에서 내려온 문구입니다. "외부로 나가지 않는다"는 이 서비스의
          핵심 주장(C1 외부 요청 0건)이라 화면에서 빼지 않고 자리만 옮겼습니다. */}
      <p className="mb-3 text-[13px] text-text-3">
        {engine === null
          ? '기본 전술 기준 사전 계산값 · 브라우저 안에서만 계산됩니다'
          : '브라우저 안에서만 계산됩니다'}
      </p>

      {counts ? <DotGrid10x10 counts={counts} /> : null}

      <WilsonBandRow
        counts={counts ?? { win: 0, draw: 0, lose: 0 }}
        band={counts ? band : null}
        iterations={iterations}
        degraded={degraded}
        elapsedMs={elapsedMs}
      />

      <ProgressBar progress={progress} />

      <HopsPlayer frames={frames} />

      <details className="mt-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-semibold text-text-2">
          정밀 시뮬레이션
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md border border-line px-3 text-[14px]"
            onClick={runPrecise}
          >
            25,000회 실행
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-line px-3 text-[14px] disabled:opacity-40"
            onClick={cancel}
            disabled={!busy}
          >
            취소
          </button>
          <p className="basis-full text-[13px] text-text-3">
            반복이 많을수록 신뢰구간이 좁아집니다. 실행 중에도 전술을 계속 바꿀 수 있습니다.
          </p>
        </div>
      </details>
    </section>
  );
}
