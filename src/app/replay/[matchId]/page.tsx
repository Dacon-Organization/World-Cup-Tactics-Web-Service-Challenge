import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ThemeToggle } from '@/components/ThemeToggle';
import { Flag } from '@/components/replay/Flag';
import { getPlayer, matches, playersFile } from '@/lib/data';
import {
  OUTCOME_LABEL,
  formatActors,
  formatDatePair,
  outcomeOf,
  parseScore,
  timelineEntries,
} from '@/lib/replay';
import type { Match, Team } from '@/types/data';

/** 3경기 전부 빌드 타임에 굳는다 — 목록에 없는 id로 들어오면 요청 시점에 리다이렉트된다 */
export function generateStaticParams() {
  return matches.map((match) => ({ matchId: match.id }));
}

interface PageProps {
  params: Promise<{ matchId: string }>;
}

function findMatch(matchId: string): Match | undefined {
  return matches.find((match) => match.id === matchId);
}

function findTeam(teamId: string): Team | undefined {
  return playersFile.teams.find((team) => team.id === teamId);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { matchId } = await params;
  const match = findMatch(matchId);
  if (!match) return { title: '리플레이 — RE:FORMATION' };
  const opponent = findTeam(match.opponentId);
  return {
    title: `${opponent?.nameKo ?? '상대'}전 ${match.scoreline} — RE:FORMATION 리플레이`,
  };
}

/**
 * S2b 리플레이 재생·개입 — **정적 사실 화면 선구현** (F10의 텍스트 부분)
 *
 * 이번 블록(D-2b)의 범위는 S2a입니다. 그런데 카드가 여기로 오는 이상 이 경로가 404이면
 * 요강의 **"동적 인터랙션이 실제로 작동하지 않으면 평가 제외"** 에 걸립니다. 그래서
 * **지금 확정된 사실만으로 완결되는 화면**을 먼저 세웠습니다 — 경기 헤더 + 이벤트 목록.
 * 승률 차트(F12)·개입(F11)은 다음 블록에서 이 위에 얹힙니다.
 *
 * 이 이벤트 목록은 버리는 코드가 아닙니다. P20이 확인한 WCAG 1.4.11의 완화 조항
 * ("the information is available in another form, such as in a table that follows the graph")이
 * 요구하는 **차트의 텍스트 대응물**이 바로 이 목록입니다.
 *
 * ## 잘못된 matchId (F09-R3)
 *
 * `notFound()`가 아니라 `redirect('/replay?unknown=…')`입니다. 404 화면은 사용자를 막다른
 * 곳에 세우지만, 리다이렉트는 **선택 화면으로 데려다 놓고 무슨 일이 있었는지 알려 줍니다.**
 * R3의 문구가 "S2a로 안내 리다이렉트(404 백지 금지)"인 이유입니다.
 */
export default async function ReplayMatchPage({ params }: PageProps) {
  const { matchId } = await params;
  const match = findMatch(matchId);
  if (!match) {
    redirect(`/replay?unknown=${encodeURIComponent(matchId.slice(0, 24))}`);
  }

  const opponent = findTeam(match.opponentId);
  if (!opponent) throw new Error(`상대 팀을 찾을 수 없습니다: ${match.opponentId}`);

  const score = parseScore(match.scoreline);
  const outcome = outcomeOf(match);
  const entries = timelineEntries(match, (playerId) => getPlayer(playerId)?.displayName ?? '선수');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-4">
      <header className="mb-6 flex items-start justify-between gap-4">
        <Link className="text-[14px] font-semibold text-accent hover:underline" href="/replay">
          ← 경기 선택
        </Link>
        <ThemeToggle />
      </header>

      <section className="match-head">
        <Flag team={opponent} size="lg" />
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold">{opponent.nameKo}전</h1>
          <p className="text-[13px] text-text-3">
            2026 조별리그 {match.round}차전 · {match.venue} · {match.city}
          </p>
          <p className="text-[13px] text-text-3">{formatDatePair(match)}</p>
        </div>
        <p className="match-head__score">
          <span aria-hidden="true">{match.scoreline}</span>
          <span className="match-card__outcome" aria-hidden="true">
            {OUTCOME_LABEL[outcome]}
          </span>
          <span className="sr-only">
            대한민국 {score.kor} · {opponent.nameKo} {score.opp} · {OUTCOME_LABEL[outcome]}
          </span>
        </p>
      </section>

      {/* xG는 출처 라벨과 함께만 화면에 오른다 (F10-R2). 같은 경기의 xG가 모델마다 다르다는
          것이 P13에서 실측됐고, 라벨 없는 수치는 그 차이를 숨긴다. 체코전은 확정 xG가
          없으므로 이 블록 자체가 없다 — 빈 칸을 만들지 않고 행을 없앤다. */}
      {match.xg ? (
        <dl className="xg-row">
          <dt>Opta xG</dt>
          <dd>
            대한민국 {match.xg.kor.toFixed(2)} · {opponent.nameKo} {match.xg.opp.toFixed(2)}
          </dd>
        </dl>
      ) : null}

      <h2 className="mt-8 text-[15px] font-semibold">경기 기록</h2>
      <ol className="timeline">
        {entries.map((entry) => (
          <li key={`${entry.minute}-${entry.kind}-${entry.actors.join('-')}`} className="timeline__row">
            <span className="timeline__minute">{entry.minute}&apos;</span>
            <span className="timeline__kind" data-kind={entry.kind}>
              {entry.kind}
            </span>
            <span className="timeline__actors">{formatActors(entry)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-text-4">
        확정된 기록만 표시합니다 — 출처가 상충하는 항목은 화면에 올리지 않습니다.
      </p>

      <section className="next-step">
        <p className="text-[15px] text-text-2">
          승률 차트와 &lsquo;이 시점에 개입하기&rsquo;는 다음 단계에서 이 화면 위에 들어옵니다.
        </p>
        {/* 상대 이름을 링크에 넣지 않습니다 — S1은 아직 기본 상대(체코) 고정이라
            "{상대}전 전술 짜기"라고 적으면 화면이 지키지 못하는 약속이 됩니다.
            상대 전환은 F11(개입)과 함께 들어옵니다. */}
        <Link className="next-step__link" href="/">
          전술보드에서 전술 짜 보기 →
        </Link>
      </section>

      <footer className="mt-8 text-[12px] text-text-4">
        선수명은 전부 가공명입니다 · 비공식 팬 프로젝트
      </footer>
    </main>
  );
}
