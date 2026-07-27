/**
 * 정적 데이터 타입 — 데이터 설계 v1.0 §2 이식본
 *
 * 이 파일은 `docs/planning/data/version1.0/데이터_설계_v1_0.md` §2의 TS 시그니처를
 * **그대로 옮긴 것**입니다. 임의로 필드를 늘리거나 이름을 바꾸지 않습니다.
 * 스펙을 바꿔야 한다면 문서를 먼저 고치는 것이 아니라 변경 노트에 적고
 * B8의 v1.1 일괄 버전업에서 반영합니다 (전역 §7.1 작업 중 버전업 금지).
 *
 * **실명 필드가 없는 것이 이 파일의 핵심 안전장치입니다.** `Player`에는
 * `displayName`(완전 가공명) 하나뿐이고 실명을 담을 자리가 없으므로,
 * 타입 수준에서 P7(퍼블리시티권) 위반 경로가 닫힙니다.
 *
 * 런타임 검증(Zod)은 `src/lib/schema.ts`에 있습니다 — 타입은 컴파일 타임에만
 * 존재하므로, JSON이라는 외부 경계는 스키마로 한 번 더 좁힙니다 (구현규약 §6).
 */

/* ---------------------------------------------------------------------------
 * §2.1 players.json
 * ------------------------------------------------------------------------- */

export type TeamId = 'kor' | 'cze' | 'mex' | 'rsa';

/** 포지션 역할 — 선수와 슬롯이 같은 열거값을 공유한다 (G2 정합 검사 대상) */
export type PositionRole = 'GK' | 'DF' | 'MF' | 'FW';

export interface Team {
  id: TeamId;
  /** "대한민국" 등 국가명 — 국가명 표기는 허용 (P7) */
  nameKo: string;
  /** flag-icons 코드 (MIT) */
  flagCode: string;
}

export interface Player {
  /** "kor-01" ~ — 등번호가 아닌 일련번호 (연상 차단, ADR-005) */
  id: string;
  teamId: TeamId;
  /** 완전 가공명 — 생성·검증 규칙은 가공명_체계_v1_0.md */
  displayName: string;
  position: PositionRole;
  profile: {
    /** 0~100 — 다출처 대조로 직접 구성한 프로파일 (단일 소스 복제 아님, P10) */
    attack: number;
    defense: number;
    stamina: number;
    speed: number;
  };
}

export interface PlayersFile {
  teams: Team[];
  /** 한국 26명 + 상대 3팀은 이벤트 관련 선수만 [설계 결정] */
  players: Player[];
}

/* ---------------------------------------------------------------------------
 * §2.2 formations.json
 * ------------------------------------------------------------------------- */

export type FormationId = 'f433' | 'f442' | 'f343' | 'f352';

export interface PositionSlot {
  /** 0(GK) ~ 10 */
  slotIndex: number;
  /** 0~1 정규화 (좌 → 우) */
  x: number;
  /** 0~1 정규화 (자기 진영 → 상대 진영) */
  y: number;
  role: PositionRole;
}

export interface Formation {
  /** ADR-003 확정 4종 */
  id: FormationId;
  /** "4-3-3" */
  label: string;
  /** 항상 길이 11 */
  slots: PositionSlot[];
}

export type FormationsFile = Formation[];

/* ---------------------------------------------------------------------------
 * §2.3 matches.json
 * ------------------------------------------------------------------------- */

export type MatchId = 'cze' | 'mex' | 'rsa';

export interface MatchEvent {
  /** P11·P13 확정 분만. 확정 안 된 이벤트는 행이 없다 (F10-R3) */
  minute: number;
  /** 경고(card)는 P13 확정 전까지 타입 자체를 정의하지 않음 */
  type: 'goal' | 'sub';
  team: 'kor' | 'opp';
  /** Player.id (가공명 참조) — 교체는 in/out 2행 [설계 결정] */
  playerId: string;
}

export interface WinProbPoint {
  minute: number;
  /** 0~1, 빌드 타임 사전 계산 (F12) */
  winProb: number;
}

export interface Match {
  id: MatchId;
  opponentId: TeamId;
  round: 1 | 2 | 3;
  /** P11 확정: Estadio Akron(cze·mex) / Estadio BBVA(rsa) */
  venue: string;
  /** 현지 일자 — 체코전은 현지 6/11 · KST 6/12 병기 (P11·P13) */
  dateLocal: string;
  dateKst: string;
  /** "2-1" (한국 기준 앞) */
  scoreline: string;
  /** 출처 라벨 필수 — 모델마다 값이 다르다는 것이 P13에서 실측됐다 (P11·P13) */
  xg?: { kor: number; opp: number; source: 'Opta' };
  events: MatchEvent[];
  /** B6에서 빌드타임 사전계산으로 채운다. B2 시점에는 빈 배열 */
  winProbTimeline: WinProbPoint[];
}

export type MatchesFile = Match[];

/* ---------------------------------------------------------------------------
 * §2.4 defaults.json
 * ------------------------------------------------------------------------- */

export type SliderKey = 'lineHeight' | 'pressing' | 'width' | 'tempo';

/** 4종 슬라이더 0~100. 50이 중앙값이고 이때 조정 계층은 항등이다 (구현규약 §5) */
export type Sliders = Record<SliderKey, number>;

export interface Defaults {
  /** ADR-004 */
  formationId: 'f433';
  sliders: Sliders;
  /** 기본 상대 = 체코 (가공명_체계 §5.2에서 게이트 해소) */
  opponentMatchId: MatchId;
  /**
   * 빌드 타임 산출 (F08-R1) — 첫 페인트에 이미 확률이 있게 하는 값.
   * B3에서 기준선 모델 산출물로 채운다. B2 시점에는 null.
   */
  precomputed: { win: number; draw: number; lose: number } | null;
}

/* ---------------------------------------------------------------------------
 * 파생 타입 — 스토어·조정 계층이 공유한다 (구현규약 §3·§5)
 * ------------------------------------------------------------------------- */

/** 피치 위 정규화 좌표. PositionSlot의 x·y와 같은 좌표계 */
export interface Position {
  x: number;
  y: number;
}

export interface Probabilities {
  win: number;
  draw: number;
  lose: number;
}
