'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * 리플레이 구간 오류 경계 (F09-R4)
 *
 * R4는 "경기 데이터 로드가 실패하면 카드 목록으로 복귀시키고 재시도 안내를 표시"를
 * 요구합니다. 우리 데이터는 빌드 타임에 Zod로 파싱되므로(`lib/data.ts`) **깨진 데이터가
 * 런타임까지 오는 경로는 이미 닫혀 있습니다.** 그래도 이 경계를 두는 이유는, R4가 막으려는
 * 것이 특정 실패 원인이 아니라 **사용자가 백지를 보는 상태**이기 때문입니다. 원인이
 * 무엇이든(청크 로드 실패·렌더 예외) 여기서 잡혀 목록으로 돌아갈 길이 남습니다.
 *
 * `error.tsx`는 Client Component여야 합니다(Next.js 규약) — 이 파일이 이 구간에서
 * 유일한 클라이언트 코드입니다.
 */
export default function ReplayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 침묵 실패 금지 (구현규약 §6) — 화면은 조용히 복구하되 로그에는 남긴다
    console.error('[replay] 화면 렌더 실패', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-8">
      <h1 className="text-[22px] font-bold">경기 정보를 불러오지 못했습니다</h1>
      <p className="mt-2 text-[15px] text-text-2">
        잠시 후 다시 시도하거나, 경기 선택 화면에서 다른 경기를 골라 주세요.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="next-step__link" onClick={reset}>
          다시 시도
        </button>
        <Link className="next-step__link" href="/replay">
          경기 선택으로
        </Link>
      </div>
    </main>
  );
}
