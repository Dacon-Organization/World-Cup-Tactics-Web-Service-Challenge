/**
 * 피치 기하 · 좌표 변환 · 드롭 판정 — 전부 순수 함수
 *
 * 근거: [DESIGN.md §3.3](../../../DESIGN.md) 피치 비율 · [F01 impl §4](../../../docs/planning/impl/version1.0/F01_전술보드_피치_impl.md)
 * · [F02 impl §4.2](../../../docs/planning/impl/version1.0/F02_선수_드래그앤드롭_impl.md)
 *
 * 여기에 DOM을 들이지 않는 이유: 드롭 판정·스냅·키보드 이동은 **회귀가 가장 잘 나는
 * 곳인데 실기기로만 확인하면 비싸기 때문**입니다. 순수 함수로 잘라 두면 단위 테스트가
 * 잡습니다 (구현규약 §7 — E2E 대신 순수 함수 커버리지).
 */

import type { PositionCode, PositionRole, PositionSlot, Player, Position } from '@/types/data';

/**
 * SVG `viewBox` — 세로형. DESIGN.md §3.2의 `가로 × 1.5` 종횡비를 그대로 옮긴 값이라
 * 컨테이너 `aspect-ratio`와 일치시키면 `preserveAspectRatio` 레터박싱이 생기지 않는다.
 */
export const PITCH_VIEWBOX = { width: 100, height: 150 } as const;

/**
 * 피치 방향 — `vertical`(모바일 기준) · `horizontal`(데스크톱)
 *
 * ## 정규화 좌표는 방향과 무관하다
 *
 * `x`는 항상 **팀 기준 좌→우**, `y`는 항상 **자기 진영(0) → 상대 진영(1)** 입니다.
 * 방향이 바꾸는 것은 *화면 매핑뿐*이라 스냅·드롭·조정 계층·예측 엔진은 방향을
 * 알 필요가 없습니다. 이 분리를 깨고 방향별 좌표를 두면 두 벌을 영원히 맞춰야 합니다.
 *
 * ```
 * vertical    left = x       top = 1 - y
 * horizontal  left = y       top = x        (시계방향 90° — 자기 골대 왼쪽)
 * ```
 *
 * 가로에서 팀의 왼쪽 측면(x 작음)이 화면 위로 가는 것은 축구 중계 화면의 관례와 같습니다.
 */
export type PitchOrientation = 'vertical' | 'horizontal';

/**
 * 가로 전환 임계 — **CSS `globals.css`의 미디어쿼리와 같은 값이어야 합니다.**
 *
 * 화면 매핑(프레임 종횡비·토큰 좌표·SVG 회전)은 전부 CSS가 합니다. 서버가 방향을 모르는
 * 채로 내보낸 HTML이 데스크톱에서도 처음부터 가로로 그려지고, 하이드레이션 깜빡임이
 * 없으며, JS가 죽어도 배치가 맞습니다 (F08-R5).
 *
 * JS가 방향을 알아야 하는 곳은 **조작 계산 세 군데뿐**입니다 — 포인터 역변환,
 * 방향키 축, 정보 카드가 열리는 쪽. 셋 다 마운트 이후에만 실행되므로 `matchMedia`를
 * 이펙트에서 읽어도 늦지 않습니다.
 */
export const PITCH_HORIZONTAL_MQ = '(min-width: 1024px)';

/**
 * 정규화 좌표 → 프레임 백분율
 *
 * **렌더에는 쓰지 않습니다** — 토큰·고스트의 좌표는 CSS 사용자 정의 속성(`--nx`/`--ny`)과
 * 미디어쿼리가 계산합니다. 이 함수는 정보 카드가 프레임 밖으로 나가지 않게 여는 쪽을
 * 고를 때처럼 **JS가 화면상 위치를 알아야 하는 경우**에만 씁니다.
 */
export function toFramePercent(
  position: Position,
  orientation: PitchOrientation,
): { left: number; top: number } {
  if (orientation === 'horizontal') {
    return { left: position.y * 100, top: position.x * 100 };
  }
  return { left: position.x * 100, top: (1 - position.y) * 100 };
}

/** DESIGN.md §3.3 비율을 viewBox 단위로 환산한 값 */
export const PITCH_GEOMETRY = {
  /** stroke 1.1 의 절반만큼 안쪽 — 터치라인이 잘리지 않게 */
  touchline: { x: 0.55, y: 0.55, width: 98.9, height: 148.9 },
  halfwayY: PITCH_VIEWBOX.height / 2,
  centerCircle: {
    cx: PITCH_VIEWBOX.width / 2,
    cy: PITCH_VIEWBOX.height / 2,
    r: Math.min(PITCH_VIEWBOX.width, PITCH_VIEWBOX.height) * 0.11,
  },
  penaltyBox: {
    x: PITCH_VIEWBOX.width * 0.22,
    width: PITCH_VIEWBOX.width * 0.56,
    height: PITCH_VIEWBOX.height * 0.13,
  },
  goalBox: {
    x: PITCH_VIEWBOX.width * 0.36,
    width: PITCH_VIEWBOX.width * 0.28,
    height: PITCH_VIEWBOX.height * 0.055,
  },
  lineWidth: 1.1,
  lineOpacity: 0.55,
} as const;

/** 스냅 판정 반경 — 피치 **높이** 단위 (F02 impl §4.2) `[설계 결정]` */
export const SNAP_RADIUS = 0.08;
/** 다른 토큰이 이만큼 안에 있으면 그 슬롯은 스냅 후보에서 뺀다 — 겹쳐 쌓임 방지 */
export const OCCUPIED_EPS = 0.02;
/** 방향키 1회 이동 = 피치 2% (F03 §3 `[설계 결정]`) */
export const KEYBOARD_STEP = 0.02;

export function clampPosition(position: Position): Position {
  return {
    x: Math.min(1, Math.max(0, position.x)),
    y: Math.min(1, Math.max(0, position.y)),
  };
}

/** 정규화 좌표가 피치 안인가 — 클램프 **전**에 판정해야 F02-R5(밖 드롭)가 성립한다 */
export function isInsidePitch(position: Position): boolean {
  return position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1;
}

/**
 * 포인터 클라이언트 좌표 → 정규화 좌표 (클램프 없음)
 *
 * 세로에서 y가 뒤집히는 이유: 정규화 y는 **자기 진영(0) → 상대 진영(1)** 인데 화면은
 * 위가 상대 진영입니다 (데이터 설계 §2.2).
 *
 * 가로는 `toFramePercent`의 정확한 역변환입니다 — 둘이 어긋나면 잡은 곳과 다른 곳에
 * 토큰이 놓입니다.
 */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  orientation: PitchOrientation = 'vertical',
): Position {
  const fx = (clientX - rect.left) / rect.width;
  const fy = (clientY - rect.top) / rect.height;
  if (orientation === 'horizontal') {
    return { x: fy, y: fx };
  }
  return { x: fx, y: 1 - fy };
}

/** 정규화 좌표 → SVG viewBox 좌표 */
export function toViewBox(position: Position): { x: number; y: number } {
  return {
    x: position.x * PITCH_VIEWBOX.width,
    y: (1 - position.y) * PITCH_VIEWBOX.height,
  };
}

/**
 * 피치 **높이 단위** 거리
 *
 * 정규화 거리를 그대로 쓰면 피치가 2:3이라 가로 1%와 세로 1%의 체감 거리가 1.5배
 * 차이납니다. 스냅이 가로로만 헐거워지는 것을 막습니다.
 */
export function pitchDistance(a: Position, b: Position): number {
  const dx = (a.x - b.x) * (PITCH_VIEWBOX.width / PITCH_VIEWBOX.height);
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * 스냅 후보 슬롯 — 좌표 근접 판정
 *
 * **`pointerenter`로 만들지 않는 이유**: 포인터 캡처 중에는 `pointerover`/`enter`/
 * `leave`/`out`이 발화하지 않습니다 (P19 C3). 캡처는 드래그에 필수이므로 하이라이트는
 * 좌표로만 판정합니다.
 */
export function nearestSlot(
  point: Position,
  slots: readonly PositionSlot[],
  positions: readonly Position[],
  selfIndex: number,
  excludeSlotIndex: number | null = null,
): number | null {
  let best: number | null = null;
  let bestDistance = SNAP_RADIUS;

  for (let i = 0; i < slots.length; i += 1) {
    if (i === excludeSlotIndex) continue;
    const slot = slots[i];
    if (!slot) continue;
    const target = { x: slot.x, y: slot.y };

    // 다른 토큰이 이미 그 자리에 있으면 후보가 아니다 — 스냅으로 두 명이 겹치면
    // 배치 파생 지표는 멀쩡한데 화면에서는 한 명이 사라진 것처럼 보인다
    const occupied = positions.some(
      (position, index) => index !== selfIndex && pitchDistance(position, target) < OCCUPIED_EPS,
    );
    if (occupied) continue;

    const distance = pitchDistance(point, target);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * 드롭 결과 좌표 — F02(드래그)·F03(클릭-클릭·Enter)이 **공유**한다
 *
 * `null`은 "이동하지 않는다"입니다 (F02-R5 피치 밖 드롭). 자유 배치도 허용하므로
 * 스냅 대상이 없다고 해서 `null`이 아닙니다.
 *
 * `excludeSlotIndex` — 스냅 후보에서 뺄 슬롯. **키보드 경로에서만** 씁니다(자기 홈 슬롯).
 * 이유: 방향키는 1회 2%인데 스냅 반경은 8%라, 홈 슬롯을 후보로 두면 3번까지 누른 이동이
 * 전부 제자리로 끌려와 **아무 일도 일어나지 않습니다.** 드래그는 손가락이 크게 움직이므로
 * 홈 슬롯 자석이 "잘못 건드린 드래그를 되돌리는" 이득이 크지만, 키보드는 의도적인
 * 이산 명령이라 되돌리는 쪽이 손해입니다 (B4 브라우저 실측에서 발견).
 */
export function resolveDrop(
  point: Position,
  slots: readonly PositionSlot[],
  positions: readonly Position[],
  selfIndex: number,
  excludeSlotIndex: number | null = null,
): Position | null {
  if (!isInsidePitch(point)) return null;
  const index = nearestSlot(point, slots, positions, selfIndex, excludeSlotIndex);
  const slot = index === null ? undefined : slots[index];
  return slot ? { x: slot.x, y: slot.y } : point;
}

/**
 * 방향키 1회 이동 (F03-R6 경계 정지)
 *
 * 지원하지 않는 키는 `null` — 호출부가 `preventDefault`를 걸지 말지 판단합니다.
 * 선택 모드가 아닐 때 스크롤을 가로채면 접근성 퇴행입니다.
 *
 * **방향키는 화면 기준입니다.** 가로 피치에서 `↑`가 여전히 `y+`(전진)이면 토큰이 오른쪽으로
 * 가면서 위 화살표를 누르게 되어 조작이 즉시 무너집니다. 그래서 방향에 따라 축을 바꿉니다 —
 * 값의 의미(`y`=전진)는 그대로고 어떤 키가 그 축을 미는지만 달라집니다.
 */
export function applyKeyboardStep(
  position: Position,
  key: string,
  orientation: PitchOrientation = 'vertical',
): Position | null {
  if (orientation === 'horizontal') {
    switch (key) {
      // 가로에서는 오른쪽이 상대 진영, 화면 위가 팀의 왼쪽 측면(x 감소)
      case 'ArrowRight':
        return clampPosition({ ...position, y: position.y + KEYBOARD_STEP });
      case 'ArrowLeft':
        return clampPosition({ ...position, y: position.y - KEYBOARD_STEP });
      case 'ArrowUp':
        return clampPosition({ ...position, x: position.x - KEYBOARD_STEP });
      case 'ArrowDown':
        return clampPosition({ ...position, x: position.x + KEYBOARD_STEP });
      default:
        return null;
    }
  }

  switch (key) {
    case 'ArrowUp':
      return clampPosition({ ...position, y: position.y + KEYBOARD_STEP });
    case 'ArrowDown':
      return clampPosition({ ...position, y: position.y - KEYBOARD_STEP });
    case 'ArrowLeft':
      return clampPosition({ ...position, x: position.x - KEYBOARD_STEP });
    case 'ArrowRight':
      return clampPosition({ ...position, x: position.x + KEYBOARD_STEP });
    default:
      return null;
  }
}

/**
 * 슬롯 ↔ 선수 배정
 *
 * 역할이 맞는 선수를 슬롯 순서대로 먼저 채우고, 모자라면 남은 선수로 채웁니다.
 * 역할이 어긋난 배정은 숨기지 않고 **조정 계층의 적합도 페널티로 값에 반영**됩니다
 * (피처_정의서 §4.4) — 화면에서 조용히 예쁘게 맞추면 모델과 화면이 다른 말을 합니다.
 */
export function assignSquad(
  slots: readonly PositionSlot[],
  squad: readonly Player[],
): Player[] {
  if (squad.length < slots.length) {
    throw new Error(`선수가 부족합니다: 슬롯 ${slots.length}개, 선수 ${squad.length}명`);
  }
  const used = new Set<string>();
  const assigned: (Player | null)[] = slots.map((slot) => {
    const match = squad.find((player) => player.position === slot.role && !used.has(player.id));
    if (!match) return null;
    used.add(match.id);
    return match;
  });

  return assigned.map((player) => {
    if (player) return player;
    const filler = squad.find((candidate) => !used.has(candidate.id));
    // slots.length ≤ squad.length 를 위에서 보장했으므로 여기는 도달하지 않는다
    if (!filler) throw new Error('배정할 선수가 남지 않았습니다');
    used.add(filler.id);
    return filler;
  });
}

/** 스크린리더·툴팁용 포지션 한글 라벨 — 포지션이 색 단독으로만 전달되지 않게 (DESIGN.md §1.4) */
export const ROLE_LABEL: Record<PositionRole, string> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
};

/**
 * 세부 포지션 한글명 — 토큰의 약어를 소리 내어 읽는 값
 *
 * 약어만 두면 스크린리더가 "엘씨비"로 읽습니다. 축구 약어를 모르는 심사자에게도
 * 정보 카드에서 이 한글명이 보입니다.
 */
export const POSITION_LABEL: Record<PositionCode, string> = {
  GK: '골키퍼',
  LB: '왼쪽 풀백',
  LCB: '왼쪽 센터백',
  CB: '센터백',
  RCB: '오른쪽 센터백',
  RB: '오른쪽 풀백',
  LWB: '왼쪽 윙백',
  RWB: '오른쪽 윙백',
  DM: '수비형 미드필더',
  LCM: '왼쪽 중앙 미드필더',
  RCM: '오른쪽 중앙 미드필더',
  LM: '왼쪽 미드필더',
  RM: '오른쪽 미드필더',
  LW: '왼쪽 윙어',
  RW: '오른쪽 윙어',
  LST: '왼쪽 스트라이커',
  ST: '스트라이커',
  RST: '오른쪽 스트라이커',
};
