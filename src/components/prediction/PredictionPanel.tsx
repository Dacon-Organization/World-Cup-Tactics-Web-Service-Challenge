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

interface PredictionPanelProps {
  opponentName: string;
}

/**
 * 예측 패널 조립 (F05·F06·F07)
 *
 * 구현 명세: [F05 impl §2](../../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * ## 전술보드에서 떼어낸 이유
 *
 * B4에서는 확률이 정적이라 `TacticsBoard` 안의 `<section>`으로 충분했습니다. 이제 패널은
 * 엔진 상태·밴드·배열·HOPs를 들므로, 조율자 안에 두면 **드래그 상태 변화가 예측 패널
 * 전체를 리렌더**시킵니다. 두 관심사의 리렌더를 분리합니다.
 *
 * ## 추론 중에도 화면을 비우지 않는다 (F05-R2)
 *
 * `p`는 `predictionStore`가 들고 있고 새 결과가 **도착할 때만** 교체됩니다. 여기서는
 * 갱신 인디케이터만 덧붙입니다 — 스토어 분리(구현규약 §3)가 이미 구조로 보장하는 것을
 * 화면에서 무너뜨리지 않기 위해서입니다.
 */
export function PredictionPanel({ opponentName }: PredictionPanelProps) {
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
  const fallbackReason = usePredictionStore((state) => state.fallbackReason);

  const busy = status === 'simulating' || status === 'inferring';
  const counts = p ? allocate100(p) : null;

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-label="예측 확률">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">{opponentName}전 예측</h2>
        {engine === 'fallback' ? <EstimateBadge reason={fallbackReason} /> : null}
        {/* 계산 중에도 직전 값을 그대로 두고 인디케이터만 더한다 (F05-R2) */}
        {busy ? (
          <span className="text-[12px] text-text-3" aria-live="polite">
            계산 중…
          </span>
        ) : null}
        {status === 'loading' && engine === null ? (
          <span className="text-[12px] text-text-3">모델 준비 중</span>
        ) : null}
      </div>

      <ProbabilityBar
        probabilities={p}
        source={engine === null ? 'precomputed' : engine === 'onnx' ? 'inferred' : 'fallback'}
      />

      <WilsonBandRow
        counts={counts ?? { win: 0, draw: 0, lose: 0 }}
        band={counts ? band : null}
        iterations={iterations}
        degraded={degraded}
        elapsedMs={elapsedMs}
      />

      <ProgressBar progress={progress} />

      {counts ? (
        <div className="mt-4">
          <DotGrid10x10 counts={counts} />
        </div>
      ) : null}

      <HopsPlayer frames={frames} />

      {/* 점진적 공개 — 첫 화면을 복잡하게 만들지 않는다 (F08 §3) */}
      <details className="mt-4 border-t border-line pt-3">
        <summary className="min-h-11 cursor-pointer text-[13px] font-semibold text-text-2">
          정밀 시뮬레이션
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md border border-line px-3 text-[13px]"
            onClick={runPrecise}
          >
            25,000회 실행
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-line px-3 text-[13px] disabled:opacity-40"
            onClick={cancel}
            disabled={!busy}
          >
            취소
          </button>
          <p className="basis-full text-[12px] text-text-3">
            반복이 많을수록 신뢰구간이 좁아집니다. 실행 중에도 전술을 계속 바꿀 수 있습니다.
          </p>
        </div>
      </details>
    </section>
  );
}
