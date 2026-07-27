/**
 * 메인 스레드 측 Worker 클라이언트 — 엔진을 살려 두는 상태기계
 *
 * 구현 명세: [F05 impl §4.3·§4.4](../../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * ```
 *                     ┌──────────── ready ────────────┐
 *                     │                               ▼
 *  start → loading ───┼── T_soft(4s) ──→ loading+폴백 ─┴─→ onnx 승격
 *                     │                       │
 *                     └── T_hard(20s) ────────┴──→ 재기동 1회 → (또 T_hard) → 폴백 확정
 * ```
 *
 * ## 타임아웃이 두 단인 이유
 *
 * wasm은 압축 3.43MB라 느린 회선에서 20초를 넘길 수 있습니다. 한 단짜리 타임아웃은
 * **정상 동작 중인 느린 회선**과 **진짜 무응답**을 구분하지 못해, 잘 받고 있던 엔진을
 * 죽입니다. `T_soft`는 "사용자를 기다리게 하지 않는다"만 담당하고(폴백이 즉시 확률을
 * 준다), `T_hard`만 F05-R6의 재기동을 발동합니다.
 *
 * ## 폴백은 되돌릴 수 있다
 *
 * `T_soft` 폴백 이후에도 Worker는 살아 있으므로, 늦게라도 `ready`가 오면 ONNX로 승격하고
 * 배지를 뗍니다. R6은 "재실패 시 폴백으로 전환"만 요구하지 영구 강등을 요구하지 않습니다.
 */

import { scoreGridConstants, scoreParams } from '@/lib/tactics/constants';
import type { Probabilities } from '@/types/data';
import {
  FAST_ITERATIONS,
  PRECISE_ITERATIONS,
  halveIterations,
  type EngineResult,
  type EstimateReason,
  type Iterations,
  type TacticContext,
  type WorkerRequest,
  type WorkerResponseEnvelope,
} from '@/types/worker';
import { fallbackProbabilities } from './fallback';
import { runMonteCarlo, yieldToEventLoop } from './montecarlo';
import { seedFrom } from './random';
import { wilsonBand } from './wilson';

/** 폴백을 켜는 시점. 이 시점에 Worker를 죽이지는 않는다 `[설계 결정]` */
export const SOFT_TIMEOUT_MS = 4_000;
/** 재기동을 발동하는 시점 `[설계 결정]` */
export const HARD_TIMEOUT_MS = 20_000;
/** F06-R7 — 빠른 모드가 이 시간을 넘으면 다음 자동 실행부터 반복을 절반으로 */
export const DEGRADE_THRESHOLD_MS = 3_000;

export type EngineStatus = 'idle' | 'loading' | 'inferring' | 'simulating' | 'error';
export type SimulationMode = 'fast' | 'precise';

export interface PredictionHost {
  setStatus(status: EngineStatus): void;
  setEngine(engine: 'onnx' | 'fallback', reason: EstimateReason | null): void;
  setProgress(generation: number, progress: { done: number; total: number } | null): void;
  setResult(generation: number, result: EngineResult): void;
  setDegraded(degraded: boolean): void;
}

export interface PredictionClientOptions {
  host: PredictionHost;
  /** 주입받는다 — 테스트가 가짜 Worker를 넣을 수 있어야 상태기계를 덮을 수 있다 */
  createWorker(): Worker;
  now?(): number;
}

export interface PredictionClient {
  start(): void;
  request(context: TacticContext, mode: SimulationMode): void;
  cancel(): void;
  dispose(): void;
}

interface InFlight {
  generation: number;
  iterations: Iterations;
  mode: SimulationMode;
  startedAt: number;
}

export function createPredictionClient(options: PredictionClientOptions): PredictionClient {
  const { host, createWorker } = options;
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  let worker: Worker | null = null;
  let ready = false;
  let restarted = false;
  let disposed = false;
  let fallbackFinal = false;
  let usingFallback = false;
  let degraded = false;

  /** `ready` 전에 들어온 조작 — **최신 1건만** 보관한다 (F05-R5) */
  let pending: { context: TacticContext; mode: SimulationMode } | null = null;
  /** 폴백 전환·재기동 직후 무엇을 다시 계산할지 알기 위해 마지막 요청을 기억한다 */
  let lastRequested: { context: TacticContext; mode: SimulationMode } | null = null;
  let inFlight: InFlight | null = null;
  /** 화면에 반영된 최신 세대. 이보다 낮은 응답은 구식이므로 버린다 (F04-R4) */
  let appliedGeneration = 0;
  /** 메인 스레드 폴백 계산의 취소 플래그 */
  let fallbackToken = 0;

  let softTimer: ReturnType<typeof setTimeout> | null = null;
  let hardTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
    if (timer !== null) clearTimeout(timer);
    return null;
  }

  /**
   * 무응답 감시 — "아무 메시지도 오지 않는 것"이 무응답이다
   *
   * `progress`를 포함해 어떤 응답이든 도착하면 리셋합니다. 그러지 않으면 25,000회 정밀
   * 모드가 정상 진행 중인데도 재기동됩니다.
   */
  function armWatchdog(): void {
    hardTimer = clearTimer(hardTimer);
    if (disposed || fallbackFinal) return;
    hardTimer = setTimeout(onHardTimeout, HARD_TIMEOUT_MS);
  }

  function disarmWatchdog(): void {
    hardTimer = clearTimer(hardTimer);
  }

  function enterFallback(reason: EstimateReason, final: boolean): void {
    if (final) fallbackFinal = true;
    if (!usingFallback) {
      usingFallback = true;
      host.setEngine('fallback', reason);
    }
    // 폴백으로 넘어온 시점의 최신 요청을 즉시 계산해 준다 — 화면이 비어 있지 않게
    const target = pending ?? lastRequested;
    if (target) void runFallback(target.context, target.mode);
  }

  function onSoftTimeout(): void {
    softTimer = null;
    if (disposed || ready) return;
    // Worker는 죽이지 않는다. 계속 받고 있을 수 있다
    enterFallback('timeout', false);
  }

  function onHardTimeout(): void {
    hardTimer = null;
    if (disposed) return;

    if (!restarted) {
      restarted = true;
      terminateWorker();
      spawnWorker();
      return;
    }

    // 재기동 후에도 무응답 — F05-R6의 종착점
    terminateWorker();
    enterFallback('timeout', true);
  }

  function terminateWorker(): void {
    if (!worker) return;
    worker.terminate();
    worker = null;
    ready = false;
    inFlight = null;
  }

  function spawnWorker(): void {
    if (disposed || fallbackFinal) return;
    try {
      worker = createWorker();
    } catch (error) {
      // CSP·구형 브라우저에서 생성 자체가 실패한다. `error(load)`와 같은 종착점
      console.error('[prediction] Worker 생성 실패', error);
      enterFallback('unavailable', true);
      return;
    }

    worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope>) => handleMessage(event.data);
    worker.onerror = (event) => {
      console.error('[prediction] Worker 런타임 오류', event.message);
      enterFallback('load-failed', true);
      terminateWorker();
    };

    post({ type: 'init' });
    host.setStatus('loading');
    armWatchdog();
  }

  function post(request: WorkerRequest): void {
    worker?.postMessage(request);
  }

  function handleMessage(envelope: WorkerResponseEnvelope): void {
    if (disposed) return;
    // 어떤 응답이든 살아 있다는 증거다
    if (inFlight || !ready) armWatchdog();

    switch (envelope.type) {
      case 'ready': {
        ready = true;
        softTimer = clearTimer(softTimer);
        disarmWatchdog();
        if (usingFallback) {
          // 늦게 도착한 ready — ONNX로 승격하고 배지를 뗀다 (F08-R3과 같은 기전)
          usingFallback = false;
          fallbackToken += 1; // 진행 중인 폴백 계산 폐기
        }
        host.setEngine('onnx', null);
        host.setStatus('idle');
        // 로드 중 쌓아 둔 최신 상태 1건만 추론한다 (F05-R5)
        const queued = pending ?? lastRequested;
        pending = null;
        if (queued) send(queued.context, queued.mode);
        return;
      }

      case 'progress': {
        if (envelope.generation < appliedGeneration) return;
        host.setProgress(envelope.generation, envelope.payload);
        return;
      }

      case 'cancelled': {
        if (inFlight && inFlight.generation === envelope.generation) inFlight = null;
        host.setProgress(envelope.generation, null);
        // 스토어의 확률·밴드·프레임은 건드리지 않는다 — 직전 완료 결과가 그대로 남는다 (F06-R4)
        host.setStatus('idle');
        disarmWatchdog();
        return;
      }

      case 'result': {
        const job = inFlight;
        inFlight = null;
        disarmWatchdog();
        host.setProgress(envelope.generation, null);
        host.setStatus('idle');

        if (envelope.generation < appliedGeneration) return;
        appliedGeneration = envelope.generation;

        const elapsedMs = job ? now() - job.startedAt : 0;
        const iterations = job?.iterations ?? FAST_ITERATIONS;

        // F06-R7 — 빠른 모드 왕복이 임계를 넘으면 다음 자동 실행부터 절반으로
        if (!degraded && job?.mode === 'fast' && elapsedMs > DEGRADE_THRESHOLD_MS) {
          degraded = true;
          host.setDegraded(true);
        }

        const [win, draw, lose] = envelope.payload.p;
        host.setResult(envelope.generation, {
          p: { win, draw, lose },
          band: envelope.payload.wilson,
          frames: envelope.payload.frames,
          iterations,
          elapsedMs,
        });
        return;
      }

      case 'error': {
        inFlight = null;
        disarmWatchdog();
        host.setProgress(envelope.generation, null);
        if (envelope.payload.stage === 'load') {
          // 명시적 로드 실패는 재시도해도 고쳐지지 않는다(파일 부재·wasm 미지원).
          // R6의 재기동은 **무응답**에 대한 것이지 명시적 실패에 대한 것이 아니다
          softTimer = clearTimer(softTimer);
          terminateWorker();
          enterFallback('load-failed', true);
          return;
        }
        // 추론·시뮬레이션 실패는 엔진 자체는 살아 있다는 뜻이다. 직전 값을 유지하고
        // 화면 상태로만 번역한다 (구현규약 §6 — 침묵 실패 금지)
        console.error(`[prediction] 엔진 오류 (${envelope.payload.stage})`);
        host.setStatus('error');
        return;
      }
    }
  }

  function resolveIterations(mode: SimulationMode): Iterations {
    const base = mode === 'precise' ? PRECISE_ITERATIONS : FAST_ITERATIONS;
    return degraded ? halveIterations(base) : base;
  }

  function send(context: TacticContext, mode: SimulationMode): void {
    const iterations = resolveIterations(mode);
    inFlight = { generation: context.generation, iterations, mode, startedAt: now() };
    host.setStatus('simulating');
    // 진행 중 계산을 청크 경계에서 멈추게 한다. Worker는 대기열 1건만 들고 최신을 돌린다
    post({ type: 'cancel' });
    post({ type: 'simulate', payload: { ...context, iterations } });
    armWatchdog();
  }

  /**
   * 폴백 계산 — 메인 스레드
   *
   * Worker가 없거나 죽은 상태가 전제이므로 여기서 돕니다. MC는 순수 모듈이라 그대로
   * 재사용하며, **밴드와 프레임도 정상 경로와 같은 방식으로 만들어집니다** (F06 §8).
   */
  async function runFallback(context: TacticContext, mode: SimulationMode): Promise<void> {
    const token = (fallbackToken += 1);
    const iterations = resolveIterations(mode);
    const startedAt = now();

    const p: Probabilities = fallbackProbabilities(
      context.effectiveEloDiff,
      scoreParams.fallback.dHat,
    );

    host.setStatus('simulating');
    const result = await runMonteCarlo(
      {
        p,
        lambda: context.lambda,
        iterations,
        seed: seedFrom(context.matchId, context.effectiveEloDiff, context.lambda, iterations),
        gridConstants: scoreGridConstants,
      },
      {
        onProgress: (done, total) => {
          if (token === fallbackToken) host.setProgress(context.generation, { done, total });
        },
        // 새 폴백 계산이 시작됐거나 ONNX로 승격됐으면 이 계산은 버린다
        shouldCancel: () => token !== fallbackToken || disposed,
        yieldToEventLoop,
      },
    );

    if (token !== fallbackToken || disposed) return;

    host.setProgress(context.generation, null);
    host.setStatus('idle');
    if (!result) return;
    if (context.generation < appliedGeneration) return;
    appliedGeneration = context.generation;

    host.setResult(context.generation, {
      p,
      band: wilsonBand(p, iterations),
      frames: result.frames,
      iterations,
      elapsedMs: now() - startedAt,
    });
  }

  return {
    start(): void {
      if (disposed || worker) return;
      spawnWorker();
      softTimer = clearTimer(softTimer);
      softTimer = setTimeout(onSoftTimeout, SOFT_TIMEOUT_MS);
    },

    request(context: TacticContext, mode: SimulationMode): void {
      if (disposed) return;
      lastRequested = { context, mode };

      if (usingFallback || fallbackFinal) {
        void runFallback(context, mode);
        // 폴백 중이어도 Worker가 살아 있으면 ready 시 최신 상태를 추론해야 한다
        if (!ready && !fallbackFinal) pending = { context, mode };
        return;
      }

      if (!ready) {
        // 조작은 막지 않는다. 중간 상태는 이미 화면에 없으므로 마지막 것만 남긴다 (F05-R5)
        pending = { context, mode };
        return;
      }

      send(context, mode);
    },

    cancel(): void {
      if (disposed) return;
      // 폴백 계산도 같은 취소 경로를 쓴다
      fallbackToken += 1;
      post({ type: 'cancel' });
    },

    dispose(): void {
      disposed = true;
      softTimer = clearTimer(softTimer);
      hardTimer = clearTimer(hardTimer);
      fallbackToken += 1;
      terminateWorker();
    },
  };
}
