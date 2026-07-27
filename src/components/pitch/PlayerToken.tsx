'use client';

import { POSITION_LABEL, toFramePercent, type PitchOrientation } from '@/lib/tactics/geometry';
import type { Player, Position, PositionCode, PositionRole } from '@/types/data';
import { PlayerInfoCard } from './PlayerInfoCard';

export type TokenState = 'idle' | 'dragging' | 'selected';

interface PlayerTokenProps {
  index: number;
  player: Player;
  /** 슬롯이 요구하는 역할 — 색상 링은 **자리의 역할**을 나타낸다 */
  slotRole: PositionRole;
  /** 슬롯의 세부 포지션 — 토큰에 찍히는 약어 */
  slotCode: PositionCode;
  position: Position;
  orientation: PitchOrientation;
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
 *
 * ## 라벨이 이름 첫 글자에서 포지션 약어로 바뀐 이유
 *
 * 가공명 성 1음절은 26명 중 성이 겹치면 **같은 글자가 둘** 뜹니다. 등번호는 ADR-005가
 * 금지하므로(등번호+포지션 조합 = 연상 리스크), 슬롯에 붙는 세부 포지션 약어를 씁니다 —
 * 좌우 접두사 덕에 한 포메이션 안에서 11개가 전부 고유합니다.
 *
 * ## 위치를 래퍼가 갖는 이유
 *
 * 정보 카드가 토큰을 기준으로 떠야 하는데, 토큰 자신이 `absolute`이면 카드를 형제로 둘
 * 자리가 없습니다. 래퍼가 좌표를 갖고 토큰·카드는 그 안에서 상대 배치합니다.
 *
 * ## 좌표를 `left`/`top`이 아니라 `--nx`/`--ny`로 넘기는 이유
 *
 * 정규화 좌표만 넘기고 **화면 축 배정은 CSS 미디어쿼리에 맡깁니다.** 인라인 `left`를 쓰면
 * 미디어쿼리가 이기지 못해 방향을 JS 상태로 들어야 하고, 그러면 서버가 방향을 모르는 탓에
 * 데스크톱 첫 페인트가 세로로 나왔다가 가로로 튑니다.
 */
export function PlayerToken({
  index,
  player,
  slotRole,
  slotCode,
  position,
  orientation,
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
  const { left, top } = toFramePercent(position, orientation);
  const infoId = `token-info-${index}`;

  // 프레임 밖으로 카드가 나가지 않게 여는 방향을 좌표로 정한다.
  // 프레임 백분율 기준이라 세로·가로 어느 쪽이든 같은 식이 성립한다.
  // 임계값 35/65는 카드 최대 폭(176px)이 가장 좁은 프레임(375px 뷰포트에서 249px)에서도
  // 잘리지 않는 값입니다 — 카드 반폭 88px ÷ 249px ≈ 35%.
  const placement = top > 50 ? 'above' : 'below';
  const align = left < 35 ? 'start' : left > 65 ? 'end' : 'center';

  return (
    <div
      className="token-slot"
      data-state={state}
      style={
        {
          '--nx': position.x,
          '--ny': position.y,
          // 드래그 중에는 전환을 끈다 — 손가락보다 토큰이 늦게 따라오면 "들려 있음"이 깨진다
          transition: dragging ? 'none' : 'left 120ms var(--ease-snap), top 120ms var(--ease-snap)',
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        // `player-token` 클래스가 touch-action·user-select를 **정적으로** 선언한다.
        // 드래그 시작 시 JS로 바꾸는 설계는 작동하지 않는다 (P19 Q2).
        className={[
          'player-token',
          ROLE_RING[slotRole],
          dragging ? 'scale-110 shadow-lg shadow-black/50' : '',
          selected ? 'scale-110 ring-2 ring-focus ring-offset-2 ring-offset-bg' : '',
          // 피치 위에 그려지므로 브랜드색이 아니라 피치 강조색을 쓴다 (라이트 피치는 밝다)
          snapping ? 'outline-2 outline-offset-2 outline-[var(--color-pitch-accent)]' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-state={state}
        data-index={index}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`${player.displayName} · ${POSITION_LABEL[slotCode]}`}
        aria-describedby={selected ? `${infoId} token-keyboard-help` : infoId}
        onPointerDown={(event) => onPointerDown(index, event)}
        onPointerMove={(event) => onPointerMove(index, event)}
        onPointerUp={(event) => onPointerUp(index, event)}
        onPointerCancel={(event) => onPointerCancel(index, event)}
        onClick={(event) => onActivate(index, event)}
        onKeyDown={(event) => onKeyDown(index, event)}
      >
        <span aria-hidden="true">{slotCode}</span>
      </button>

      <PlayerInfoCard
        id={infoId}
        player={player}
        code={slotCode}
        placement={placement}
        align={align}
      />
    </div>
  );
}
