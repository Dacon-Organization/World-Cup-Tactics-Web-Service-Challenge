/**
 * 전술 스토어 단위 테스트 — 좌표·슬라이더의 경계 처리
 *
 * 조정 계층(`lib/tactics/adjust.ts`)은 B4에서 들어옵니다. 그 입력이 되는
 * 좌표·슬라이더가 범위를 벗어나면 조정 계층 전체가 오염되므로, 스토어 단계의
 * 클램프를 여기서 고정합니다 (구현규약 §5-2).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getFormation } from '@/lib/data';
import { useTacticsStore } from '@/store/tacticsStore';

describe('useTacticsStore', () => {
  beforeEach(() => {
    useTacticsStore.getState().reset();
  });

  it('초기 상태는 defaults.json 을 따른다', () => {
    const state = useTacticsStore.getState();
    expect(state.formationId).toBe('f433');
    expect(state.sliders).toEqual({ lineHeight: 50, pressing: 50, width: 50, tempo: 50 });
    expect(state.positions).toHaveLength(11);
  });

  it('포메이션을 바꾸면 좌표가 그 프리셋의 슬롯으로 재설정된다', () => {
    useTacticsStore.getState().setFormation('f352');
    const state = useTacticsStore.getState();
    expect(state.positions).toEqual(
      getFormation('f352').slots.map((slot) => ({ x: slot.x, y: slot.y })),
    );
    // 선택 상태가 남으면 이전 프리셋의 인덱스를 가리키게 된다
    expect(state.selectedTokenIndex).toBeNull();
  });

  it('피치 밖 좌표는 0~1로 잘린다', () => {
    useTacticsStore.getState().movePlayer(3, { x: 1.4, y: -0.2 });
    expect(useTacticsStore.getState().positions[3]).toEqual({ x: 1, y: 0 });
  });

  it('없는 인덱스로 옮기면 상태가 변하지 않는다', () => {
    const before = useTacticsStore.getState().positions;
    useTacticsStore.getState().movePlayer(11, { x: 0.5, y: 0.5 });
    expect(useTacticsStore.getState().positions).toBe(before);
  });

  it('슬라이더는 0~100 정수로 잘린다', () => {
    const { setSlider } = useTacticsStore.getState();
    setSlider('pressing', 140);
    setSlider('tempo', -30);
    setSlider('width', 62.6);
    const { sliders } = useTacticsStore.getState();
    expect(sliders.pressing).toBe(100);
    expect(sliders.tempo).toBe(0);
    expect(sliders.width).toBe(63);
  });

  it('reset 은 기본 상태로 완전히 되돌린다', () => {
    const store = useTacticsStore.getState();
    store.setFormation('f442');
    store.setSlider('tempo', 90);
    store.selectToken(4);
    store.reset();

    const state = useTacticsStore.getState();
    expect(state.formationId).toBe('f433');
    expect(state.sliders.tempo).toBe(50);
    expect(state.selectedTokenIndex).toBeNull();
    expect(state.positions).toEqual(
      getFormation('f433').slots.map((slot) => ({ x: slot.x, y: slot.y })),
    );
  });
});
