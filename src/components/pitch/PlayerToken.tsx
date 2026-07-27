'use client';

import { ROLE_LABEL, tokenLabel } from '@/lib/tactics/geometry';
import type { Player, Position, PositionRole } from '@/types/data';

export type TokenState = 'idle' | 'dragging' | 'selected';

interface PlayerTokenProps {
  index: number;
  player: Player;
  /** 슬롯이 요구하는 역할 — 색상 링은 **자리의 역할**을 나타낸다 */
  slotRole: PositionRole;
  position: Position;
  state: TokenState;
  /** 프리셋 전환 애니메이션 중 (F01-R2) — 드래그·선택 시작을 막는다 */
  disabled: boolean;
  /** 드롭하면 스냅될 슬롯이 근처에 있는가 (F02-R2 하이라이트) */
  snapping: boolean;
  onPointerDown(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onPointerMove(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onPointerUp(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onPointerCancel(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onActivate(index: number, event: React.MouseEvent<HTMLButtonElement>): void;
  onKeyDown(index: number, event: React.KeyboardEvent<HTMLButtonElement>): void;
}

/**
 * 포지션 색상 링 — DESIGN.md §1.4
 *
 * 결과 3색과 값이 같은 것은 오류가 아니라 제출된 상태입니다. 색을 바꾸는 대신
 * **형태로 분리**합니다 — 선수 토큰은 원, 확률 표시는 막대/모난 사각.
 */
const ROLE_RING: Record<PositionRole, string> = {
  GK: 'border-pos-gk',
  DF: 'border-pos-df',
  MF: 'border-pos-mf',
  FW: 'border-pos-fw',
};

/**
 * 선수 토큰 — F01(표시) · F02(드래그) · F03(클릭-클릭·키보드)이 **한 컴포넌트**를 공유
 *
 * ## `<button>`인 이유
 *
 * Tab 순회·Space·Enter·`aria-pressed`가 표준으로 따라옵니다. `div` + `tabIndex`로 만들면
 * 그 의미를 전부 직접 재구현해야 하고, 재구현한 것은 대개 어딘가 빠집니다 (F03 impl §2).
 *
 * ## 포인터 계열만 다루는 이유
 *
 * 포인터 이벤트를 지원하는 브라우저도 하위 호환용 **마우스 이벤트를 함께 발화**합니다.
 * 둘 다 달면 같은 조작이 두 번 처리됩니다 (P19). `onClick`은 F03의 "탭"이라 별개 경로이고,
 * 드래그 종료와 겹치지 않게 호출부가 억제합니다.
 */
export function PlayerToken({
  index,
  player,
  slotRole,
  position,
  state,
  disabled,
  snapping,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onActivate,
  onKeyDown,
}: PlayerTokenProps) {
  const selected = state === 'selected';
  const dragging = state === 'dragging';

  return (
    <button
      type="button"
      // `player-token` 클래스가 touch-action·user-select를 **정적으로** 선언한다.
      // 드래그 시작 시 JS로 바꾸는 설계는 작동하지 않는다 (P19 Q2).
      className={[
        'player-token',
        ROLE_RING[slotRole],
        dragging ? 'z-30 scale-110 shadow-lg shadow-black/50' : 'z-10',
        selected ? 'z-20 scale-110 ring-2 ring-focus ring-offset-2 ring-offset-bg' : '',
        snapping ? 'outline-2 outline-offset-2 outline-brand-lit' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: `${position.x * 100}%`,
        top: `${(1 - position.y) * 100}%`,
        // 드래그 중에는 전환을 끈다 — 손가락보다 토큰이 늦게 따라오면 "들려 있음"이 깨진다
        transition: dragging ? 'none' : 'left 120ms var(--ease-snap), top 120ms var(--ease-snap)',
      }}
      data-state={state}
      data-index={index}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${player.displayName} · ${ROLE_LABEL[slotRole]}`}
      aria-describedby={selected ? 'token-keyboard-help' : undefined}
      title={`${player.displayName} (${ROLE_LABEL[slotRole]})`}
      onPointerDown={(event) => onPointerDown(index, event)}
      onPointerMove={(event) => onPointerMove(index, event)}
      onPointerUp={(event) => onPointerUp(index, event)}
      onPointerCancel={(event) => onPointerCancel(index, event)}
      onClick={(event) => onActivate(index, event)}
      onKeyDown={(event) => onKeyDown(index, event)}
    >
      <span aria-hidden="true">{tokenLabel(player.displayName)}</span>
    </button>
  );
}
