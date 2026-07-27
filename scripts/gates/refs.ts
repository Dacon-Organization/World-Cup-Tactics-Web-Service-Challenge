/**
 * G2 `gate:refs` — 스키마 검증 + 참조 무결성
 *
 * 근거: [데이터 설계 §3](../../docs/planning/data/version1.0/데이터_설계_v1_0.md)
 *
 * 이 서비스에는 DB가 없으므로 **외래 키 제약이 없습니다.** 존재하지 않는
 * `playerId`를 이벤트가 가리켜도 아무도 막아 주지 않고, 화면에서 빈 이름으로
 * 터집니다. 그 역할을 이 스크립트가 대신합니다.
 *
 * 스키마 정의는 앱과 공유합니다(`src/lib/schema.ts`) — 두 곳에 따로 쓰면
 * 어긋난 쪽이 조용히 통과합니다.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  defaultsFileSchema,
  formationsFileSchema,
  matchesFileSchema,
  playersFileSchema,
} from '../../src/lib/schema.ts';
import { ROOT, bad, note, ok, type GateResult } from './util.ts';

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

export function gateRefs(): GateResult {
  const lines: string[] = [];
  const problems: string[] = [];

  // --- 스키마 -------------------------------------------------------------
  const players = playersFileSchema.safeParse(readJson('src/data/players.json'));
  const formations = formationsFileSchema.safeParse(readJson('src/data/formations.json'));
  const matches = matchesFileSchema.safeParse(readJson('src/data/matches.json'));
  const defaults = defaultsFileSchema.safeParse(readJson('src/data/defaults.json'));

  const parsed = [
    ['players.json', players] as const,
    ['formations.json', formations] as const,
    ['matches.json', matches] as const,
    ['defaults.json', defaults] as const,
  ];
  for (const [name, result] of parsed) {
    if (result.success) {
      lines.push(ok(`${name} 스키마 통과`));
    } else {
      problems.push(`${name} 스키마 위반`);
      for (const issue of result.error.issues.slice(0, 8)) {
        lines.push(bad(`${name} · ${issue.path.join('.')} — ${issue.message}`));
      }
    }
  }

  if (!players.success || !formations.success || !matches.success || !defaults.success) {
    return { name: 'G2 gate:refs', passed: false, lines };
  }

  // --- 참조 무결성 ---------------------------------------------------------
  const teamIds = new Set(players.data.teams.map((team) => team.id));
  const playerIds = new Set(players.data.players.map((player) => player.id));
  const formationIds = new Set(formations.data.map((formation) => formation.id));
  const matchIds = new Set(matches.data.map((match) => match.id));

  for (const player of players.data.players) {
    if (!teamIds.has(player.teamId)) {
      problems.push(`선수 ${player.id} 의 teamId '${player.teamId}' 가 teams 에 없음`);
    }
  }

  for (const match of matches.data) {
    if (!teamIds.has(match.opponentId)) {
      problems.push(`경기 ${match.id} 의 opponentId '${match.opponentId}' 가 teams 에 없음`);
    }
    for (const event of match.events) {
      if (!playerIds.has(event.playerId)) {
        problems.push(`경기 ${match.id} ${event.minute}' 이벤트의 playerId '${event.playerId}' 실존하지 않음`);
      }
    }
  }

  for (const formation of formations.data) {
    const indices = formation.slots.map((slot) => slot.slotIndex).sort((a, b) => a - b);
    const expected = Array.from({ length: 11 }, (_, i) => i);
    if (indices.join(',') !== expected.join(',')) {
      problems.push(`포메이션 ${formation.id} 의 slotIndex 가 0~10 유일하지 않음`);
    }
    const goalkeepers = formation.slots.filter((slot) => slot.role === 'GK');
    if (goalkeepers.length !== 1) {
      problems.push(`포메이션 ${formation.id} 의 GK 슬롯이 ${goalkeepers.length}개 (1개여야 함)`);
    }
  }

  if (!formationIds.has(defaults.data.formationId)) {
    problems.push(`defaults.formationId '${defaults.data.formationId}' 가 formations 에 없음`);
  }
  if (!matchIds.has(defaults.data.opponentMatchId)) {
    problems.push(`defaults.opponentMatchId '${defaults.data.opponentMatchId}' 가 matches 에 없음`);
  }

  // 포지션 열거값 정합 — 선수와 슬롯이 같은 어휘를 쓰는지 (데이터 설계 §2.1·2.2)
  const slotRoles = new Set(formations.data.flatMap((f) => f.slots.map((slot) => slot.role)));
  const playerPositions = new Set(players.data.players.map((player) => player.position));
  for (const position of playerPositions) {
    if (!slotRoles.has(position)) {
      problems.push(`선수 포지션 '${position}' 에 대응하는 슬롯 role 이 어떤 프리셋에도 없음`);
    }
  }

  if (problems.length === 0) {
    lines.push(
      ok(
        `참조 무결성 통과 — 선수 ${playerIds.size}명 · 프리셋 ${formationIds.size}종 · 경기 ${matchIds.size}건`,
      ),
    );
  } else {
    for (const problem of problems) lines.push(bad(problem));
  }

  // --- 미완 항목 (실패가 아니라 안내) ---------------------------------------
  if (defaults.data.precomputed === null) {
    lines.push(note('defaults.precomputed 가 아직 null — B3(기준선 모델)에서 채웁니다.'));
  }
  const emptyTimelines = matches.data.filter((match) => match.winProbTimeline.length === 0);
  if (emptyTimelines.length > 0) {
    lines.push(
      note(`winProbTimeline 이 빈 경기 ${emptyTimelines.length}건 — B6(빌드타임 사전계산)에서 채웁니다.`),
    );
  }

  return { name: 'G2 gate:refs', passed: problems.length === 0, lines };
}

if (import.meta.filename === process.argv[1]) {
  const { report } = await import('./util.ts');
  process.exit(report(gateRefs()) ? 0 : 1);
}
