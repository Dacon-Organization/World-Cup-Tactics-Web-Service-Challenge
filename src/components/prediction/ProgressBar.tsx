'use client';

import { useEffect, useState } from 'react';

/**
 * 바를 띄우기까지 기다리는 시간 `[설계 결정]`
 *
 * 대부분의 시뮬레이션은 수십 ms에 끝납니다(반복 1회가 균등난수 2개와 이진 탐색 1회).
 * 즉시 그리면 화면이 한 번 깜빡일 뿐입니다. 200ms를 넘기는 실행 — 즉 F06-R2가 실제로
 * 보호하려는 상황 — 에서만 노출됩니다.
 */
export const PROGRESS_DELAY_MS = 200;

interface ProgressBarProps {
  progress: { done: number; total: number } | null;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!progress) {
      setVisible(false);
      return;
    }
    const id = setTimeout(() => setVisible(true), PROGRESS_DELAY_MS);
    return () => clearTimeout(id);
    // 진행률 값이 바뀔 때마다 타이머를 다시 걸면 영원히 뜨지 않는다.
    // 존재 여부만 의존한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress !== null]);

  if (!progress || !visible) return null;

  const ratio = progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <div className="mt-2">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-label="시뮬레이션 진행률"
      >
        {/* 채움은 `--color-accent`다 — 라이트에서 `brand-lit`(#7FB3E0)은 흰 배경 대비
            2.23:1이라 진행률 그래픽 기준 3:1을 못 넘긴다 (WCAG 1.4.11) */}
        <div
          className="h-full bg-accent"
          style={{ width: `${ratio * 100}%`, transition: 'width 120ms linear' }}
        />
      </div>
      <p className="mt-1 text-[12px] text-text-3 tabular-nums">
        {progress.done.toLocaleString('ko-KR')} / {progress.total.toLocaleString('ko-KR')}회
      </p>
    </div>
  );
}
