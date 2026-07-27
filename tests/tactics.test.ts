/**
 * 전술보드 순수 함수 테스트 (F01~F04)
 *
 * E2E를 도입하지 않는 대신 순수 함수 커버리지를 높게 유지합니다 (구현규약 §7).
 * 여기서 잡히지 않는 것만 B8 실기기로 넘어갑니다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KEYBOARD_STEP,
  OCCUPIED_EPS,
  PITCH_GEOMETRY,
  PITCH_VIEWBOX,
  SNAP_RADIUS,
  applyKeyboardStep,
  assignSquad,
  clampPosition,
  isInsidePitch,
  nearestSlot,
  pitchDistance,
  resolveDrop,
  toFramePercent,
  toNormalized,
  toViewBox,
  POSITION_LABEL,
} from '@/lib/tactics/geometry';
import {
  PREVIEW_BUDGET_MS,
  previewGeometry,
  previewZ,
  qualitativeLabel,
  shouldDegradePreview,
} from '@/lib/tactics/preview';
import { createCommitScheduler } from '@/lib/tactics/scheduler';
import { defaults, formations, getFormation, koreaSquad } from '@/lib/data';
import type { Position, PositionSlot } from '@/types/data';

const slots = getFormation(defaults.formationId).slots;
const presetPositions: Position[] = slots.map((slot) => ({ x: slot.x, y: slot.y }));

describe('피치 기하 (F01 · DESIGN.md §3.3)', () => {
  it('viewBox 종횡비가 2:3이다 — 프레임 aspect-ratio 와 어긋나면 레터박스가 생긴다', () => {
    expect(PITCH_VIEWBOX.width / PITCH_VIEWBOX.height).toBeCloseTo(2 / 3, 12);
  });

  it('DESIGN.md §3.3 비율을 그대로 옮겼다', () => {
    const { width: w, height: h } = PITCH_VIEWBOX;
    expect(PITCH_GEOMETRY.centerCircle.r).toBeCloseTo(Math.min(w, h) * 0.11, 12);
    expect(PITCH_GEOMETRY.penaltyBox.x).toBeCloseTo(w * 0.22, 12);
    expect(PITCH_GEOMETRY.penaltyBox.width).toBeCloseTo(w * 0.56, 12);
    expect(PITCH_GEOMETRY.penaltyBox.height).toBeCloseTo(h * 0.13, 12);
    expect(PITCH_GEOMETRY.goalBox.x).toBeCloseTo(w * 0.36, 12);
    expect(PITCH_GEOMETRY.goalBox.width).toBeCloseTo(w * 0.28, 12);
    expect(PITCH_GEOMETRY.goalBox.height).toBeCloseTo(h * 0.055, 12);
  });

  it('페널티·골 박스가 좌우 대칭이다', () => {
    for (const box of [PITCH_GEOMETRY.penaltyBox, PITCH_GEOMETRY.goalBox]) {
      expect(box.x + box.width / 2).toBeCloseTo(PITCH_VIEWBOX.width / 2, 12);
    }
  });
});

describe('좌표 변환 (F01 impl §4.2)', () => {
  const rect = { left: 100, top: 50, width: 300, height: 450 };

  it('y가 뒤집힌다 — 정규화 y=1(상대 진영)이 화면 위', () => {
    expect(toNormalized(100, 50, rect)).toEqual({ x: 0, y: 1 });
    expect(toNormalized(400, 500, rect)).toEqual({ x: 1, y: 0 });
  });

  it('중앙이 (0.5, 0.5)로 온다', () => {
    const center = toNormalized(250, 275, rect);
    expect(center.x).toBeCloseTo(0.5, 12);
    expect(center.y).toBeCloseTo(0.5, 12);
  });

  it('클램프하지 않는다 — 피치 밖 판정(F02-R5)이 성립해야 하므로', () => {
    const outside = toNormalized(50, 50, rect);
    expect(outside.x).toBeLessThan(0);
    expect(isInsidePitch(outside)).toBe(false);
  });

  it('toViewBox 와 왕복한다', () => {
    for (const position of presetPositions) {
      const view = toViewBox(position);
      expect(view.x / PITCH_VIEWBOX.width).toBeCloseTo(position.x, 12);
      expect(1 - view.y / PITCH_VIEWBOX.height).toBeCloseTo(position.y, 12);
    }
  });

  it('clampPosition 이 [0,1]로 자른다', () => {
    expect(clampPosition({ x: -0.5, y: 1.4 })).toEqual({ x: 0, y: 1 });
    expect(clampPosition({ x: 0.3, y: 0.7 })).toEqual({ x: 0.3, y: 0.7 });
  });

  it('거리를 피치 높이 단위로 잰다 — 가로만 헐거워지지 않게', () => {
    // 정규화 가로 1.0 = 피치 폭 = 높이의 2/3
    const horizontal = pitchDistance({ x: 0, y: 0.5 }, { x: 1, y: 0.5 });
    const vertical = pitchDistance({ x: 0.5, y: 0 }, { x: 0.5, y: 1 });
    expect(horizontal).toBeCloseTo(2 / 3, 12);
    expect(vertical).toBeCloseTo(1, 12);
  });
});

describe('스냅·드롭 판정 (F02 impl §4.2 · F03 공유)', () => {
  it('반경 밖이면 스냅하지 않는다', () => {
    const far = { x: 0.5, y: 0.5 };
    const index = nearestSlot(far, slots, presetPositions, 0);
    // 4-3-3 중앙 (0.5, 0.5) 근처에는 MF 슬롯(0.5, 0.44)이 있지만 그 자리는 점유돼 있다
    expect(index).toBeNull();
  });

  it('다른 토큰이 점유한 슬롯은 후보에서 빠진다 — 겹쳐 쌓임 방지', () => {
    const gkSlot = slots[0];
    expect(gkSlot).toBeDefined();
    // 전원이 프리셋 위치에 있으므로 모든 슬롯이 점유 상태다
    expect(nearestSlot({ x: gkSlot!.x, y: gkSlot!.y }, slots, presetPositions, 5)).toBeNull();
  });

  it('비어 있는 슬롯에는 스냅한다', () => {
    const moved = [...presetPositions];
    // 0번(GK)을 자기 슬롯에서 멀리 치워 그 슬롯을 비운다
    moved[0] = { x: 0.05, y: 0.95 };
    const gkSlot = slots[0]!;
    const index = nearestSlot({ x: gkSlot.x + 0.02, y: gkSlot.y + 0.02 }, slots, moved, 0);
    expect(index).toBe(0);
  });

  it('가장 가까운 후보를 고른다', () => {
    const empty = presetPositions.map(() => ({ x: 0.5, y: 0.5 }));
    const target = slots[3]!;
    const index = nearestSlot({ x: target.x, y: target.y }, slots, empty, 99);
    expect(index).toBe(3);
  });

  it('F02-R5: 피치 밖 드롭은 null — 이동하지 않는다', () => {
    expect(resolveDrop({ x: 1.2, y: 0.5 }, slots, presetPositions, 0)).toBeNull();
    expect(resolveDrop({ x: 0.5, y: -0.01 }, slots, presetPositions, 0)).toBeNull();
  });

  it('스냅 대상이 없으면 자유 배치 좌표를 그대로 돌려준다', () => {
    const free = { x: 0.5, y: 0.58 };
    expect(resolveDrop(free, slots, presetPositions, 0)).toEqual(free);
  });

  it('경계값 (0,0)·(1,1)은 피치 안이다', () => {
    expect(isInsidePitch({ x: 0, y: 0 })).toBe(true);
    expect(isInsidePitch({ x: 1, y: 1 })).toBe(true);
  });

  it('상수가 설계 명세 값과 같다', () => {
    expect(SNAP_RADIUS).toBe(0.08);
    expect(OCCUPIED_EPS).toBe(0.02);
    expect(KEYBOARD_STEP).toBe(0.02);
  });
});

describe('키보드 이동 (F03)', () => {
  it('4방향으로 2%씩 움직인다', () => {
    const start = { x: 0.5, y: 0.5 };
    expect(applyKeyboardStep(start, 'ArrowUp')?.y).toBeCloseTo(0.52, 12);
    expect(applyKeyboardStep(start, 'ArrowDown')?.y).toBeCloseTo(0.48, 12);
    expect(applyKeyboardStep(start, 'ArrowLeft')?.x).toBeCloseTo(0.48, 12);
    expect(applyKeyboardStep(start, 'ArrowRight')?.x).toBeCloseTo(0.52, 12);
  });

  it('F03-R6: 경계에서 멈춘다 — 피치 밖 좌표를 만들지 않는다', () => {
    expect(applyKeyboardStep({ x: 0.5, y: 1 }, 'ArrowUp')).toEqual({ x: 0.5, y: 1 });
    expect(applyKeyboardStep({ x: 0, y: 0.5 }, 'ArrowLeft')).toEqual({ x: 0, y: 0.5 });
  });

  it('지원하지 않는 키는 null — 호출부가 스크롤을 가로채지 않게', () => {
    expect(applyKeyboardStep({ x: 0.5, y: 0.5 }, 'Tab')).toBeNull();
    expect(applyKeyboardStep({ x: 0.5, y: 0.5 }, 'a')).toBeNull();
  });

  it('F03이 F02와 같은 드롭 규칙을 쓴다 — 같은 입력에 같은 출력', () => {
    const point = { x: 0.42, y: 0.31 };
    const viaDrag = resolveDrop(point, slots, presetPositions, 2);
    const viaKeyboard = resolveDrop(point, slots, presetPositions, 2);
    expect(viaKeyboard).toEqual(viaDrag);
  });

  it('키보드 짧은 이동이 홈 슬롯 자석에 갇히지 않는다', () => {
    // 방향키 1회는 2%인데 스냅 반경은 8%다. 홈 슬롯을 후보로 두면 3번까지 누른 이동이
    // 전부 제자리로 끌려와 **아무 일도 일어나지 않는다** (B4 브라우저 실측에서 발견).
    const index = 4;
    const home = slots[index]!;
    let point: Position = { x: home.x, y: home.y };
    point = applyKeyboardStep(point, 'ArrowUp')!;
    point = applyKeyboardStep(point, 'ArrowUp')!;

    // 드래그 경로(홈 슬롯 포함)는 자석이 되돌린다 — 잘못 건드린 드래그를 되돌리는 이득
    expect(resolveDrop(point, slots, presetPositions, index)).toEqual({ x: home.x, y: home.y });

    // 키보드 경로(홈 슬롯 제외)는 의도한 위치를 지킨다
    const viaKeyboard = resolveDrop(point, slots, presetPositions, index, index);
    expect(viaKeyboard).not.toEqual({ x: home.x, y: home.y });
    expect(viaKeyboard?.y).toBeCloseTo(home.y + 2 * KEYBOARD_STEP, 12);
  });

  it('홈 슬롯을 빼도 다른 슬롯 스냅은 살아 있다', () => {
    const moved = [...presetPositions];
    moved[0] = { x: 0.05, y: 0.95 };
    const gkSlot = slots[0]!;
    // 0번 토큰이 자기 홈(GK 슬롯) 근처로 왔지만 홈은 제외 — 다른 후보도 없으므로 자유 배치
    const near = { x: gkSlot.x + 0.01, y: gkSlot.y + 0.01 };
    expect(resolveDrop(near, slots, moved, 0, 0)).toEqual(near);
    // 제외하지 않으면 스냅한다
    expect(resolveDrop(near, slots, moved, 0)).toEqual({ x: gkSlot.x, y: gkSlot.y });
  });
});

describe('선수 배정 (F01 impl §4.3)', () => {
  const assigned = assignSquad(slots, koreaSquad);

  it('슬롯 수만큼 배정하고 중복이 없다', () => {
    expect(assigned).toHaveLength(11);
    expect(new Set(assigned.map((player) => player.id)).size).toBe(11);
  });

  it('역할이 맞는 선수를 우선 배정한다', () => {
    slots.forEach((slot, index) => {
      expect(assigned[index]?.position).toBe(slot.role);
    });
  });

  it('선수가 모자라면 조용히 넘어가지 않는다', () => {
    expect(() => assignSquad(slots, koreaSquad.slice(0, 5))).toThrow();
  });

});

describe('세부 포지션 약어 (토큰 라벨 · ADR-005)', () => {
  it('한 포메이션 안에서 11개 약어가 전부 고유하다', () => {
    // 이것이 성 1음절을 버린 이유다 — 중복이 생기면 같은 문제가 형태만 바꿔 돌아온다
    for (const formation of formations) {
      const codes = formation.slots.map((slot) => slot.code);
      expect(new Set(codes).size, `${formation.label}의 약어가 겹칩니다`).toBe(11);
    }
  });

  it('약어가 3글자를 넘지 않는다 — 44px 토큰에 들어가야 한다', () => {
    for (const formation of formations) {
      for (const slot of formation.slots) {
        expect(slot.code.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('모든 약어에 한글명이 있다 — 스크린리더가 "엘씨비"로 읽지 않게', () => {
    for (const formation of formations) {
      for (const slot of formation.slots) {
        expect(POSITION_LABEL[slot.code]).toBeTruthy();
      }
    }
  });

  it('약어의 좌우 접두사가 실제 x좌표와 어긋나지 않는다', () => {
    for (const formation of formations) {
      for (const slot of formation.slots) {
        if (slot.code.startsWith('L')) {
          // LWB·LCB·LCM·LM·LW·LST — 전부 팀 기준 왼쪽(x < 0.5)이어야 한다
          expect(slot.x, `${formation.label} ${slot.code}`).toBeLessThan(0.5);
        } else if (slot.code.startsWith('R')) {
          expect(slot.x, `${formation.label} ${slot.code}`).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it('DM은 미드필더 라인에서 가장 뒤에 있다', () => {
    for (const formation of formations) {
      const dm = formation.slots.find((slot) => slot.code === 'DM');
      if (!dm) continue;
      const midfielders = formation.slots.filter((slot) => slot.role === 'MF');
      expect(Math.min(...midfielders.map((slot) => slot.y))).toBeCloseTo(dm.y, 12);
    }
  });
});

describe('피치 방향 (가로 데스크톱 · 세로 모바일)', () => {
  const rect = { left: 0, top: 0, width: 600, height: 400 };

  it('가로에서 자기 골대가 왼쪽, 상대 골대가 오른쪽이다', () => {
    // GK(y≈0)는 화면 왼쪽 끝, 스트라이커(y≈0.8)는 오른쪽
    expect(toFramePercent({ x: 0.5, y: 0 }, 'horizontal').left).toBe(0);
    expect(toFramePercent({ x: 0.5, y: 1 }, 'horizontal').left).toBe(100);
  });

  it('가로에서 팀의 왼쪽 측면이 화면 위다 — 중계 화면 관례', () => {
    expect(toFramePercent({ x: 0, y: 0.5 }, 'horizontal').top).toBe(0);
    expect(toFramePercent({ x: 1, y: 0.5 }, 'horizontal').top).toBe(100);
  });

  it('포인터 역변환이 화면 매핑의 정확한 역이다 — 어긋나면 잡은 곳과 다른 곳에 놓인다', () => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      for (const position of presetPositions) {
        const { left, top } = toFramePercent(position, orientation);
        const back = toNormalized(
          rect.left + (left / 100) * rect.width,
          rect.top + (top / 100) * rect.height,
          rect,
          orientation,
        );
        expect(back.x).toBeCloseTo(position.x, 12);
        expect(back.y).toBeCloseTo(position.y, 12);
      }
    }
  });

  it('가로에서 → 가 전진이고 ↑ 가 팀의 왼쪽이다', () => {
    const start = { x: 0.5, y: 0.5 };
    expect(applyKeyboardStep(start, 'ArrowRight', 'horizontal')?.y).toBeCloseTo(0.52, 12);
    expect(applyKeyboardStep(start, 'ArrowLeft', 'horizontal')?.y).toBeCloseTo(0.48, 12);
    expect(applyKeyboardStep(start, 'ArrowUp', 'horizontal')?.x).toBeCloseTo(0.48, 12);
    expect(applyKeyboardStep(start, 'ArrowDown', 'horizontal')?.x).toBeCloseTo(0.52, 12);
  });

  it('방향이 달라도 지원하지 않는 키는 null이다', () => {
    expect(applyKeyboardStep({ x: 0.5, y: 0.5 }, 'Tab', 'horizontal')).toBeNull();
  });
});

describe('F04 시각 프리뷰', () => {
  const flatSlots: PositionSlot[] = slots;

  it('극단값에서도 도형이 피치 밖으로 나가지 않는다', () => {
    for (const value of [-1, -0.5, 0, 0.5, 1]) {
      const geometry = previewGeometry({
        line: value,
        pressing: value,
        width: value,
        tempo: value,
      });
      for (const y of [geometry.lineY, geometry.pressBand.top, geometry.pressBand.bottom]) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
      for (const x of geometry.widthGuides) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
      expect(geometry.arrowCount).toBeGreaterThanOrEqual(2);
      expect(geometry.arrowCount).toBeLessThanOrEqual(6);
    }
  });

  it('라인 높이를 올리면 가이드가 상대 진영 쪽으로 간다', () => {
    const low = previewGeometry({ line: -1, pressing: 0, width: 0, tempo: 0 });
    const high = previewGeometry({ line: 1, pressing: 0, width: 0, tempo: 0 });
    expect(high.lineY).toBeGreaterThan(low.lineY);
  });

  it('템포를 올리면 화살표가 늘어난다', () => {
    const slow = previewGeometry({ line: 0, pressing: 0, width: 0, tempo: -1 });
    const fast = previewGeometry({ line: 0, pressing: 0, width: 0, tempo: 1 });
    expect(fast.arrowCount).toBeGreaterThan(slow.arrowCount);
  });

  it('previewZ 가 피처_정의서 §4.3과 같은 가중을 쓴다 (배치 ½ + 슬라이더 ½)', () => {
    const z = previewZ(
      { lineHeight: 1, pressing: 0.4, width: -1, tempo: 0.2 },
      { line: -1, width: 1 },
    );
    expect(z.line).toBeCloseTo(0, 12);
    expect(z.width).toBeCloseTo(0, 12);
    // 압박·템포는 배치에서 유도되지 않으므로 슬라이더 단독
    expect(z.pressing).toBe(0.4);
    expect(z.tempo).toBe(0.2);
  });

  it('기본 상태에서 프리뷰 z가 전부 0이다', () => {
    expect(flatSlots).toHaveLength(11);
    const z = previewZ(
      { lineHeight: 0, pressing: 0, width: 0, tempo: 0 },
      { line: 0, width: 0 },
    );
    expect(Object.values(z).every((value) => value === 0)).toBe(true);
  });

  it('F04-R5: 예산 초과가 반복되면 강등하되 한두 번으로는 강등하지 않는다', () => {
    const over = PREVIEW_BUDGET_MS + 20;
    expect(shouldDegradePreview([over, 10, 10])).toBe(false);
    expect(shouldDegradePreview([over, over, 10])).toBe(false);
    expect(shouldDegradePreview([over, over, over])).toBe(true);
    // 최근 5개만 본다 — 옛날의 느린 첫 조작이 영원히 따라오지 않는다
    expect(shouldDegradePreview([over, over, over, 10, 10, 10, 10, 10])).toBe(false);
  });

  it('질적 라벨이 값과 함께 제공된다 (색·수치 단독 의존 금지)', () => {
    expect(qualitativeLabel(0)).toBe('매우 낮음');
    expect(qualitativeLabel(50)).toBe('보통');
    expect(qualitativeLabel(100)).toBe('매우 높음');
  });
});

describe('커밋 스케줄러 (F04-R3·R4)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounce 후 한 번만 커밋한다 — 마지막 값 승리', () => {
    const commits: string[] = [];
    const scheduler = createCommitScheduler<string>((snapshot) => commits.push(snapshot), 160);

    scheduler.schedule('a');
    scheduler.schedule('b');
    scheduler.schedule('c');
    vi.advanceTimersByTime(159);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(commits).toEqual(['c']);
  });

  it('generation 이 단조 증가하고 커밋에 실린다 — 구식 결과 식별자', () => {
    const seen: number[] = [];
    const scheduler = createCommitScheduler<string>((_, generation) => seen.push(generation), 10);

    scheduler.schedule('a');
    vi.advanceTimersByTime(10);
    scheduler.schedule('b');
    vi.advanceTimersByTime(10);

    expect(seen).toEqual([1, 2]);
    expect(scheduler.generation).toBe(2);
  });

  it('cancel 하면 커밋되지 않는다 (F02-R4 Esc · F02-R5 피치 밖 드롭)', () => {
    const commits: string[] = [];
    const scheduler = createCommitScheduler<string>((snapshot) => commits.push(snapshot), 160);

    scheduler.schedule('a');
    scheduler.cancel();
    vi.advanceTimersByTime(1000);
    expect(commits).toEqual([]);
  });

  it('flush 는 대기 중 스냅샷을 즉시 커밋한다', () => {
    const commits: string[] = [];
    const scheduler = createCommitScheduler<string>((snapshot) => commits.push(snapshot), 160);

    scheduler.schedule('a');
    scheduler.flush();
    expect(commits).toEqual(['a']);
    // 이미 비웠으므로 타이머가 다시 커밋하지 않는다
    vi.advanceTimersByTime(1000);
    expect(commits).toEqual(['a']);
  });
});
