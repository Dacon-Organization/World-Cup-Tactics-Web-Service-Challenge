/**
 * 정적 JSON 로드 + 파싱 (빌드 타임)
 *
 * import 시점에 Zod 파싱을 끝내므로, 데이터가 깨져 있으면 **빌드가 실패**합니다.
 * 런타임에 사용자가 깨진 데이터를 만나는 경로가 없습니다.
 */

import defaultsJson from '@/data/defaults.json';
import formationsJson from '@/data/formations.json';
import matchesJson from '@/data/matches.json';
import playersJson from '@/data/players.json';
import {
  defaultsFileSchema,
  formationsFileSchema,
  matchesFileSchema,
  playersFileSchema,
} from '@/lib/schema';
import type {
  Defaults,
  Formation,
  FormationId,
  Match,
  MatchId,
  MatchesFile,
  Player,
  PlayersFile,
} from '@/types/data';

export const playersFile: PlayersFile = playersFileSchema.parse(playersJson);
export const formations: Formation[] = formationsFileSchema.parse(formationsJson);
export const matches: MatchesFile = matchesFileSchema.parse(matchesJson);
export const defaults: Defaults = defaultsFileSchema.parse(defaultsJson);

const playerById = new Map(playersFile.players.map((player) => [player.id, player]));
const formationById = new Map(formations.map((formation) => [formation.id, formation]));
const matchById = new Map(matches.map((match) => [match.id, match]));

export function getPlayer(id: string): Player | undefined {
  return playerById.get(id);
}

export function getFormation(id: FormationId): Formation {
  const formation = formationById.get(id);
  // 참조 무결성은 G2가 빌드 전에 보장한다. 여기 도달하면 게이트가 뚫린 것이므로
  // 조용히 기본값으로 넘어가지 않고 드러낸다 (구현규약 §6 — 침묵 실패 금지).
  if (!formation) {
    throw new Error(`알 수 없는 포메이션 ID: ${id}`);
  }
  return formation;
}

export function getMatch(id: MatchId): Match {
  const match = matchById.get(id);
  if (!match) {
    throw new Error(`알 수 없는 경기 ID: ${id}`);
  }
  return match;
}

/** 한국 선수만 — 전술보드 토큰 후보 (F01) */
export const koreaSquad: Player[] = playersFile.players.filter(
  (player) => player.teamId === 'kor',
);
