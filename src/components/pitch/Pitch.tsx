'use client';

import { PITCH_VIEWBOX, type PitchOrientation } from '@/lib/tactics/geometry';
import type { PreviewGeometry, PreviewTier } from '@/lib/tactics/preview';
import type { Player, Position, PositionSlot } from '@/types/data';
import { PitchMarkings } from './PitchMarkings';
import { PlayerToken, type TokenState } from './PlayerToken';
import { TacticsPreview } from './TacticsPreview';

interface PitchProps {
  frameRef: React.RefObject<HTMLDivElement | null>;
  positions: Position[];
  slots: PositionSlot[];
  squad: Player[];
  /** 모바일 세로 · 데스크톱 가로 — 정규화 좌표는 둘이 같다 */
  orientation: PitchOrientation;
  preview: PreviewGeometry;
  previewTier: PreviewTier;
  /** 드래그 중인 토큰 (없으면 null) */
  draggingIndex: number | null;
  selectedIndex: number | null;
  snapTargetIndex: number | null;
  /** 드래그 시작 지점의 잔상 — F02-R1 고스트 */
  ghost: Position | null;
  disabled: boolean;
  onTokenPointerDown(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onTokenPointerMove(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onTokenPointerUp(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onTokenPointerCancel(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onTokenActivate(index: number, event: React.MouseEvent<HTMLButtonElement>): void;
  onTokenKeyDown(index: number, event: React.KeyboardEvent<HTMLButtonElement>): void;
  onSurfaceClick(event: React.MouseEvent<HTMLDivElement>): void;
}

/**
 * 전술보드 피치 (F01)
 *
 * ## 토큰이 SVG가 아니라 HTML인 이유
 *
 * ① 터치 타겟 ≥44px를 뷰포트 크기와 무관하게 보장할 수 있습니다 — SVG 안에서는 viewBox
 *    스케일에 묶여 좁은 화면에서 44px가 깨집니다.
 * ② `touch-action: none`을 토큰에만 정확히 걸 수 있습니다 (P19 — 피치·페이지에 걸면 확대가
 *    죽어 WCAG 1.4.4 위반).
 * ③ **SVG 렌더가 실패해도 토큰이 남습니다** (F01-R5) — 프레임 배경·경계는 CSS이고
 *    마킹만 SVG이므로, 최악의 경우에도 "경계가 있는 사각형 위의 11개 토큰"이 유지됩니다.
 *
 * ## 레터박스를 만들지 않는다
 *
 * 프레임에 `aspect-ratio`(= viewBox 비율)를 걸고 SVG가 프레임을 꽉 채우므로
 * `preserveAspectRatio` 여백이 생기지 않습니다. 그래서 포인터 → 정규화 변환이
 * `getBoundingClientRect()` 하나로 정확합니다 (P19 `[미확인 유지]` 해소).
 */
export function Pitch({
  frameRef,
  positions,
  slots,
  squad,
  orientation,
  preview,
  previewTier,
  draggingIndex,
  selectedIndex,
  snapTargetIndex,
  ghost,
  disabled,
  onTokenPointerDown,
  onTokenPointerMove,
  onTokenPointerUp,
  onTokenPointerCancel,
  onTokenActivate,
  onTokenKeyDown,
  onSurfaceClick,
}: PitchProps) {
  const snapSlot = snapTargetIndex === null ? null : slots[snapTargetIndex];

  return (
    <div
      ref={frameRef}
      className="pitch-frame"
      onClick={onSurfaceClick}
      role="application"
      aria-label="전술보드 피치 — 선수 토큰을 끌거나 선택해 배치를 바꿉니다"
    >
      {/*
        viewBox는 **항상 세로형**입니다. 가로 전환은 CSS가 이 `<svg>` 상자를 눕혀서
        처리하므로(globals.css `.pitch-frame > svg`), 마킹·프리뷰·스냅 표시를 방향별로
        두 벌 그리지 않습니다. 페널티 박스를 고치면 양쪽에 그대로 반영됩니다.

        서버가 방향을 몰라도 되는 것이 이 구조의 요점입니다 — 방향을 JS 상태로 들면
        데스크톱 첫 페인트가 세로로 나왔다가 튑니다.
      */}
      <svg
        className="pointer-events-none absolute"
        viewBox={`0 0 ${PITCH_VIEWBOX.width} ${PITCH_VIEWBOX.height}`}
        // 상자와 종횡비가 같으므로 레터박스가 생기지 않는다
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <PitchMarkings />
        <TacticsPreview geometry={preview} tier={previewTier} />

        {/* 드롭 예정 슬롯 — 좌표 근접 판정 결과 (pointerenter 는 캡처 중 죽는다, P19 C3) */}
        {snapSlot && (
          <circle
            cx={snapSlot.x * PITCH_VIEWBOX.width}
            cy={(1 - snapSlot.y) * PITCH_VIEWBOX.height}
            r={6}
            fill="none"
            stroke="var(--color-pitch-accent)"
            strokeWidth={1.4}
            strokeDasharray="3 2"
          />
        )}
      </svg>

      {/* 드래그 원위치 잔상 (F02-R1 고스트) — 좌표는 CSS가 방향에 맞춰 푼다 */}
      {ghost && (
        <span
          className="token-ghost"
          style={{ '--nx': ghost.x, '--ny': ghost.y } as React.CSSProperties}
          aria-hidden="true"
        />
      )}

      {positions.map((position, index) => {
        const player = squad[index];
        const slot = slots[index];
        if (!player || !slot) return null;
        const state: TokenState =
          draggingIndex === index ? 'dragging' : selectedIndex === index ? 'selected' : 'idle';
        return (
          <PlayerToken
            key={player.id}
            index={index}
            player={player}
            slotRole={slot.role}
            slotCode={slot.code}
            position={position}
            orientation={orientation}
            state={state}
            disabled={disabled}
            snapping={draggingIndex === index && snapTargetIndex !== null}
            onPointerDown={onTokenPointerDown}
            onPointerMove={onTokenPointerMove}
            onPointerUp={onTokenPointerUp}
            onPointerCancel={onTokenPointerCancel}
            onActivate={onTokenActivate}
            onKeyDown={onTokenKeyDown}
          />
        );
      })}
    </div>
  );
}
