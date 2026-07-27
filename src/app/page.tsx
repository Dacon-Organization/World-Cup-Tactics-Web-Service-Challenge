import { TacticsBoard } from '@/components/tactics/TacticsBoard';
import { defaults, getMatch, playersFile } from '@/lib/data';

/**
 * S1 전술보드 (F01·F02·F03·F04·F08)
 *
 * **Server Component입니다** (구현규약 §2 — `page.tsx`는 전부 Server).
 * 헤더·고지문·`<noscript>`는 서버가 그리므로 클라이언트 예외가 이것들을 지울 수 없습니다.
 *
 * 조작 영역만 `TacticsBoard`(Client)로 내리되, Next.js가 그것도 첫 요청에서 서버 렌더하므로
 * **초기 HTML에 피치·토큰·슬라이더·확률이 전부 들어 있습니다** — F08-R1(첫 페인트에 확률)과
 * F08-R5(JS 실패 시 정적 화면)를 같은 구조로 만족시킵니다.
 *
 * F08-R6(공유 URL 상태 우선)은 F13(B7) 범위라 아직 `searchParams`를 읽지 않습니다.
 */
export default function Home() {
  const match = getMatch(defaults.opponentMatchId);
  const opponent = playersFile.teams.find((team) => team.id === match.opponentId);
  const opponentName = opponent?.nameKo ?? '상대';

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-semibold tracking-wide text-brand-lit">RE:FORMATION</p>
        <h1 className="text-[22px] font-bold">같은 {opponentName}전, 다른 전술</h1>
        <p className="text-[15px] text-text-2">
          선수를 옮기고 슬라이더를 움직여 보세요. 예측은 브라우저 안에서만 계산됩니다.
        </p>
      </header>

      <noscript>
        <p className="rounded-lg border border-warn/50 bg-surface p-3 text-[15px] text-text-2">
          이 브라우저에서 JavaScript가 꺼져 있어 전술을 바꿀 수 없습니다. 화면의 배치와
          확률은 기본 전술 기준으로 계산된 값입니다.
        </p>
      </noscript>

      <TacticsBoard opponentMatchId={defaults.opponentMatchId} opponentName={opponentName} />

      <footer className="mt-auto pt-4 text-xs text-text-4">
        선수명은 전부 가공명입니다 · 비공식 팬 프로젝트
      </footer>
    </main>
  );
}
