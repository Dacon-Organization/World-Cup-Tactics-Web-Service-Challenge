import type { Metadata } from 'next';
import Link from 'next/link';

import { ThemeToggle } from '@/components/ThemeToggle';
import { MatchCard } from '@/components/replay/MatchCard';
import { matches, playersFile } from '@/lib/data';
import { THIRD_PLACE_CUTOFF, THIRD_PLACE_RANK, summarizeGroupStage } from '@/lib/replay';

export const metadata: Metadata = {
  title: '이 경기, 당신이라면? — RE:FORMATION 리플레이',
  description:
    '2026 월드컵 조별리그 한국 3경기. 그날의 전술을 다시 짜고 확률이 어떻게 달라지는지 봅니다.',
};

/**
 * S2a 리플레이 경기 선택 (F09)
 *
 * **Server Component입니다** (구현규약 §2). 이 화면에는 상태가 없습니다 — 확정된 사실
 * 3건을 읽어 카드로 그리고 링크로 넘기는 것이 전부이므로, 클라이언트 JS 없이 완성됩니다.
 * JS가 죽어도 카드와 링크가 그대로 작동합니다.
 *
 * ## 진입 카피를 제목 자리에 둔 이유
 *
 * 화면흐름 v1.0은 "카드 하단에 진입 카피"로 적었지만, 그러면 이 화면에 `h1`이 없어집니다.
 * 스크린리더의 문서 개요가 비고, 검색·공유 미리보기의 제목도 사무적인 문자열이 됩니다.
 * **문구는 확정된 그대로 두고 위치만 올렸습니다** — 카피 자체가 이 화면이 무엇을 묻는지
 * 말하므로 제목으로서 정확합니다 (변경 노트 누적: vNEXT).
 *
 * ## 맥락 한 줄의 수치가 하드코딩이 아닌 이유
 *
 * 승점·골득실·득점은 `matches.json`의 스코어에서 계산합니다(`summarizeGroupStage`).
 * 데이터와 어긋날 수 있는 두 번째 사실을 만들지 않기 위해서입니다 (F09-R2와 같은 원칙).
 * 다른 조의 결과에 달린 순위·진출선만 P6 확정 상수입니다.
 */
interface ReplayIndexProps {
  /** `?unknown=xyz` — 잘못된 matchId에서 리다이렉트돼 온 경우에만 존재한다 (F09-R3) */
  searchParams: Promise<{ unknown?: string }>;
}

export default async function ReplayIndex({ searchParams }: ReplayIndexProps) {
  const { unknown } = await searchParams;
  const teamById = new Map(playersFile.teams.map((team) => [team.id, team]));
  const ordered = [...matches].sort((a, b) => a.round - b.round);
  const summary = summarizeGroupStage(matches);

  return (
    <main className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-4">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-bold tracking-wide">
            <span className="text-text">RE:</span>
            <span className="text-accent">FORMATION</span>
          </p>
          <h1 className="truncate text-[22px] font-bold">이 경기, 당신이라면?</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link className="text-[14px] font-semibold text-accent hover:underline" href="/">
            전술보드
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/*
        맥락 한 줄 — 기획서 3절(문제의식)과 이 화면을 잇는다.
        평가어 없이 수치만 적는다: "아쉽게"·"무기력하게" 같은 수식은 특정 인물의 판단을
        규정하는 방향으로 미끄러지기 쉽고, 요강의 심사 제외 사유와 맞닿는다.
      */}
      <p className="mb-6 text-[13px] text-text-3">
        2026 조별리그 3경기 · {summary.win}승 {summary.lose}패 · 승점 {summary.points} · 골득실{' '}
        {summary.goalDiff > 0 ? '+' : '−'}
        {Math.abs(summary.goalDiff)} · 조 3위 12팀 중 {THIRD_PLACE_RANK}위 ({THIRD_PLACE_CUTOFF}
        위까지 32강)
      </p>

      {/*
        F09-R3의 "안내" — 리다이렉트만 하면 사용자는 자기가 왜 목록에 있는지 모릅니다.
        입력값을 그대로 되쓰지 않고 24자로 잘라 텍스트 노드로만 넣습니다(React가 이스케이프).
      */}
      {unknown ? (
        <p
          role="status"
          className="mb-6 rounded-lg border border-warn/50 bg-surface p-3 text-[14px] text-text-2"
        >
          <b className="text-text">{unknown}</b> 경기는 없습니다. 아래 세 경기 중에서 골라
          주세요.
        </p>
      ) : null}

      <ul className="match-grid">
        {ordered.map((match) => {
          const opponent = teamById.get(match.opponentId);
          // 참조 무결성은 G2가 빌드 전에 보장한다. 여기 도달하면 게이트가 뚫린 것이므로
          // 조용히 넘어가지 않는다 (구현규약 §6 — 침묵 실패 금지).
          if (!opponent) throw new Error(`상대 팀을 찾을 수 없습니다: ${match.opponentId}`);
          return <MatchCard key={match.id} match={match} opponent={opponent} />;
        })}
      </ul>

      <footer className="mt-8 text-[12px] text-text-4">
        선수명은 전부 가공명입니다 · 비공식 팬 프로젝트 · 국기 아이콘 flag-icons (MIT)
      </footer>
    </main>
  );
}
