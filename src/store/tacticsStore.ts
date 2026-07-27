/**
 * 전술 스토어 — 사용자가 만지는 것 (구현규약 §3 tacticsSlice)
 *
 * 예측 결과(`predictionStore`)와 **분리된 스토어**입니다. 전술이 변해도 확률은
 * 새 결과가 도착할 때까지 그대로여야 하고(F05-R2 "추론 중에는 직전 값을 유지"),
 * 한 스토어에 섞으면 "조작했는데 확률이 잠깐 비는" 상태가 코드상 가능해집니다.
 *
 * 파생값(`z = (s-50)/50` 등)은 여기 두지 않습니다 — `lib/tactics/adjust.ts`가
 * 계산합니다. 스토어에 두면 두 곳이 어긋날 수 있습니다.
 */

import { create } from 'zustand';
import { defaults, getFormation } from '@/lib/data';
import type { FormationId, Position, SliderKey, Sliders } from '@/types/data';

interface TacticsState {
  formationId: FormationId;
  /** 길이 11, 정규화 좌표. 인덱스가 곧 슬롯 번호 */
  positions: Position[];
  sliders: Sliders;
  /** F03 클릭-클릭 1단계에서 선택된 토큰. 드래그 대안 경로의 상태 */
  selectedTokenIndex: number | null;
  setFormation: (id: FormationId) => void;
  movePlayer: (index: number, position: Position) => void;
  setSlider: (key: SliderKey, value: number) => void;
  selectToken: (index: number | null) => void;
  reset: () => void;
}

function positionsOf(formationId: FormationId): Position[] {
  return getFormation(formationId).slots.map((slot) => ({ x: slot.x, y: slot.y }));
}

const initialState = {
  formationId: defaults.formationId,
  positions: positionsOf(defaults.formationId),
  sliders: defaults.sliders,
  selectedTokenIndex: null,
} satisfies Pick<
  TacticsState,
  'formationId' | 'positions' | 'sliders' | 'selectedTokenIndex'
>;

export const useTacticsStore = create<TacticsState>()((set) => ({
  ...initialState,

  setFormation: (id) =>
    set({ formationId: id, positions: positionsOf(id), selectedTokenIndex: null }),

  movePlayer: (index, position) =>
    set((state) => {
      if (index < 0 || index >= state.positions.length) {
        return state;
      }
      const positions = [...state.positions];
      // 피치 밖으로 나가는 좌표는 저장 단계에서 잘라 낸다 — 좌표가 오염되면
      // 조정 계층의 배치 파생 지표까지 함께 오염된다 (구현규약 §5-2)
      positions[index] = {
        x: Math.min(1, Math.max(0, position.x)),
        y: Math.min(1, Math.max(0, position.y)),
      };
      return { positions };
    }),

  setSlider: (key, value) =>
    set((state) => ({
      sliders: { ...state.sliders, [key]: Math.min(100, Math.max(0, Math.round(value))) },
    })),

  selectToken: (index) => set({ selectedTokenIndex: index }),

  reset: () => set({ ...initialState, positions: positionsOf(defaults.formationId) }),
}));
