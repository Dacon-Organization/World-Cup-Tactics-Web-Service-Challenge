/**
 * 조건부 2단 샘플링 — 몬테카를로
 *
 * 정본: [ML 설계 §4.3](../../../docs/planning/ml/version1.0/ML_설계_v1_0.md) ·
 * 수학: [평가_설계 §4](../../../docs/planning/ml/version1.0/평가_설계_v1_0.md) ·
 * 구현 명세: [F06 impl §4.2](../../../docs/planning/impl/version1.0/F06_몬테카를로_시뮬레이션_impl.md)
 *
 * ## 1단계가 `p`를 쓰고 격자의 주변분포를 쓰지 않는 것이 이 설계의 핵심
 *
 * 전확률 법칙 `P(score) = Σ_r P(r)·P(score|r)` 에서 2단계(조건부 스코어)는 범주의
 * 주변분포를 건드리지 않습니다. 따라서 집계 `p̂`는 표시 확률 `p`로 수렴하며, 화면의
 * 퍼센트(단일 추론)와 배열·밴드(MC 집계)가 **어긋날 수 없습니다** — F07 수용 기준
 * "상호 불일치 0"이 구현 품질이 아니라 구조로 보장되는 지점입니다.
 *
 * ## 이 파일은 Worker 전용이 아닙니다
 *
 * 폴백 모드에서는 Worker가 없거나 죽은 상태이므로 **메인 스레드가 직접 돌립니다**.
 * `self`·`postMessage` 를 참조하지 않는 순수 모듈이어야 하는 이유입니다 (F05 impl §4.6).
 */

import { scoreGrid, type ScoreGridConstants } from '@/lib/tactics/blend';
import type { Probabilities } from '@/types/data';
import { OUTCOME_ORDER, type Frame, type Iterations, type Outcome } from '@/types/worker';
import { mulberry32 } from './random';

/** 구현규약 §4 — `progress` 보고 단위이자 `cancel` 반영 지연 상한 */
export const CHUNK_SIZE = 500;

/** 평가_설계 §4.5 기본값 */
export const FRAME_COUNT = 20;

export interface MonteCarloInput {
  /** 표시 확률 — 1단계 범주 추출에 쓴다 */
  p: Probabilities;
  /** 조정 후 λ 쌍 — 2단계 스코어 격자를 만든다 */
  lambda: readonly [number, number];
  iterations: Iterations;
  seed: number;
  gridConstants: ScoreGridConstants;
}

export interface MonteCarloHooks {
  onProgress(done: number, total: number): void;
  shouldCancel(): boolean;
  /**
   * 이벤트 루프에 제어를 돌려준다.
   *
   * **주입받는 이유**: 이것이 없으면 `cancel`은 영원히 도착하지 않습니다. Worker의
   * `onmessage`는 큐에 쌓이고 동기 루프가 도는 동안 실행되지 않으므로, 청크로 쪼개기만
   * 하고 양보하지 않으면 "청크 경계 취소"는 코드가 아니라 착각입니다 (F06 impl §4.5).
   * 테스트는 즉시 resolve 하는 함수를 넣어 결정론적으로 돌립니다.
   */
  yieldToEventLoop(): Promise<void>;
}

export interface MonteCarloResult {
  /** MC 집계 p̂ — 표시용이 아니라 수렴 자기 검사용 (F06 impl §4.4) */
  empirical: Probabilities;
  frames: Frame[];
}

interface ConditionalTable {
  /** 이 범주에 속하는 셀의 스코어. `cumulative`와 인덱스가 대응한다 */
  scores: { self: number; opp: number }[];
  /** 누적 확률. 마지막 원소는 1 (총합 0이면 빈 배열) */
  cumulative: number[];
}

/**
 * 범주별 조건부 분포 — 격자에서 해당 결과와 일치하는 칸만 남겨 재정규화
 *
 * N과 무관하게 **1회만** 만듭니다. 반복마다 다시 만들면 25,000회가 격자 생성 25,000회가
 * 됩니다.
 */
function buildConditionalTables(
  lambda: readonly [number, number],
  k: ScoreGridConstants,
): Record<Outcome, ConditionalTable> {
  const { cells } = scoreGrid(lambda[0], lambda[1], k);

  const scores: Record<Outcome, { self: number; opp: number }[]> = {
    win: [],
    draw: [],
    lose: [],
  };
  const weights: Record<Outcome, number[]> = { win: [], draw: [], lose: [] };
  const totals: Record<Outcome, number> = { win: 0, draw: 0, lose: 0 };

  for (let i = 0; i < cells.length; i += 1) {
    const row = cells[i] as number[];
    for (let j = 0; j < row.length; j += 1) {
      const cell = row[j] as number;
      const outcome: Outcome = i > j ? 'win' : i === j ? 'draw' : 'lose';
      scores[outcome].push({ self: i, opp: j });
      weights[outcome].push(cell);
      totals[outcome] += cell;
    }
  }

  const tables = {} as Record<Outcome, ConditionalTable>;
  for (const outcome of OUTCOME_ORDER) {
    const total = totals[outcome];
    if (!(total > 0)) {
      // 격자 상한이 6골이라 어떤 λ에서도 세 분할이 비지 않는다. 여기 도달하면
      // 격자가 망가진 것이므로 조용히 균등 분포로 대체하지 않는다 (구현규약 §6)
      tables[outcome] = { scores: [], cumulative: [] };
      continue;
    }
    const cumulative = new Array<number>(weights[outcome].length);
    let running = 0;
    for (let idx = 0; idx < weights[outcome].length; idx += 1) {
      running += (weights[outcome][idx] as number) / total;
      cumulative[idx] = running;
    }
    // 누적 마지막은 부동소수점 때문에 0.9999...가 될 수 있다. 1로 못 박아야
    // u가 그 사이에 떨어졌을 때 탐색이 배열 밖을 가리키지 않는다
    cumulative[cumulative.length - 1] = 1;
    tables[outcome] = { scores: scores[outcome], cumulative };
  }
  return tables;
}

/** 누적 배열에서 `u` 이상인 첫 인덱스 (lower bound) */
function pickIndex(cumulative: number[], u: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((cumulative[mid] as number) < u) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * 몬테카를로 실행
 *
 * @returns 취소되면 `null` — 호출자는 직전 결과를 그대로 유지한다 (F06-R4)
 */
export async function runMonteCarlo(
  input: MonteCarloInput,
  hooks: MonteCarloHooks,
): Promise<MonteCarloResult | null> {
  const { p, lambda, iterations, seed, gridConstants } = input;

  const tables = buildConditionalTables(lambda, gridConstants);

  // 샘플링 불가 범주는 확률 0으로 빼고 재정규화한다. 그대로 두면 뽑을 칸이 없는
  // 범주가 선택돼 무한 루프가 되거나 undefined 스코어가 나온다
  const usable: Record<Outcome, number> = { win: 0, draw: 0, lose: 0 };
  for (const outcome of OUTCOME_ORDER) {
    usable[outcome] = tables[outcome].cumulative.length > 0 ? Math.max(0, p[outcome]) : 0;
  }
  const usableTotal = usable.win + usable.draw + usable.lose;
  if (!(usableTotal > 0)) {
    console.error('[montecarlo] 샘플링 가능한 범주가 없습니다 — 격자 또는 확률이 손상됐습니다');
    return null;
  }
  if (Math.abs(usableTotal - 1) > 1e-9) {
    console.error(
      `[montecarlo] 범주 확률 합이 ${usableTotal.toFixed(9)} 입니다 — 재정규화 후 진행합니다`,
    );
  }

  // 1단계 누적: [P(승), P(승)+P(무), 1]
  const cutWin = usable.win / usableTotal;
  const cutDraw = cutWin + usable.draw / usableTotal;

  const random = mulberry32(seed);
  const counts: Record<Outcome, number> = { win: 0, draw: 0, lose: 0 };
  const frames: Frame[] = [];
  const stride = Math.max(1, Math.floor(iterations / FRAME_COUNT));

  for (let done = 0; done < iterations; done += CHUNK_SIZE) {
    const end = Math.min(done + CHUNK_SIZE, iterations);

    for (let step = done; step < end; step += 1) {
      // ① 결과 범주 r ~ Categorical(p)
      const u1 = random();
      const outcome: Outcome = u1 < cutWin ? 'win' : u1 < cutDraw ? 'draw' : 'lose';
      counts[outcome] += 1;

      // ② 스코어 (x, y) ~ P(x, y | r)
      const table = tables[outcome];
      const index = pickIndex(table.cumulative, random());
      const score = table.scores[index] as { self: number; opp: number };

      // 프레임은 등간격으로 뽑는다 — 반복이 i.i.d.이므로 어떤 고정 부분집합도 편향이 없고,
      // 등간격은 그 사실이 코드에서 바로 읽힌다
      if (frames.length < FRAME_COUNT && step % stride === 0) {
        frames.push({ outcome, self: score.self, opp: score.opp });
      }
    }

    hooks.onProgress(end, iterations);
    await hooks.yieldToEventLoop();
    if (hooks.shouldCancel()) return null;
  }

  return {
    empirical: {
      win: counts.win / iterations,
      draw: counts.draw / iterations,
      lose: counts.lose / iterations,
    },
    frames,
  };
}

/**
 * `setTimeout(0)`이 아니라 `MessageChannel`을 쓰는 이유
 *
 * `setTimeout(0)`은 중첩 5회 이후 브라우저가 ~4ms로 클램프합니다. 25,000회는 50청크이므로
 * 200ms를 계산이 아니라 **대기**로 쓰게 됩니다. `MessageChannel`은 클램프 없는 매크로태스크라
 * 밀리초 이하로 양보하면서도 메시지 큐를 비워 줍니다 (F06 impl §4.5).
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}
