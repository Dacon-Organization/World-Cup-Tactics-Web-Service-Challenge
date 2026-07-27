/**
 * 정적 JSON의 런타임 스키마 (Zod)
 *
 * 타입(`src/types/data.ts`)은 컴파일 타임에만 존재합니다. JSON은 외부 경계이므로
 * `as` 캐스팅으로 통과시키지 않고 스키마로 좁힙니다 (구현규약 §6).
 *
 * 이 파일은 게이트 G2(`scripts/gates/refs.ts`)와 앱(`src/lib/data.ts`)이 **같은
 * 정의를 공유**합니다 — 두 곳에 따로 쓰면 어긋난 쪽이 조용히 통과합니다.
 */

import { z } from 'zod';

/** 정규화 좌표 — 0~1 밖으로 나가면 피치 밖에 선수가 그려진다 */
const normalized = z.number().min(0).max(1);

export const teamIdSchema = z.enum(['kor', 'cze', 'mex', 'rsa']);
export const positionRoleSchema = z.enum(['GK', 'DF', 'MF', 'FW']);
export const formationIdSchema = z.enum(['f433', 'f442', 'f343', 'f352']);
export const matchIdSchema = z.enum(['cze', 'mex', 'rsa']);

export const teamSchema = z.object({
  id: teamIdSchema,
  nameKo: z.string().min(1),
  flagCode: z.string().regex(/^[a-z]{2}$/, 'flag-icons 코드는 소문자 2자리'),
});

export const playerSchema = z.object({
  // 등번호가 아닌 일련번호 — 등번호+포지션 조합은 실존 선수를 연상시킨다 (ADR-005)
  id: z.string().regex(/^(kor|cze|mex|rsa)-\d{2}$/),
  teamId: teamIdSchema,
  displayName: z.string().min(1),
  position: positionRoleSchema,
  profile: z.object({
    attack: z.number().int().min(0).max(100),
    defense: z.number().int().min(0).max(100),
    stamina: z.number().int().min(0).max(100),
    speed: z.number().int().min(0).max(100),
  }),
});

export const playersFileSchema = z.object({
  teams: z.array(teamSchema).min(1),
  players: z.array(playerSchema).min(1),
});

export const positionSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(10),
  x: normalized,
  y: normalized,
  role: positionRoleSchema,
});

export const formationSchema = z.object({
  id: formationIdSchema,
  label: z.string().min(1),
  // 길이 11 고정 — 프리셋이 10명이나 12명이 되는 상태를 아예 만들지 않는다
  slots: z.array(positionSlotSchema).length(11),
});

export const formationsFileSchema = z.array(formationSchema).min(1);

export const matchEventSchema = z.object({
  // 90분 + 추가시간을 허용하되 상한을 둔다
  minute: z.number().int().min(0).max(120),
  type: z.enum(['goal', 'sub']),
  team: z.enum(['kor', 'opp']),
  playerId: z.string().min(1),
});

export const winProbPointSchema = z.object({
  minute: z.number().int().min(0).max(120),
  winProb: normalized,
});

export const matchSchema = z.object({
  id: matchIdSchema,
  opponentId: teamIdSchema,
  round: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  venue: z.string().min(1),
  dateLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scoreline: z.string().regex(/^\d+-\d+$/, '한국 기준 앞'),
  // 출처 라벨이 선택이 아니라 필수인 이유: 같은 경기의 xG가 모델마다 다르다는 것이
  // P13에서 실측됐다. 라벨 없는 xG는 화면에 올리지 않는다.
  xg: z
    .object({ kor: z.number().min(0), opp: z.number().min(0), source: z.literal('Opta') })
    .optional(),
  events: z.array(matchEventSchema),
  winProbTimeline: z.array(winProbPointSchema),
});

export const matchesFileSchema = z.array(matchSchema).min(1);

export const slidersSchema = z.object({
  lineHeight: z.number().int().min(0).max(100),
  pressing: z.number().int().min(0).max(100),
  width: z.number().int().min(0).max(100),
  tempo: z.number().int().min(0).max(100),
});

export const defaultsFileSchema = z.object({
  formationId: z.literal('f433'),
  sliders: slidersSchema,
  opponentMatchId: matchIdSchema,
  // B3에서 채운다. 그전까지 null 이지만 "없어도 되는 값"은 아니다 —
  // B3 완료 후에도 null 이면 F08(첫 페인트에 확률)이 깨지므로 G2가 경고한다.
  precomputed: z
    .object({ win: normalized, draw: normalized, lose: normalized })
    .nullable(),
});
