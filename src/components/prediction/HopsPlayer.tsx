'use client';

import { useEffect, useState } from 'react';
import type { Frame } from '@/types/worker';

/** P12 — 400ms/프레임. 100ms 미만은 금지 */
export const HOPS_FRAME_MS = 400;

interface HopsPlayerProps {
  frames: Frame[];
}

const OUTCOME_LABEL = { win: '승', draw: '무', lose: '패' } as const;

/**
 * HOPs 재생기 (F07-R2·R5·R6)
 *
 * 구현 명세: [F07 impl §4.4·§4.5](../../../docs/planning/impl/version1.0/F07_확률_시각화_impl.md)
 *
 * ## 배열과 역할이 다르다
 *
 * 배열은 *집계*를, HOPs는 *개별 시뮬레이션 한 번*을 보입니다. "49%"가 추상적으로 느껴지는
 * 사용자에게 "2-1 승, 0-0 무, 1-3 패…"가 지나가는 것이 확률의 의미를 전달하는 방식입니다.
 * 한쪽이 다른 쪽을 대체하지 않으므로 둘 다 있습니다.
 *
 * ## reduced-motion에서 기능을 없애지 않는다
 *
 * 계약 문구는 "자동 재생을 비활성화하고 정적 배열만"이지만, 그대로 하면 이 사용자군은
 * 개별 시뮬레이션을 볼 방법이 사라집니다. **자동 재생 경로만 제거하고** 수동 넘기기를
 * 남깁니다 — 접근성 설정에 대한 응답은 기능 박탈이 아니라 대안 제공입니다.
 */
export function HopsPlayer({ frames }: HopsPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  // OS 설정은 세션 중에도 바뀔 수 있다. 바뀌면 재생 중이던 타이머가 즉시 멈춰야 한다
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReduced(query.matches);
      if (query.matches) setPlaying(false);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // F07-R5 — 새 결과가 오면 재생을 멈추고 정지 상태에서 시작한다. 자동 재개하면
  // 전술을 바꾼 직후 화면이 스스로 움직여 조작 결과를 읽기 어려워진다
  useEffect(() => {
    setPlaying(false);
    setIndex(0);
  }, [frames]);

  useEffect(() => {
    if (!playing || reduced || frames.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), HOPS_FRAME_MS);
    // 정리하지 않으면 패널을 접었다 폈을 때 타이머가 중첩돼 400ms가 200ms가 된다
    return () => clearInterval(id);
  }, [playing, reduced, frames]);

  // 누를 수 있지만 아무 일도 일어나지 않는 컨트롤을 두지 않는다
  if (frames.length === 0) return null;

  const frame = frames[index % frames.length] as Frame;

  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="개별 시뮬레이션 보기">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-text-3">
          개별 시뮬레이션 결과를 하나씩 보여 줍니다. 확률 요약은 위 표에 있습니다.
        </p>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {/* 400ms마다 스크린리더가 읽으면 패널을 벗어날 수 없다 — 낭독은 위 정적 설명이 맡는다 */}
        <p className="text-[18px] font-bold tabular-nums" aria-live="off">
          {frame.self}-{frame.opp}{' '}
          <span className="text-text-2">{OUTCOME_LABEL[frame.outcome]}</span>
        </p>

        {reduced ? (
          <button
            type="button"
            className="min-h-11 rounded-md border border-line px-3 text-[13px]"
            onClick={() => setIndex((i) => (i + 1) % frames.length)}
          >
            다음 시뮬레이션 보기
          </button>
        ) : (
          <button
            type="button"
            className="min-h-11 rounded-md border border-line px-3 text-[13px]"
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? '정지' : '재생'}
          </button>
        )}

        <span className="text-[13px] text-text-4 tabular-nums">
          {(index % frames.length) + 1} / {frames.length}
        </span>
      </div>
    </section>
  );
}
