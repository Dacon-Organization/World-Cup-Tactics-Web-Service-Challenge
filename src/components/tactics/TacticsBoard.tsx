'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pitch } from '@/components/pitch/Pitch';
import { ProbabilityBar } from '@/components/prediction/ProbabilityBar';
import { FormationPicker } from '@/components/tactics/FormationPicker';
import { SliderSheet } from '@/components/tactics/SliderSheet';
import { formations, getFormation, koreaSquad } from '@/lib/data';
import { adjust, placementZ, sliderZ } from '@/lib/tactics/adjust';
import { adjustConstants, getMatchContext } from '@/lib/tactics/constants';
import {
  applyKeyboardStep,
  assignSquad,
  clampPosition,
  nearestSlot,
  resolveDrop,
  toNormalized,
} from '@/lib/tactics/geometry';
import {
  previewGeometry,
  previewZ,
  shouldDegradePreview,
  type PreviewTier,
} from '@/lib/tactics/preview';
import { createCommitScheduler } from '@/lib/tactics/scheduler';
import { usePredictionStore } from '@/store/predictionStore';
import { useTacticsStore } from '@/store/tacticsStore';
import type { FormationId, MatchId, Position, SliderKey, Sliders } from '@/types/data';

/** 프리셋 전환 애니메이션 시간 — DESIGN.md §5 토큰 스냅과 같은 값 */
const TRANSITION_MS = 120;

interface DragState {
  index: number;
  pointerId: number;
  origin: Position;
  current: Position;
  /** 잡은 지점과 토큰 중심의 차 — 토큰이 손가락 중심으로 튀지 않게 한다 */
  grabOffset: { dx: number; dy: number };
}

interface TacticsBoardProps {
  opponentMatchId: MatchId;
  opponentName: string;
}

/**
 * 전술보드 조율자 (F01·F02·F03·F04·F08)
 *
 * ## 왜 드래그 로직이 토큰이 아니라 여기 있는가
 *
 * "진행 중인 드래그는 하나"(F02-R3)와 "드래그 중에는 키보드 선택을 시작하지 않는다"는
 * **컴포넌트 경계를 넘는 불변식**입니다. 토큰마다 자기 드래그 상태를 들면 강제할 수 없습니다.
 *
 * ## `'use client'`인데 SSR을 깨지 않는 이유
 *
 * Next.js는 Client Component도 첫 요청에서 서버 렌더합니다. 두 스토어의 초기값이 전부
 * `defaults.json`에서 결정론적으로 나오므로 서버 HTML과 클라이언트 첫 렌더가 같고,
 * JS가 죽어도 그 HTML(피치·토큰·슬라이더·확률)이 화면에 남습니다 (F08-R5).
 */
export function TacticsBoard({ opponentMatchId, opponentName }: TacticsBoardProps) {
  const formationId = useTacticsStore((state) => state.formationId);
  const positions = useTacticsStore((state) => state.positions);
  const sliders = useTacticsStore((state) => state.sliders);
  const selectedTokenIndex = useTacticsStore((state) => state.selectedTokenIndex);
  const setFormation = useTacticsStore((state) => state.setFormation);
  const movePlayer = useTacticsStore((state) => state.movePlayer);
  const setSlider = useTacticsStore((state) => state.setSlider);
  const selectToken = useTacticsStore((state) => state.selectToken);

  const probabilities = usePredictionStore((state) => state.p);
  const engine = usePredictionStore((state) => state.engine);
  const setContext = usePredictionStore((state) => state.setContext);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snapTargetIndex, setSnapTargetIndex] = useState<number | null>(null);
  const [keyboardDraft, setKeyboardDraft] = useState<{ index: number; position: Position } | null>(
    null,
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previewTier, setPreviewTier] = useState<PreviewTier>('full');

  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSamples = useRef<number[]>([]);

  const slots = useMemo(() => getFormation(formationId).slots, [formationId]);
  const squad = useMemo(() => assignSquad(slots, koreaSquad), [slots]);

  /**
   * 렌더용 좌표 — 스토어 좌표 위에 드래그·키보드 draft를 덮는다
   *
   * 스토어에 쓰지 않는 이유: `pointermove`마다 커밋하면 리렌더가 폭주하고(F02 §4),
   * Esc로 되돌릴 중간 상태가 사라집니다(F03-R5).
   */
  const renderPositions = useMemo(() => {
    if (!drag && !keyboardDraft) return positions;
    const next = [...positions];
    if (drag) next[drag.index] = drag.current;
    if (keyboardDraft) next[keyboardDraft.index] = keyboardDraft.position;
    return next;
  }, [positions, drag, keyboardDraft]);

  // --- 커밋 파이프라인 (F04-R2·R4) -------------------------------------------
  const commitRef = useRef<((snapshot: { positions: Position[]; sliders: Sliders }) => void) | null>(
    null,
  );

  const scheduler = useMemo(
    () =>
      createCommitScheduler<{ positions: Position[]; sliders: Sliders }>((snapshot, generation) => {
        const context = getMatchContext(opponentMatchId);
        const result = adjust(
          {
            eloDiff: context.features.elo_diff,
            lambda0: context.lambda0,
            sliders: snapshot.sliders,
            positions: snapshot.positions,
            slotRoles: slots.map((slot) => slot.role),
            playerRoles: squad.map((player) => player.position),
            presetSlots: slots,
          },
          adjustConstants,
        );
        // B5의 Worker가 이 컨텍스트를 읽어 확률을 갱신한다. `generation`을 함께 실어
        // 늦게 도착한 옛 결과를 버릴 수 있게 한다 (F04-R4).
        setContext({
          matchId: opponentMatchId,
          effectiveEloDiff: result.effectiveEloDiff,
          lambda: result.lambda,
          lambda0: context.lambda0,
          generation,
        });
      }),
    [opponentMatchId, slots, squad, setContext],
  );

  useEffect(() => {
    commitRef.current = (snapshot) => scheduler.schedule(snapshot);
    return () => scheduler.cancel();
  }, [scheduler]);

  const scheduleCommit = useCallback(
    (nextPositions: Position[], nextSliders: Sliders) => {
      commitRef.current?.({ positions: nextPositions, sliders: nextSliders });
    },
    [],
  );

  // 첫 마운트에서 기본 상태의 컨텍스트를 한 번 만들어 둔다 — B5가 붙는 즉시
  // 사용할 수 있고, 조정 계층이 항등이라 값은 사전 계산값과 같다 (F08-R3)
  useEffect(() => {
    scheduleCommit(positions, sliders);
    // 의존성을 비우는 것은 의도다 — "첫 마운트 1회"가 요구사항
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- F04 시각 프리뷰 -------------------------------------------------------
  const preview = useMemo(() => {
    const placement = placementZ(
      renderPositions,
      slots.map((slot) => slot.role),
      slots,
      adjustConstants,
    );
    return previewGeometry(previewZ(sliderZ(sliders), placement));
  }, [renderPositions, slots, sliders]);

  /**
   * 프리뷰 지연 측정 (F04-R5)
   *
   * 입력 시각과 다음 페인트 사이를 재고, 예산 초과가 반복되면 효과를 한 단 내립니다.
   * **값은 건드리지 않습니다** — 축소되는 것은 표현뿐입니다.
   */
  const measurePreview = useCallback((startedAt: number) => {
    if (typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(() => {
      previewSamples.current = [...previewSamples.current.slice(-8), performance.now() - startedAt];
      if (shouldDegradePreview(previewSamples.current)) {
        // 한 번 강등되면 되돌리지 않는다 — 켜졌다 꺼졌다 하는 것이 더 산만하다
        setPreviewTier('lines');
      }
    });
  }, []);

  const handleSliderChange = useCallback(
    (key: SliderKey, value: number) => {
      const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
      setSlider(key, value);
      const next = { ...sliders, [key]: Math.min(100, Math.max(0, Math.round(value))) };
      scheduleCommit(positions, next);
      if (startedAt) measurePreview(startedAt);
    },
    [setSlider, sliders, positions, scheduleCommit, measurePreview],
  );

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setSnapTargetIndex(null);
  }, []);

  // --- F01 프리셋 전환 -------------------------------------------------------
  const handleFormationChange = useCallback(
    (id: FormationId) => {
      if (id === formationId) return;
      cancelDrag();
      setKeyboardDraft(null);
      setFormation(id);

      // 전환 중에는 드래그 시작을 무시한다 (F01-R2). 연타하면 이전 타이머를 버리므로
      // **마지막 선택만** 적용된다.
      setIsTransitioning(true);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => setIsTransitioning(false), TRANSITION_MS);

      const nextPositions = getFormation(id).slots.map((slot) => ({ x: slot.x, y: slot.y }));
      scheduleCommit(nextPositions, sliders);
    },
    [formationId, setFormation, sliders, scheduleCommit, cancelDrag],
  );

  useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    [],
  );

  // --- F02 드래그 ------------------------------------------------------------
  function pointerToNormalized(clientX: number, clientY: number): Position | null {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return toNormalized(clientX, clientY, rect);
  }

  const handleTokenPointerDown = useCallback(
    (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
      // F02-R7 — 두 번째 손가락은 무시 (P19 C4)
      if (!event.isPrimary) return;
      // F02-R3 — 진행 중 드래그가 있으면 새 드래그를 시작하지 않는다
      if (dragRef.current) return;
      // F01-R2 — 프리셋 전환 애니메이션 중
      if (isTransitioning) return;

      const point = pointerToNormalized(event.clientX, event.clientY);
      const origin = positions[index];
      if (!point || !origin) return;

      // P19 C1 — 토큰을 DOM에서 재부착하지 않으므로 여기서 바로 캡처해도 된다.
      // 재부착하는 설계로 바꾼다면 이 호출을 재부착 **뒤로** 옮겨야 한다.
      // P19 C2 — pointerId가 이미 사라졌으면 NotFoundError. 캡처 없는 드래그는
      // 손가락을 놓쳐 유령 상태가 되므로, 실패하면 아예 시작하지 않는다.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        return;
      }

      const next: DragState = {
        index,
        pointerId: event.pointerId,
        origin,
        current: origin,
        grabOffset: { dx: origin.x - point.x, dy: origin.y - point.y },
      };
      dragRef.current = next;
      setDrag(next);
      setKeyboardDraft(null);
    },
    [isTransitioning, positions],
  );

  const handleTokenPointerMove = useCallback(
    (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragRef.current;
      // 캡처 밖에서 움직이는 다른 포인터는 무시 (F02-R7의 이동 단계)
      if (!state || state.index !== index || state.pointerId !== event.pointerId) return;

      const point = pointerToNormalized(event.clientX, event.clientY);
      if (!point) return;
      const current = clampPosition({
        x: point.x + state.grabOffset.dx,
        y: point.y + state.grabOffset.dy,
      });

      // 스토어에 쓰지 않는다 — 로컬 상태만 (F02 §4 · P19 체크리스트)
      const nextState = { ...state, current };
      dragRef.current = nextState;
      setDrag(nextState);
      // 드롭존 하이라이트는 좌표 근접 판정 — 캡처 중 pointerenter 는 발화하지 않는다 (P19 C3)
      setSnapTargetIndex(nearestSlot(current, slots, positions, index));
    },
    [slots, positions],
  );

  const handleTokenPointerUp = useCallback(
    (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragRef.current;
      if (!state || state.index !== index || state.pointerId !== event.pointerId) return;

      const point = pointerToNormalized(event.clientX, event.clientY);
      const target = point
        ? resolveDrop(
            { x: point.x + state.grabOffset.dx, y: point.y + state.grabOffset.dy },
            slots,
            positions,
            index,
          )
        : null;

      cancelDrag();

      // F02-R5 — 피치 밖 드롭이면 원위치. 스토어를 건드리지 않으므로 커밋도 없다
      if (!target) return;

      movePlayer(index, target);
      const nextPositions = [...positions];
      nextPositions[index] = clampPosition(target);
      scheduleCommit(nextPositions, sliders);
    },
    [slots, positions, movePlayer, sliders, scheduleCommit, cancelDrag],
  );

  const handleTokenPointerCancel = useCallback(
    (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragRef.current;
      if (!state || state.index !== index || state.pointerId !== event.pointerId) return;
      // F02-R6의 구현체 — 회전·전화 수신 등으로 브라우저가 제스처를 가져갈 때
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // 이미 해제됐으면 던진다. 취소 자체는 계속 진행해야 한다
      }
      cancelDrag();
    },
    [cancelDrag],
  );

  // F02-R6 — 회전·리사이즈는 진행 중 드래그를 취소한다. 좌표는 정규화라
  // 재렌더만으로 정합하므로 취소 외에 할 일이 없다 (F01-R6)
  useEffect(() => {
    if (!drag) return;
    const onViewportChange = () => cancelDrag();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [drag, cancelDrag]);

  // F02-R4 · F03-R5 — Esc. 포커스가 토큰을 떠났을 수도 있어 window 에서도 받는다
  useEffect(() => {
    if (!drag && !keyboardDraft && selectedTokenIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelDrag();
      setKeyboardDraft(null);
      selectToken(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drag, keyboardDraft, selectedTokenIndex, cancelDrag, selectToken]);

  // --- F03 클릭-클릭 · 키보드 -------------------------------------------------
  const commitTo = useCallback(
    (index: number, point: Position, excludeSlotIndex: number | null = null) => {
      const target = resolveDrop(point, slots, positions, index, excludeSlotIndex);
      if (!target) return;
      movePlayer(index, target);
      const nextPositions = [...positions];
      nextPositions[index] = clampPosition(target);
      scheduleCommit(nextPositions, sliders);
    },
    [slots, positions, movePlayer, sliders, scheduleCommit],
  );

  const handleTokenActivate = useCallback(
    (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
      // F03-R4 — 선택 상태에서 다른 토큰을 눌러도 **이동이 아니라 선택 전환**.
      // 표면 클릭까지 올라가면 "목적지 지정"으로 오해되므로 여기서 멈춘다.
      event.stopPropagation();
      if (isTransitioning) return;
      // 드래그 직후의 합성 click 은 무시한다 — 드롭이 곧 선택이 되면 혼란스럽다
      if (dragRef.current) return;

      setKeyboardDraft(null);
      selectToken(selectedTokenIndex === index ? null : index);
    },
    [isTransitioning, selectToken, selectedTokenIndex],
  );

  const handleSurfaceClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (selectedTokenIndex === null || isTransitioning) return;
      const point = pointerToNormalized(event.clientX, event.clientY);
      if (!point) return;
      // F03-R2 — 목적지 탭으로 이동 후 선택 해제
      commitTo(selectedTokenIndex, point);
      setKeyboardDraft(null);
      selectToken(null);
    },
    [selectedTokenIndex, isTransitioning, commitTo, selectToken],
  );

  const handleTokenKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (isTransitioning) return;
      // 드래그 중에는 키보드 경로를 열지 않는다 — 두 경로가 같은 토큰을 동시에 움직이는 상태 차단
      if (dragRef.current) return;

      const draft = keyboardDraft?.index === index ? keyboardDraft : null;

      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (draft) {
          setKeyboardDraft(null);
          selectToken(null);
          return;
        }
        const origin = positions[index];
        if (!origin) return;
        // F03-R3 — 선택 모드 진입 + 방향키 활성화
        selectToken(index);
        setKeyboardDraft({ index, position: origin });
        return;
      }

      if (!draft) {
        // 선택 모드가 아니면 방향키를 가로채지 않는다 — 페이지 스크롤을 막으면 접근성 퇴행
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        // 자기 홈 슬롯은 스냅 후보에서 뺀다 — 방향키 2%가 스냅 반경 8%에 갇혀
        // 짧은 이동이 통째로 무시되는 것을 막는다 (geometry.resolveDrop 주석 참조)
        commitTo(index, draft.position, index);
        setKeyboardDraft(null);
        selectToken(null);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        // F03-R5 — 위치를 변경하지 않는다 (draft 폐기)
        setKeyboardDraft(null);
        selectToken(null);
        return;
      }

      const moved = applyKeyboardStep(draft.position, event.key);
      if (!moved) return;
      // 선택 모드에서 페이지가 스크롤되면 토큰이 시야에서 사라진다
      event.preventDefault();
      setKeyboardDraft({ index, position: moved });
    },
    [isTransitioning, keyboardDraft, positions, selectToken, commitTo],
  );

  const selectedPlayer = selectedTokenIndex === null ? null : squad[selectedTokenIndex];

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col items-center gap-2 lg:basis-2/3">
        <Pitch
          frameRef={frameRef}
          positions={renderPositions}
          slots={slots}
          squad={squad}
          preview={preview}
          previewTier={previewTier}
          draggingIndex={drag?.index ?? null}
          selectedIndex={selectedTokenIndex}
          snapTargetIndex={snapTargetIndex}
          ghost={drag ? drag.origin : null}
          disabled={isTransitioning}
          onTokenPointerDown={handleTokenPointerDown}
          onTokenPointerMove={handleTokenPointerMove}
          onTokenPointerUp={handleTokenPointerUp}
          onTokenPointerCancel={handleTokenPointerCancel}
          onTokenActivate={handleTokenActivate}
          onTokenKeyDown={handleTokenKeyDown}
          onSurfaceClick={handleSurfaceClick}
        />

        {/* 키보드 경로 안내 — 선택 상태에서 토큰이 aria-describedby 로 참조한다 */}
        <p id="token-keyboard-help" className="text-center text-[13px] text-text-3">
          토큰을 끌거나, 탭해서 고른 뒤 목적지를 탭하세요. 키보드는 Space로 고르고 방향키로
          옮긴 뒤 Enter로 확정합니다.
        </p>
        {/* 조작 결과를 스크린리더에 알린다 — 조작마다 읽히지 않게 선택 시점에만 */}
        <p aria-live="polite" className="sr-only">
          {selectedPlayer
            ? `${selectedPlayer.displayName} 선택됨, 방향키로 이동`
            : ''}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:basis-1/3">
        <section
          className="rounded-lg border border-line bg-surface p-4"
          aria-label="예측 확률"
        >
          <h2 className="mb-3 text-[15px] font-semibold">
            {opponentName}전 예측
          </h2>
          <ProbabilityBar
            probabilities={probabilities}
            source={engine === null ? 'precomputed' : engine === 'onnx' ? 'inferred' : 'fallback'}
          />
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-3 text-[15px] font-semibold">전술 슬라이더</h2>
          <SliderSheet sliders={sliders} onChange={handleSliderChange} />
        </section>

        {/* 점진적 공개 — 첫 화면은 피치·슬라이더·예측 패널로 제한 (F08 §3) */}
        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="min-h-11 cursor-pointer text-[15px] font-semibold">
            포메이션 프리셋
          </summary>
          <div className="mt-3">
            <FormationPicker
              formations={formations}
              value={formationId}
              onChange={handleFormationChange}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
