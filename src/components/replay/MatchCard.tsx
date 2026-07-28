import Link from 'next/link';

import { Flag } from '@/components/replay/Flag';
import {
  OUTCOME_LABEL,
  formatDatePair,
  formatGoalMarks,
  goalMarks,
  outcomeOf,
  parseScore,
} from '@/lib/replay';
import type { Match, Team } from '@/types/data';

interface MatchCardProps {
  match: Match;
  opponent: Team;
}

/**
 * 경기 카드 (F09 · DESIGN.md §4 인벤토리 `MatchCard`)
 *
 * ## 결과색을 쓰지 않는다
 *
 * 한국 결과는 1승 2패입니다. 스코어를 `--win`·`--lose`로 칠하면 **한 화면에 결과색이
 * 세 개**(승 1 · 패 2) 뜹니다. D-1 재설계가 확률 배열을 f12 원본 부호화로 되돌리면서
 * 회복한 규약이 "한 화면에 결과색 하나"였고, 그 회복이 결과 3색 ↔ 포지션 4색 충돌을
 * 팔레트 변경 없이 없앤 근거였습니다. 화면마다 예외를 만들기 시작하면 그 근거가 흐려집니다.
 *
 * → 승/패는 **글자**가 전달합니다(무채색 배지). 색맹 대응이 덤으로 따라오고,
 * DESIGN.md §1.4의 "색만으로 의미를 전달하는 표면 0개"도 그대로 지켜집니다.
 *
 * ## 카드 전체가 눌리는데 링크는 제목 하나인 이유
 *
 * 카드 전체를 `<a>`로 감싸면 국기·스코어·개최지·일자가 전부 링크 이름에 들어가
 * 스크린리더가 한 문장으로 길게 읽습니다(Inclusive Components — P20). 제목만 링크로 두고
 * `::after`를 카드 전면에 절대배치하면, 눈으로는 카드 전체가 눌리고 링크 이름은 "체코전"
 * 하나로 남습니다.
 */
export function MatchCard({ match, opponent }: MatchCardProps) {
  const outcome = outcomeOf(match);
  const score = parseScore(match.scoreline);
  const goals = formatGoalMarks(goalMarks(match));

  return (
    <li className="match-card">
      <div className="match-card__head">
        <Flag team={opponent} />
        <h3 className="match-card__title">
          <Link className="match-card__link" href={`/replay/${match.id}`}>
            {opponent.nameKo}전
          </Link>
        </h3>
        <span className="match-card__round">{match.round}차전</span>
      </div>

      <p className="match-card__score">
        <span aria-hidden="true">{match.scoreline}</span>
        <span className="match-card__outcome" aria-hidden="true">
          {OUTCOME_LABEL[outcome]}
        </span>
        {/* "2-1"은 스크린리더에서 "이 빼기 일"로 읽힌다 — 사람이 말하는 순서로 따로 준다 */}
        <span className="sr-only">
          대한민국 {score.kor} · {opponent.nameKo} {score.opp} · {OUTCOME_LABEL[outcome]}
        </span>
      </p>

      <p className="match-card__goals">{goals}</p>

      <dl className="match-card__meta">
        <dt className="sr-only">개최지</dt>
        <dd>
          {match.venue} · {match.city}
        </dd>
        <dt className="sr-only">일자</dt>
        <dd>{formatDatePair(match)}</dd>
      </dl>
    </li>
  );
}
