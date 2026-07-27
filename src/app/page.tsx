import { ThemeToggle } from '@/components/ThemeToggle';
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
 *
 * ## 헤더를 한 줄로 줄인 이유 (디자인 재설계 블록)
 *
 * 헤더가 106px(예산 52px의 2배)이었고, 그만큼 피치와 확률이 아래로 밀렸습니다. 설명문
 * ("선수를 옮기고 슬라이더를 움직여 보세요")은 피치 아래 조작 안내와 내용이 겹치므로
 * 헤더에서 뺍니다 — 같은 말을 두 번 하면서 세로를 쓸 이유가 없습니다.
 */
export default function Home() {
  const match = getMatch(defaults.opponentMatchId);
  const opponent = playersFile.teams.find((team) => team.id === match.opponentId);
  const opponentName = opponent?.nameKo ?? '상대';

  return (
    /* 폭 상한을 1024px → 1280px로 넓혔습니다. 전 값은 1280px 화면에서 좌우 121px씩을
       버리면서 정작 피치는 269px이라, 좁게 잡은 폭이 쏠림을 키우고 있었습니다. */
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          {/* f00 표지의 2색 워드마크 — "RE:"는 본문색, "FORMATION"은 강조색.
              동결 그림에 이미 있는 형태라 새로 만든 것이 아닙니다.
              `brand-lit`을 직접 쓰지 않는 이유: 라이트 배경에서 1.97:1이라 읽히지 않습니다.
              다크에서는 `--color-accent`가 곧 `brand-lit`이라 f00과 같은 색으로 나옵니다. */}
          <p className="text-[13px] font-bold tracking-wide">
            <span className="text-text">RE:</span>
            <span className="text-accent">FORMATION</span>
          </p>
          <h1 className="truncate text-[22px] font-bold">같은 {opponentName}전, 다른 전술</h1>
        </div>
        <ThemeToggle />
      </header>

      <noscript>
        <p className="mb-4 rounded-lg border border-warn/50 bg-surface p-3 text-[15px] text-text-2">
          이 브라우저에서 JavaScript가 꺼져 있어 전술을 바꿀 수 없습니다. 화면의 배치와
          확률은 기본 전술 기준으로 계산된 값입니다.
        </p>
      </noscript>

      <TacticsBoard opponentMatchId={defaults.opponentMatchId} opponentName={opponentName} />

      <footer className="mt-6 text-[12px] text-text-4">
        선수명은 전부 가공명입니다 · 비공식 팬 프로젝트
      </footer>
    </main>
  );
}
