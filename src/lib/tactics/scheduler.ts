/**
 * 커밋 스케줄러 — debounce · 마지막 값 승리 · 구식 결과 폐기
 *
 * 근거: 구현규약 §4(debounce 160ms) · [F04 impl §4.2](../../../docs/planning/impl/version1.0/F04_전술_슬라이더_impl.md)
 *
 * 슬라이더(F04)·드래그(F02)·클릭-클릭(F03)이 **같은 스케줄러**를 씁니다. 조작 수단마다
 * 따로 debounce를 두면 "슬라이더 만지고 바로 토큰을 옮겼을 때" 두 계산이 경쟁합니다.
 */

/** 구현규약 §4 — 100ms 프리뷰 예산 이후 `[설계 결정]` */
export const COMMIT_DEBOUNCE_MS = 160;

export interface CommitScheduler<T> {
  /** 이전 예약을 취소하고 다시 예약한다. 보관하는 스냅샷은 항상 **마지막 것 하나** */
  schedule(snapshot: T): void;
  /** 예약 취소 — 커밋되지 않는다 (F02-R4 Esc · F02-R5 피치 밖 드롭) */
  cancel(): void;
  /** 예약을 건너뛰고 즉시 커밋 (언마운트 직전 등) */
  flush(): void;
  /**
   * 현재 세대. `schedule` 마다 증가합니다.
   *
   * 비동기 소비자(B5 Worker)가 응답에 이 값을 실어 보내고, 돌아왔을 때 최신 세대가
   * 아니면 버립니다 — F04-R4 "구식 결과 표시 금지"를 **값으로** 강제하는 장치입니다.
   * 타이머만으로는 "계산이 오래 걸려 늦게 도착한 옛날 결과"를 막을 수 없습니다.
   */
  readonly generation: number;
}

export function createCommitScheduler<T>(
  onCommit: (snapshot: T, generation: number) => void,
  delayMs: number = COMMIT_DEBOUNCE_MS,
): CommitScheduler<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { snapshot: T; generation: number } | null = null;
  let generation = 0;

  function clear(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    schedule(snapshot: T): void {
      clear();
      generation += 1;
      pending = { snapshot, generation };
      timer = setTimeout(() => {
        timer = null;
        const next = pending;
        pending = null;
        if (next) onCommit(next.snapshot, next.generation);
      }, delayMs);
    },

    cancel(): void {
      clear();
      pending = null;
    },

    flush(): void {
      clear();
      const next = pending;
      pending = null;
      if (next) onCommit(next.snapshot, next.generation);
    },

    get generation(): number {
      return generation;
    },
  };
}
