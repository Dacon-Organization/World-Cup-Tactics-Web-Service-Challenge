/**
 * 리플레이 파생 로직 테스트 (F09·F10)
 *
 * 여기서 지키려는 것은 두 가지입니다.
 * ① **P11·P13 확정 사실과 화면 표기의 1:1** — F09 수용 기준이 "3카드의 결과·개최지가
 *    P11 확정표와 1:1 일치"이므로, 확정표를 테스트 안에 적어 두고 데이터와 대조합니다.
 *    데이터를 나중에 누가 고치면 이 테스트가 먼저 깨집니다.
 * ② **없는 사실을 만들지 않음** — 교체 방향(IN/OUT)은 데이터에 없으므로 문자열에도
 *    없어야 합니다 (P13이 실제로 오분류했던 지점).
 */

import { describe, expect, it } from 'vitest';
import {
  OUTCOME_LABEL,
  THIRD_PLACE_CUTOFF,
  THIRD_PLACE_RANK,
  formatActors,
  formatDatePair,
  formatGoalMarks,
  goalMarks,
  outcomeOf,
  parseScore,
  summarizeGroupStage,
  timelineEntries,
} from '@/lib/replay';
import { getPlayer, matches } from '@/lib/data';
import type { MatchId } from '@/types/data';

/** P11·P13 확정표 — findings/P11·P13 및 F09 §4 표를 그대로 옮긴 것 */
const CONFIRMED: Record<MatchId, { scoreline: string; outcome: string; venue: string; city: string }> =
  {
    cze: { scoreline: '2-1', outcome: '승', venue: 'Estadio Akron', city: '과달라하라' },
    mex: { scoreline: '0-1', outcome: '패', venue: 'Estadio Akron', city: '과달라하라' },
    rsa: { scoreline: '0-1', outcome: '패', venue: 'Estadio BBVA', city: '몬테레이' },
  };

const resolveName = (playerId: string): string => getPlayer(playerId)?.displayName ?? playerId;

/** `noUncheckedIndexedAccess` 아래에서 "없으면 테스트 실패"를 한 줄로 만드는 헬퍼 */
function matchOf(id: MatchId) {
  const match = matches.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`테스트 전제 위반 — ${id} 경기가 데이터에 없습니다`);
  return match;
}

describe('확정 사실 대조 (F09 수용 기준)', () => {
  it('3경기의 스코어·결과·개최지가 P11 확정표와 1:1 일치한다', () => {
    expect(matches).toHaveLength(3);
    for (const match of matches) {
      const confirmed = CONFIRMED[match.id];
      expect(match.scoreline).toBe(confirmed.scoreline);
      expect(OUTCOME_LABEL[outcomeOf(match)]).toBe(confirmed.outcome);
      expect(match.venue).toBe(confirmed.venue);
      expect(match.city).toBe(confirmed.city);
    }
  });

  it('세 경기 모두 멕시코 도시에서 열렸다 — 국내 개최 암시 0건 (P11 정정)', () => {
    const cities = new Set(matches.map((match) => match.city));
    expect([...cities].sort()).toEqual(['과달라하라', '몬테레이']);
  });

  it('경고 이벤트가 데이터에 존재하지 않는다 (F10-R3 — P13 미확정 차단)', () => {
    const types = new Set(matches.flatMap((match) => match.events.map((event) => event.type)));
    expect([...types].sort()).toEqual(['goal', 'sub']);
  });

  it('모든 이벤트의 playerId가 실재 선수를 가리킨다 (참조 무결성)', () => {
    for (const match of matches) {
      for (const event of match.events) {
        expect(getPlayer(event.playerId), `${match.id} ${event.minute}'`).toBeDefined();
      }
    }
  });
});

describe('스코어 파생', () => {
  it('한국 기준 앞으로 파싱한다', () => {
    expect(parseScore('2-1')).toEqual({ kor: 2, opp: 1 });
    expect(parseScore('0-1')).toEqual({ kor: 0, opp: 1 });
  });

  it('무승부도 파생한다 — 우리 3경기에는 없지만 규칙은 존재해야 한다', () => {
    expect(outcomeOf({ ...matchOf('cze'), scoreline: '1-1' })).toBe('draw');
  });
});

describe('득점 분 요약 (S2a 카드)', () => {
  it('체코전은 실점 → 득점 → 득점 순서로 읽힌다', () => {
    expect(formatGoalMarks(goalMarks(matchOf('cze')))).toBe("59' 실점 · 67' 득점 · 80' 득점");
  });

  it('상대 득점은 "실점"으로 뒤집어 서술한다 (한국 기준 화면)', () => {
    expect(formatGoalMarks(goalMarks(matchOf('rsa')))).toBe("63' 실점");
  });

  it('요약 문자열에 평가 어휘가 섞이지 않는다 (비하 금지)', () => {
    const 금지어 = ['아쉬', '실수', '부진', '무기력', '졸전', '치명적'];
    for (const match of matches) {
      const text = formatGoalMarks(goalMarks(match));
      for (const word of 금지어) expect(text).not.toContain(word);
    }
  });
});

describe('일자 병기', () => {
  it('현지·KST를 함께 적는다 (P11)', () => {
    expect(formatDatePair(matchOf('cze'))).toBe('현지 6/11 · KST 6/12');
  });

  it('세 경기 전부 현지와 KST 날짜가 다르다 — 병기가 형식이 아니라 사실이다', () => {
    for (const match of matches) {
      expect(match.dateLocal).not.toBe(match.dateKst);
    }
  });
});

describe('조별리그 집계 (S2a 맥락 한 줄)', () => {
  it('P6 확정값(1승 2패 · 승점 3 · 골득실 −1 · 득점 2)을 재현한다', () => {
    const summary = summarizeGroupStage(matches);
    expect(summary).toMatchObject({
      played: 3,
      win: 1,
      draw: 0,
      lose: 2,
      points: 3,
      goalsFor: 2,
      goalsAgainst: 3,
      goalDiff: -1,
    });
  });

  it('순위·진출선은 계산이 아니라 P6 상수다', () => {
    expect(THIRD_PLACE_RANK).toBe(10);
    expect(THIRD_PLACE_CUTOFF).toBe(8);
  });
});

describe('타임라인 (S2b · F10)', () => {
  it('남아공전 65분 교체 2행이 한 줄로 묶인다', () => {
    const entries = timelineEntries(matchOf('rsa'), resolveName);
    const subs = entries.filter((entry) => entry.kind === '교체');
    expect(subs).toHaveLength(1);
    const sub = subs[0]!;
    expect(sub.minute).toBe(65);
    expect(sub.actors).toHaveLength(2);
    expect(formatActors(sub)).toBe('전종석 ↔ 현석범');
  });

  it('교체 표기가 방향(투입/아웃)을 주장하지 않는다 — 데이터에 없는 사실', () => {
    for (const match of matches) {
      for (const entry of timelineEntries(match, resolveName)) {
        if (entry.kind !== '교체') continue;
        const text = `${entry.kind} ${formatActors(entry)}`;
        expect(text).not.toMatch(/투입|아웃|IN|OUT/);
      }
    }
  });

  it('분 순서로 정렬된다', () => {
    for (const match of matches) {
      const minutes = timelineEntries(match, resolveName).map((entry) => entry.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    }
  });

  it('표시 이벤트 수가 확정 이벤트 수와 맞는다 (추가·누락 0) — 교체 2행은 1줄로 센다', () => {
    for (const match of matches) {
      const goals = match.events.filter((event) => event.type === 'goal').length;
      const subs = match.events.filter((event) => event.type === 'sub').length;
      expect(timelineEntries(match, resolveName)).toHaveLength(goals + Math.ceil(subs / 2));
    }
  });

  it('가공명만 노출한다 — 이벤트 문자열에 원본 ID가 남지 않는다', () => {
    for (const match of matches) {
      for (const entry of timelineEntries(match, resolveName)) {
        expect(formatActors(entry)).not.toMatch(/(kor|cze|mex|rsa)-\d{2}/);
      }
    }
  });
});
