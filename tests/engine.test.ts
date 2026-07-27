/**
 * B5 예측 엔진 단위 테스트 — F05·F06·F07
 *
 * 대상 선정 근거: [F05 impl §6](../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md) ·
 * [F06 impl §6](../docs/planning/impl/version1.0/F06_몬테카를로_시뮬레이션_impl.md) ·
 * [F07 impl §6](../docs/planning/impl/version1.0/F07_확률_시각화_impl.md)
 *
 * E2E를 도입하지 않는 원칙(구현규약 §7)은 유지하되, **상태기계와 샘플러는 단위 테스트로
 * 덮습니다** — 타임아웃·재기동·수렴은 수동 재연이 가장 어렵고 회귀가 조용히 일어나는 곳입니다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allocate100 } from '@/lib/prediction/allocate';
import {
  DEGRADE_THRESHOLD_MS,
  HARD_TIMEOUT_MS,
  SOFT_TIMEOUT_MS,
  createPredictionClient,
  type PredictionHost,
} from '@/lib/prediction/client';
import { fallbackProbabilities } from '@/lib/prediction/fallback';
import { CHUNK_SIZE, FRAME_COUNT, runMonteCarlo } from '@/lib/prediction/montecarlo';
import { mulberry32, seedFrom } from '@/lib/prediction/random';
import { convergenceOutlier, standardError, wilsonBand, wilsonInterval } from '@/lib/prediction/wilson';
import { scoreGridConstants } from '@/lib/tactics/constants';
import type { Probabilities } from '@/types/data';
import {
  halveIterations,
  type EngineResult,
  type EstimateReason,
  type Iterations,
  type TacticContext,
  type WorkerRequest,
  type WorkerResponseEnvelope,
} from '@/types/worker';

/* ---------------------------------------------------------------------------
 * F07 — 100칸 배분
 * ------------------------------------------------------------------------- */

describe('allocate100 (F07 상호 불일치 0)', () => {
  it('무작위 확률 30,000건에서 합이 항상 정확히 100이다', () => {
    const random = mulberry32(20260727);
    for (let i = 0; i < 30_000; i += 1) {
      const a = random();
      const b = random() * (1 - a);
      const counts = allocate100({ win: a, draw: b, lose: 1 - a - b });
      expect(counts.win + counts.draw + counts.lose).toBe(100);
      expect(Math.min(counts.win, counts.draw, counts.lose)).toBeGreaterThanOrEqual(0);
    }
  });

  it('동률은 승 → 무 → 패 고정 순서로 배분한다 (결정론)', () => {
    const third = 1 / 3;
    expect(allocate100({ win: third, draw: third, lose: third })).toEqual({
      win: 34,
      draw: 33,
      lose: 33,
    });
  });

  it('Math.round 가 합을 101/99로 만드는 입력에서도 100을 지킨다', () => {
    // 실측으로 확보한 반례 (F07 impl §4.1)
    const over = { win: 0.495, draw: 0.305, lose: 0.2 };
    const under = { win: 0.894807, draw: 0.064186, lose: 0.041007 };
    for (const p of [over, under]) {
      const counts = allocate100(p);
      expect(counts.win + counts.draw + counts.lose).toBe(100);
    }
    // Math.round 를 그대로 쓰면 실제로 어긋난다는 것 자체를 고정한다
    expect(
      Math.round(over.win * 100) + Math.round(over.draw * 100) + Math.round(over.lose * 100),
    ).toBe(101);
  });

  it('극단값 — 확률이 한쪽에 몰려도 100칸을 유지한다', () => {
    expect(allocate100({ win: 1, draw: 0, lose: 0 })).toEqual({ win: 100, draw: 0, lose: 0 });
    const skewed = allocate100({ win: 0.999, draw: 0.0005, lose: 0.0005 });
    expect(skewed.win + skewed.draw + skewed.lose).toBe(100);
  });
});

/* ---------------------------------------------------------------------------
 * F06 — Wilson
 * ------------------------------------------------------------------------- */

describe('Wilson 밴드 (F06-R3 · F07-R4)', () => {
  it('평가_설계 §4.3의 반폭을 재현한다', () => {
    const half = (n: number): number => {
      const { low, high } = wilsonInterval(0.5, n);
      return ((high - low) / 2) * 100;
    };
    expect(half(5_000)).toBeCloseTo(1.385, 2);
    expect(half(25_000)).toBeCloseTo(0.62, 2);
  });

  it('정밀 모드 밴드가 빠른 모드보다 √5배 좁다 (F06 GWT 3의 정량형)', () => {
    const width = (n: number): number => {
      const { low, high } = wilsonInterval(0.5, n);
      return high - low;
    };
    expect(width(5_000) / width(25_000)).toBeCloseTo(Math.sqrt(5), 2);
  });

  it('0%·100% 근접에서도 [0,1] 을 벗어나지 않는다 (F07-R4)', () => {
    for (const q of [0, 1e-6, 0.5, 1 - 1e-6, 1]) {
      for (const n of [2_500, 5_000, 25_000]) {
        const { low, high } = wilsonInterval(q, n);
        expect(low).toBeGreaterThanOrEqual(0);
        expect(high).toBeLessThanOrEqual(1);
        expect(low).toBeLessThanOrEqual(high);
      }
    }
  });

  it('클램프가 없으면 q=1 에서 상한이 1을 넘는다 — 방어가 실제로 필요하다', () => {
    const z = 1.96;
    const n = 5_000;
    const raw =
      (1 + (z * z) / (2 * n)) / (1 + (z * z) / n) +
      (z / (1 + (z * z) / n)) * Math.sqrt(0 / n + (z * z) / (4 * n * n));
    expect(raw).toBeGreaterThan(1);
    expect(wilsonInterval(1, n).high).toBe(1);
  });

  it('n=0 이면 구간을 좁히지 않는다 — 돌리지 않은 시뮬레이션에 정밀도를 주장하지 않는다', () => {
    expect(wilsonInterval(0.5, 0)).toEqual({ low: 0, high: 1 });
  });
});

/* ---------------------------------------------------------------------------
 * F06 — 몬테카를로
 * ------------------------------------------------------------------------- */

const P: Probabilities = { win: 0.489686, draw: 0.299343, lose: 0.210971 };
const LAMBDA = [1.42, 1.05] as const;

const immediateHooks = (overrides: Partial<Parameters<typeof runMonteCarlo>[1]> = {}) => ({
  onProgress: () => {},
  shouldCancel: () => false,
  yieldToEventLoop: () => Promise.resolve(),
  ...overrides,
});

describe('조건부 2단 샘플링 (F06)', () => {
  it('집계 p̂ 가 표시 확률 p 로 수렴한다 — 구조적 보장의 검증', async () => {
    const result = await runMonteCarlo(
      { p: P, lambda: LAMBDA, iterations: 25_000, seed: 1234, gridConstants: scoreGridConstants },
      immediateHooks(),
    );
    expect(result).not.toBeNull();
    if (!result) return;
    // 5·SE 를 넘으면 난수가 아니라 샘플러가 망가진 것이다
    expect(convergenceOutlier(P, result.empirical, 25_000)).toBeNull();
    for (const key of ['win', 'draw', 'lose'] as const) {
      expect(Math.abs(result.empirical[key] - P[key])).toBeLessThan(
        5 * standardError(P[key], 25_000),
      );
    }
  });

  it('같은 입력은 같은 결과를 낸다 (시드 결정론)', async () => {
    const run = () =>
      runMonteCarlo(
        { p: P, lambda: LAMBDA, iterations: 5_000, seed: seedFrom('cze', 12.5, LAMBDA, 5_000), gridConstants: scoreGridConstants },
        immediateHooks(),
      );
    const [a, b] = await Promise.all([run(), run()]);
    expect(a).toEqual(b);
  });

  it('프레임을 20개 뽑고, 스코어가 결과 범주와 모순되지 않는다', async () => {
    const result = await runMonteCarlo(
      { p: P, lambda: LAMBDA, iterations: 5_000, seed: 7, gridConstants: scoreGridConstants },
      immediateHooks(),
    );
    expect(result?.frames).toHaveLength(FRAME_COUNT);
    for (const frame of result?.frames ?? []) {
      if (frame.outcome === 'win') expect(frame.self).toBeGreaterThan(frame.opp);
      else if (frame.outcome === 'draw') expect(frame.self).toBe(frame.opp);
      else expect(frame.self).toBeLessThan(frame.opp);
    }
  });

  it('청크마다 진행률을 보고하고 마지막 보고가 총량과 같다', async () => {
    const reports: { done: number; total: number }[] = [];
    await runMonteCarlo(
      { p: P, lambda: LAMBDA, iterations: 5_000, seed: 7, gridConstants: scoreGridConstants },
      immediateHooks({ onProgress: (done, total) => reports.push({ done, total }) }),
    );
    expect(reports).toHaveLength(5_000 / CHUNK_SIZE);
    expect(reports.at(-1)).toEqual({ done: 5_000, total: 5_000 });
  });

  it('청크 경계에서 취소되면 null 을 돌려준다 — 호출자는 직전 결과를 유지한다 (F06-R4)', async () => {
    let chunks = 0;
    const result = await runMonteCarlo(
      { p: P, lambda: LAMBDA, iterations: 25_000, seed: 7, gridConstants: scoreGridConstants },
      immediateHooks({
        onProgress: () => {
          chunks += 1;
        },
        shouldCancel: () => chunks >= 3,
      }),
    );
    expect(result).toBeNull();
    expect(chunks).toBe(3);
  });
});

/* ---------------------------------------------------------------------------
 * F05 — 폴백 산식
 * ------------------------------------------------------------------------- */

describe('JS 통계 폴백 (F05-R4 · ML 설계 §6.3)', () => {
  it('Δ=0 이면 승·패가 같고 무승부는 d̂ 이다', () => {
    const p = fallbackProbabilities(0, 0.2807);
    expect(p.win).toBeCloseTo(p.lose, 12);
    expect(p.draw).toBeCloseTo(0.2807, 12);
  });

  it('합이 언제나 1 이고 세 값이 [0,1] 이다', () => {
    for (const delta of [-2000, -400, -1, 0, 1, 400, 2000]) {
      const p = fallbackProbabilities(delta, 0.2807);
      expect(p.win + p.draw + p.lose).toBeCloseTo(1, 12);
      for (const value of [p.win, p.draw, p.lose]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Δ_eff 가 커지면 승률이 단조 증가한다 — 슬라이더가 폴백에서도 확률을 움직인다', () => {
    const values = [-300, -100, 0, 100, 300].map((d) => fallbackProbabilities(d, 0.2807).win);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] as number).toBeGreaterThan(values[i - 1] as number);
    }
  });
});

/* ---------------------------------------------------------------------------
 * F05 — 클라이언트 상태기계
 * ------------------------------------------------------------------------- */

interface FakeWorker {
  postMessage(request: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerResponseEnvelope>) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
  sent: WorkerRequest[];
  emit(envelope: WorkerResponseEnvelope): void;
  terminated: boolean;
}

function makeFakeWorker(): FakeWorker {
  const worker: FakeWorker = {
    sent: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage(request) {
      worker.sent.push(request);
    },
    terminate() {
      worker.terminated = true;
    },
    emit(envelope) {
      worker.onmessage?.({ data: envelope } as MessageEvent<WorkerResponseEnvelope>);
    },
  };
  return worker;
}

function makeHost() {
  const calls = {
    status: [] as string[],
    engine: [] as { engine: string; reason: EstimateReason | null }[],
    results: [] as { generation: number; result: EngineResult }[],
    degraded: [] as boolean[],
    progress: [] as ({ done: number; total: number } | null)[],
  };
  const host: PredictionHost = {
    setStatus: (status) => calls.status.push(status),
    setEngine: (engine, reason) => calls.engine.push({ engine, reason }),
    setProgress: (_generation, progress) => calls.progress.push(progress),
    setResult: (generation, result) => calls.results.push({ generation, result }),
    setDegraded: (value) => calls.degraded.push(value),
  };
  return { host, calls };
}

const context = (generation: number): TacticContext => ({
  matchId: 'cze',
  effectiveEloDiff: 12.5,
  lambda: LAMBDA,
  lambda0: LAMBDA,
  generation,
});

const resultEnvelope = (generation: number): WorkerResponseEnvelope => ({
  type: 'result',
  generation,
  payload: {
    p: [P.win, P.draw, P.lose],
    wilson: wilsonBand(P, 5_000),
    frames: [],
  },
});

describe('예측 클라이언트 상태기계 (F05-R5·R6 · F06-R7)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ready 전 조작은 큐잉되고, ready 시 **마지막 1건만** 추론한다 (F05-R5)', () => {
    const { host, calls } = makeHost();
    const worker = makeFakeWorker();
    const client = createPredictionClient({
      host,
      createWorker: () => worker as unknown as Worker,
      now: () => Date.now(),
    });
    client.start();

    client.request(context(1), 'fast');
    client.request(context(2), 'fast');
    client.request(context(3), 'fast');
    expect(worker.sent.filter((r) => r.type === 'simulate')).toHaveLength(0);

    worker.emit({ type: 'ready', generation: 0 });
    const sent = worker.sent.filter((r) => r.type === 'simulate');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ payload: { generation: 3 } });
    expect(calls.engine.at(-1)).toEqual({ engine: 'onnx', reason: null });
    client.dispose();
  });

  it('T_soft 에서 폴백을 켜되 Worker 를 죽이지 않고, 늦은 ready 로 승격한다', async () => {
    const { host, calls } = makeHost();
    const worker = makeFakeWorker();
    const client = createPredictionClient({
      host,
      createWorker: () => worker as unknown as Worker,
      now: () => Date.now(),
    });
    client.start();
    client.request(context(1), 'fast');

    await vi.advanceTimersByTimeAsync(SOFT_TIMEOUT_MS + 10);
    expect(calls.engine.at(-1)).toEqual({ engine: 'fallback', reason: 'timeout' });
    expect(worker.terminated).toBe(false);

    worker.emit({ type: 'ready', generation: 0 });
    expect(calls.engine.at(-1)).toEqual({ engine: 'onnx', reason: null });
    client.dispose();
  });

  it('T_hard 에서 **한 번만** 재기동하고, 재실패 시 폴백으로 확정한다 (F05-R6)', async () => {
    const { host, calls } = makeHost();
    const workers: FakeWorker[] = [];
    const client = createPredictionClient({
      host,
      createWorker: () => {
        const worker = makeFakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      now: () => Date.now(),
    });
    client.start();

    await vi.advanceTimersByTimeAsync(HARD_TIMEOUT_MS + 10);
    expect(workers).toHaveLength(2);
    expect(workers[0]?.terminated).toBe(true);

    await vi.advanceTimersByTimeAsync(HARD_TIMEOUT_MS + 10);
    expect(workers).toHaveLength(2); // 재기동은 1회뿐
    expect(workers[1]?.terminated).toBe(true);
    expect(calls.engine.at(-1)?.engine).toBe('fallback');
    client.dispose();
  });

  it('error(load) 는 재기동 없이 즉시 폴백이다 — 재시도해도 고쳐지지 않는다', async () => {
    const { host, calls } = makeHost();
    const workers: FakeWorker[] = [];
    const client = createPredictionClient({
      host,
      createWorker: () => {
        const worker = makeFakeWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
      now: () => Date.now(),
    });
    client.start();
    workers[0]?.emit({ type: 'error', generation: 0, payload: { stage: 'load' } });

    expect(calls.engine.at(-1)).toEqual({ engine: 'fallback', reason: 'load-failed' });
    await vi.advanceTimersByTimeAsync(HARD_TIMEOUT_MS * 2);
    expect(workers).toHaveLength(1);
    client.dispose();
  });

  it('구식 세대의 결과는 화면에 반영되지 않는다 (F04-R4)', () => {
    const { host, calls } = makeHost();
    const worker = makeFakeWorker();
    const client = createPredictionClient({
      host,
      createWorker: () => worker as unknown as Worker,
      now: () => Date.now(),
    });
    client.start();
    worker.emit({ type: 'ready', generation: 0 });

    client.request(context(5), 'fast');
    worker.emit(resultEnvelope(5));
    expect(calls.results).toHaveLength(1);

    // 취소 직후 도착한 옛 결과 — 봉투의 generation 이 없으면 막을 수 없는 경로
    worker.emit(resultEnvelope(3));
    expect(calls.results).toHaveLength(1);
    client.dispose();
  });

  it('빠른 모드 왕복이 임계를 넘으면 다음 자동 실행부터 절반으로 낮춘다 (F06-R7)', () => {
    const { host, calls } = makeHost();
    const worker = makeFakeWorker();
    let clock = 0;
    const client = createPredictionClient({
      host,
      createWorker: () => worker as unknown as Worker,
      now: () => clock,
    });
    client.start();
    worker.emit({ type: 'ready', generation: 0 });

    client.request(context(1), 'fast');
    clock = DEGRADE_THRESHOLD_MS + 1;
    worker.emit(resultEnvelope(1));
    expect(calls.degraded).toEqual([true]);

    client.request(context(2), 'fast');
    const last = worker.sent.filter((r) => r.type === 'simulate').at(-1);
    expect(last).toMatchObject({ payload: { iterations: 2_500 } });
    client.dispose();
  });

  it('강등은 유니온 안에서 닫혀 있고 바닥값에서 더 내려가지 않는다', () => {
    const cases: [Iterations, Iterations][] = [
      [25_000, 12_500],
      [12_500, 12_500],
      [5_000, 2_500],
      [2_500, 2_500],
    ];
    for (const [input, expected] of cases) expect(halveIterations(input)).toBe(expected);
  });
});
