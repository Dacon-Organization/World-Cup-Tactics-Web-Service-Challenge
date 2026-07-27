/**
 * 예측 Worker 엔트리 — 메인 스레드를 비우기 위한 유일한 목적
 *
 * 구현 명세: [F05 impl §4.2·§4.5](../../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md) ·
 * [F06 impl §4.6](../../../docs/planning/impl/version1.0/F06_몬테카를로_시뮬레이션_impl.md)
 *
 * ## 메시지 핸들러는 플래그와 대기열만 만진다
 *
 * 청크 사이에 이벤트 루프로 양보하므로, 실행 중에 새 `simulate`가 도착할 수 있습니다.
 * 핸들러가 곧바로 시뮬레이션을 시작하면 **두 루프가 동시에 돌며 서로의 카운터를
 * 오염시킵니다.** 실행은 `drain()` 하나가 전담하고, 대기열은 최대 1건입니다.
 */

import * as ort from 'onnxruntime-web/wasm';
import { blendDrawShare } from '@/lib/tactics/blend';
import { getMatchContext, scoreGridConstants, scoreParams } from '@/lib/tactics/constants';
import type { Probabilities } from '@/types/data';
import {
  FAST_ITERATIONS,
  OUTCOME_ORDER,
  type Iterations,
  type TacticContext,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResponseEnvelope,
} from '@/types/worker';
import { buildFeatureVector } from './features';
import { runMonteCarlo, yieldToEventLoop } from './montecarlo';
import { seedFrom } from './random';
import { wilsonBand, convergenceOutlier } from './wilson';

/**
 * Worker 전역의 타입 창구
 *
 * `tsconfig.lib`이 `dom`이라 전역 `postMessage`가 window 시그니처로 잡힙니다.
 * lib을 바꾸면 앱 전체가 영향을 받으므로, 여기서만 필요한 두 함수를 좁게 선언합니다
 * (`any` 없이).
 */
const scope = globalThis as unknown as {
  postMessage(message: WorkerResponseEnvelope): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void;
  location: { origin: string };
};

function reply(response: WorkerResponse, generation: number): void {
  scope.postMessage({ ...response, generation } as WorkerResponseEnvelope);
}

/* ---------------------------------------------------------------------------
 * 엔진 초기화
 * ------------------------------------------------------------------------- */

let session: ort.InferenceSession | null = null;
let initPromise: Promise<void> | null = null;

/**
 * ORT 초기화 — 이 함수가 F05-R3(외부 요청 0건)의 전부
 *
 * `wasmPaths`를 **문자열 접두사로 주면 안 됩니다.** 1.27.0은 내장 glue를 쓰는 조건이
 * `임베드 glue && !(mjs 재정의 || 접두사)` 이라, 접두사를 주는 순간 `.mjs`까지 같은
 * 경로에서 받으려 합니다 — 우리는 `.wasm` 하나만 호스팅하므로 404로 로드가 실패합니다.
 * 객체형 `{ wasm }`이면 내장 glue가 쓰이고 `locateFile`이 항상 우리 절대 URL을 돌려주어
 * **요청이 `.wasm` 1건**으로 끝납니다 (F05 impl §4.2).
 *
 * `numThreads = 1`은 같은 분기에 걸려 있고, 스레드 wasm이 요구하는 COOP/COEP 교차출처
 * 격리를 앱 전역에 걸지 않기 위해서이기도 합니다.
 */
async function initialize(): Promise<void> {
  ort.env.wasm.wasmPaths = {
    wasm: new URL('/ort/ort-wasm-simd-threaded.wasm', scope.location.origin).href,
  };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';

  const response = await fetch(new URL('/model/outcome.onnx', scope.location.origin));
  if (!response.ok) {
    throw new Error(`모델 파일을 받지 못했습니다: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());

  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
}

/* ---------------------------------------------------------------------------
 * 추론
 * ------------------------------------------------------------------------- */

/**
 * 분류기 + 무승부 몫 = 표시 확률
 *
 * **두 번째 단계를 빠뜨리면 템포 슬라이더가 확률을 전혀 움직이지 못합니다** — 템포는
 * 정의상 λ 비율을 안 바꾸고 합만 바꾸므로 Δ_eff 경로에 나타나지 않습니다
 * (ITERATION-LOG c3 · F05 impl §4.5).
 */
async function inferProbabilities(context: TacticContext): Promise<Probabilities> {
  if (!session) throw new Error('세션이 준비되지 않았습니다');

  const matchContext = getMatchContext(context.matchId);
  const vector = buildFeatureVector(
    matchContext,
    context.effectiveEloDiff,
    scoreParams.model.featureOrder,
  );

  const output = await session.run({
    [scoreParams.model.inputName]: new ort.Tensor('float32', vector, [1, vector.length]),
  });
  const data = output[scoreParams.model.outputName]?.data;
  if (!(data instanceof Float32Array) || data.length < OUTCOME_ORDER.length) {
    throw new Error(`출력 '${scoreParams.model.outputName}' 를 읽지 못했습니다`);
  }

  const classifier: Probabilities = {
    win: data[0] as number,
    draw: data[1] as number,
    lose: data[2] as number,
  };

  return blendDrawShare(classifier, context.lambda, context.lambda0, scoreGridConstants);
}

/* ---------------------------------------------------------------------------
 * 작업 관리 — 실행은 drain() 하나가 전담한다
 * ------------------------------------------------------------------------- */

interface Job {
  context: TacticContext;
  iterations: Iterations;
}

let running = false;
let cancelRequested = false;
let queued: Job | null = null;

async function process(job: Job): Promise<void> {
  const { context, iterations } = job;

  let p: Probabilities;
  try {
    // 클라이언트는 `ready` 이후에만 보내지만(F05-R5 큐잉), 순서를 여기서도 강제한다.
    // 초기화가 실패했다면 이 await가 그 예외를 그대로 던져 준다
    if (initPromise) await initPromise;
    p = await inferProbabilities(context);
  } catch (error) {
    console.error('[worker] 추론 실패', error);
    reply({ type: 'error', payload: { stage: 'infer' } }, context.generation);
    return;
  }

  // 확률 합 계약 (구현규약 §4). 위반값을 샘플러에 넣으면 무한 루프나 NaN이 된다
  const total = p.win + p.draw + p.lose;
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-6) {
    console.error(`[worker] 확률 합이 계약(1 ± 1e-6)을 벗어났습니다: ${total}`);
    reply({ type: 'error', payload: { stage: 'infer' } }, context.generation);
    return;
  }

  let result: Awaited<ReturnType<typeof runMonteCarlo>>;
  try {
    result = await runMonteCarlo(
      {
        p,
        lambda: context.lambda,
        iterations,
        // 같은 전술은 같은 밴드를 낳는다 (F06 impl §4.3)
        seed: seedFrom(context.matchId, context.effectiveEloDiff, context.lambda, iterations),
        gridConstants: scoreGridConstants,
      },
      {
        onProgress: (done, totalCount) =>
          reply({ type: 'progress', payload: { done, total: totalCount } }, context.generation),
        shouldCancel: () => cancelRequested,
        yieldToEventLoop,
      },
    );
  } catch (error) {
    console.error('[worker] 시뮬레이션 실패', error);
    reply({ type: 'error', payload: { stage: 'simulate' } }, context.generation);
    return;
  }

  if (!result) {
    reply({ type: 'cancelled' }, context.generation);
    return;
  }

  // 샘플러 자기 검사 — 그럴듯한 숫자를 조용히 내는 실패를 잡는 유일한 장치
  const outlier = convergenceOutlier(p, result.empirical, iterations);
  if (outlier) {
    console.error(
      `[worker] MC 집계가 표시 확률에서 5·SE 넘게 벗어났습니다 (${outlier}) — 샘플러 점검 필요`,
    );
  }

  reply(
    {
      type: 'result',
      payload: {
        p: [p.win, p.draw, p.lose],
        wilson: wilsonBand(p, iterations),
        frames: result.frames,
      },
    },
    context.generation,
  );
}

async function drain(first: Job): Promise<void> {
  running = true;
  let job: Job | null = first;

  while (job) {
    // 새 작업은 자기 취소 플래그로 시작한다 — 이전 작업을 멈추려고 세운 값을 물려받으면
    // 시작하자마자 스스로 취소된다
    cancelRequested = false;
    await process(job);
    job = queued;
    queued = null;
  }

  running = false;
}

function submit(job: Job): void {
  if (running) {
    // 진행 중인 계산을 청크 경계에서 멈추고, 최신 1건만 남긴다 (F06-R6)
    cancelRequested = true;
    queued = job;
    return;
  }
  void drain(job);
}

/* ---------------------------------------------------------------------------
 * 메시지 창구
 * ------------------------------------------------------------------------- */

scope.addEventListener('message', (event) => {
  const request = event.data;

  switch (request.type) {
    case 'init': {
      if (initPromise) return;
      initPromise = initialize();
      void initPromise.then(
        () => reply({ type: 'ready' }, 0),
        (error: unknown) => {
          console.error('[worker] 엔진 초기화 실패', error);
          reply({ type: 'error', payload: { stage: 'load' } }, 0);
        },
      );
      return;
    }

    case 'cancel': {
      cancelRequested = true;
      return;
    }

    // `infer`는 P0 런타임에서 쓰이지 않습니다. 계약(§6.1)에 있으므로 조용히 무시하지 않고
    // 빠른 모드와 같게 처리합니다 — MC 비용이 수 밀리초라 단일 추론만 돌려줄 이유가 없고,
    // 밴드 없는 `result`를 만들면 "MC를 안 돌린 신뢰구간"이라는 거짓 정보가 생깁니다.
    case 'infer': {
      submit({ context: request.payload, iterations: FAST_ITERATIONS });
      return;
    }

    case 'simulate': {
      const { iterations, ...context } = request.payload;
      submit({ context, iterations });
      return;
    }
  }
});
