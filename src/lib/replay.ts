/**
 * 리플레이 파생 로직 (F09·F10)
 *
 * ## 이 파일에 규칙이 모여 있는 이유
 *
 * F09-R2는 카드의 사실을 **`matches.json`에서만** 렌더하라고 정합니다. 그런데 화면이
 * 필요로 하는 값(승/무/패, 득점 요약, 조별리그 집계)은 JSON에 **없는 값**입니다.
 * 이것들을 JSON에 적어 두면 스코어와 결과가 어긋날 수 있는 두 번째 사실이 생기므로,
 * **전부 스코어·이벤트에서 파생**시킵니다. 그러면 데이터가 바뀌어도 화면이 따라옵니다.
 *
 * 전부 순수 함수입니다 — 컴포넌트를 띄우지 않고 `tests/replay.test.ts`가 직접 검증합니다.
 *
 * ## 서술 규칙 (비하 금지)
 *
 * 이 파일이 만드는 문자열은 전부 **사실 진술**입니다. "아쉬운 실점"·"결정적 실수" 같은
 * 평가 어휘를 만들지 않고, 분(分)과 사건 종류만 적습니다 (대회요강 심사 제외 사유 방어).
 */

import type { Match, MatchEvent, Probabilities } from '@/types/data';

/** 경기 결과 — 확률 3결과(`Probabilities`)와 같은 어휘를 쓴다 */
export type Outcome = keyof Probabilities;

export interface Score {
  kor: number;
  opp: number;
}

/**
 * "2-1" → `{ kor: 2, opp: 1 }` (한국 기준 앞 — `Match.scoreline` 주석)
 *
 * 스키마(`/^\d+-\d+$/`)가 형식을 이미 강제하므로 여기서 형식 오류를 다시 다루지 않습니다.
 */
export function parseScore(scoreline: string): Score {
  const parts = scoreline.split('-');
  // `noUncheckedIndexedAccess`가 켜져 있어 인덱스 접근은 undefined를 포함한다.
  // 스키마가 형식을 보장하므로 실제로는 도달하지 않지만, 타입을 좁히는 비용이 0에 가깝다.
  return {
    kor: Number.parseInt(parts[0] ?? '0', 10),
    opp: Number.parseInt(parts[1] ?? '0', 10),
  };
}

/** 결과는 스코어에서 파생한다 — 데이터에 승패 필드를 두지 않는 이유(단일 사실) */
export function outcomeOf(match: Match): Outcome {
  const { kor, opp } = parseScore(match.scoreline);
  if (kor > opp) return 'win';
  if (kor < opp) return 'lose';
  return 'draw';
}

/** 화면 표기 — 색이 아니라 이 글자가 결과를 전달한다 (S2a는 결과색을 쓰지 않는다) */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  win: '승',
  draw: '무',
  lose: '패',
};

export interface GoalMark {
  minute: number;
  /** 한국 기준 서술 — 상대 득점은 "실점" */
  kind: '득점' | '실점';
}

/**
 * 득점 분 요약 (S2a 카드 3행)
 *
 * 시간순으로 둡니다. 체코전이 "59' 실점 · 67' 득점 · 80' 득점"으로 읽히면 역전이라는
 * 사실이 어휘 없이 순서만으로 전달됩니다 — 평가어를 쓰지 않고 서사를 만드는 방법입니다.
 */
export function goalMarks(match: Match): GoalMark[] {
  return match.events
    .filter((event) => event.type === 'goal')
    .slice()
    .sort((a, b) => a.minute - b.minute)
    .map((event) => ({ minute: event.minute, kind: event.team === 'kor' ? '득점' : '실점' }));
}

export function formatGoalMarks(marks: GoalMark[]): string {
  if (marks.length === 0) return '기록된 득점 없음';
  return marks.map((mark) => `${mark.minute}' ${mark.kind}`).join(' · ');
}

/**
 * 일자 병기 — "현지 6/11 · KST 6/12"
 *
 * 세 카드에 같은 형식을 적용합니다. 체코전만 병기하면(P11이 요구한 최소치) 카드가
 * 비대칭이 되고, 무엇보다 **전 경기 멕시코 개최**라는 P11의 정정이 화면에서 사라집니다.
 * 현지·KST가 다른 날짜라는 사실 자체가 "국내 개최가 아님"을 말합니다.
 */
export function formatDatePair(match: Match): string {
  return `현지 ${shortDate(match.dateLocal)} · KST ${shortDate(match.dateKst)}`;
}

function shortDate(iso: string): string {
  const parts = iso.split('-');
  return `${Number.parseInt(parts[1] ?? '0', 10)}/${Number.parseInt(parts[2] ?? '0', 10)}`;
}

export interface GroupSummary {
  played: number;
  win: number;
  draw: number;
  lose: number;
  /** 승 3 · 무 1 · 패 0 */
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** 골득실 */
  goalDiff: number;
}

/**
 * 조별리그 집계 — S2a 상단 맥락 한 줄의 수치 (기획서 3절 문제의식)
 *
 * 순위(조 3위 12팀 중 10위)와 진출선(8위)은 다른 조의 결과에 달린 값이라 우리 데이터에서
 * 파생되지 않습니다. 그 두 숫자만 P6 확정값 상수로 두고, 나머지는 전부 계산합니다.
 */
export function summarizeGroupStage(matches: Match[]): GroupSummary {
  const summary: GroupSummary = {
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
  };

  for (const match of matches) {
    const { kor, opp } = parseScore(match.scoreline);
    summary.played += 1;
    summary.goalsFor += kor;
    summary.goalsAgainst += opp;
    const outcome = outcomeOf(match);
    if (outcome === 'win') {
      summary.win += 1;
      summary.points += 3;
    } else if (outcome === 'draw') {
      summary.draw += 1;
      summary.points += 1;
    } else {
      summary.lose += 1;
    }
  }

  summary.goalDiff = summary.goalsFor - summary.goalsAgainst;
  return summary;
}

/**
 * P6 확정값 — 우리 3경기 데이터만으로는 계산할 수 없는 두 숫자
 *
 * 근거: 리서치 원장 P6(2026-07-22 채택 — "조 3위 7~9위권" 추정을 "최종 10위"로 정정).
 * 48개국 12개조에서 조 3위 12팀 중 상위 8팀이 32강에 오릅니다.
 */
export const THIRD_PLACE_RANK = 10;
export const THIRD_PLACE_CUTOFF = 8;

export type TimelineKind = '득점' | '실점' | '교체';

export interface TimelineEntry {
  minute: number;
  kind: TimelineKind;
  /** 가공명만 들어간다 — 실명 경로는 타입 수준에서 이미 닫혀 있다 (types/data.ts) */
  actors: string[];
  team: 'kor' | 'opp';
}

/**
 * 이벤트 타임라인 (S2b 텍스트 부분 — F10의 사실 서술 영역)
 *
 * ## 교체를 짝으로 묶는 이유
 *
 * `MatchEvent`에는 IN/OUT 구분이 없습니다(데이터 설계 §2.3 — "교체는 in/out 2행").
 * 같은 분·같은 팀의 `sub` 두 행 중 **어느 쪽이 들어온 선수인지 데이터가 말하지 않으므로**,
 * 방향을 추측해 "투입/교체아웃"으로 적으면 없는 사실을 만드는 것이 됩니다. P13이 남아공전
 * 65분 교체를 경고로 오분류한 전례가 정확히 이 지점이었습니다.
 *
 * → 두 행을 한 줄로 묶고 `↔`로 적습니다. 확정된 사실(같은 분에 두 선수가 교체됐다)만
 * 남고 미확정(방향)은 화면에 오르지 않습니다.
 */
export function timelineEntries(
  match: Match,
  resolveName: (playerId: string) => string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const usedSubs = new Set<MatchEvent>();

  const sorted = match.events.slice().sort((a, b) => a.minute - b.minute);

  for (const event of sorted) {
    if (event.type === 'goal') {
      entries.push({
        minute: event.minute,
        kind: event.team === 'kor' ? '득점' : '실점',
        actors: [resolveName(event.playerId)],
        team: event.team,
      });
      continue;
    }

    if (usedSubs.has(event)) continue;

    const partner = sorted.find(
      (candidate) =>
        candidate !== event &&
        candidate.type === 'sub' &&
        candidate.minute === event.minute &&
        candidate.team === event.team &&
        !usedSubs.has(candidate),
    );

    usedSubs.add(event);
    if (partner) usedSubs.add(partner);

    entries.push({
      minute: event.minute,
      kind: '교체',
      actors: partner
        ? [resolveName(event.playerId), resolveName(partner.playerId)]
        : [resolveName(event.playerId)],
      team: event.team,
    });
  }

  return entries.sort((a, b) => a.minute - b.minute);
}

/** "전종석 ↔ 현석범" · "선호석" — 교체 방향을 주장하지 않는 표기 */
export function formatActors(entry: TimelineEntry): string {
  return entry.actors.join(' ↔ ');
}
