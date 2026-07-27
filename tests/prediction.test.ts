/**
 * F08 기본 상태 테스트 — 첫 페인트에 확률이 있는가
 *
 * F08의 핵심은 "빈 화면이 존재하지 않는다"입니다. 그것을 만드는 것은 로딩 UI가 아니라
 * **초기값이 이미 정답이라는 구조**이므로, 여기서 검증하는 것도 초기값입니다.
 */

import { describe, expect, it } from 'vitest';
import { probabilityShares } from '@/lib/prediction/shares';
import { defaults } from '@/lib/data';
import { INITIAL_PROBABILITIES, usePredictionStore } from '@/store/predictionStore';
import { useTacticsStore } from '@/store/tacticsStore';

describe('F08 사전 계산 확률', () => {
  it('precomputed 가 채워져 있다 — null 이면 첫 페인트에 확률이 없다', () => {
    expect(defaults.precomputed).not.toBeNull();
  });

  it('합이 1 ± 1e-6 이고 세 값 모두 (0,1) 내부다 (구현규약 §4 계약)', () => {
    const p = defaults.precomputed;
    expect(p).not.toBeNull();
    if (!p) return;
    expect(Math.abs(p.win + p.draw + p.lose - 1)).toBeLessThanOrEqual(1e-6);
    for (const value of [p.win, p.draw, p.lose]) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('F08 스토어 초기값 — 하이드레이션 불일치 회귀 방지', () => {
  it('예측 스토어가 사전 계산값으로 시작한다', () => {
    expect(INITIAL_PROBABILITIES).toEqual(defaults.precomputed);
    expect(usePredictionStore.getState().p).toEqual(defaults.precomputed);
  });

  it('엔진이 붙기 전에는 engine 이 null 이다 — "추론된 값"이라고 주장하지 않는다', () => {
    expect(usePredictionStore.getState().engine).toBeNull();
    expect(usePredictionStore.getState().context).toBeNull();
  });

  it('전술 스토어 초기값이 defaults.json 과 정확히 일치한다', () => {
    // 서버 렌더 HTML과 클라이언트 첫 렌더가 같은 값이어야 한다. 초기 상태 계산 경로에
    // Date.now()·Math.random()·window 가 없어야 성립한다.
    const state = useTacticsStore.getState();
    expect(state.formationId).toBe(defaults.formationId);
    expect(state.sliders).toEqual(defaults.sliders);
  });

  it('setContext 가 조정 계층 산출물을 받아 둔다 — B5 인계 지점', () => {
    usePredictionStore.getState().setContext({
      matchId: 'cze',
      effectiveEloDiff: 12.5,
      lambda: [1.2, 0.9],
      lambda0: [1.1, 1.0],
      generation: 7,
    });
    expect(usePredictionStore.getState().context?.generation).toBe(7);
    // p 는 건드리지 않는다 — F05-R2 "추론 중에는 직전 값을 유지"
    expect(usePredictionStore.getState().p).toEqual(defaults.precomputed);
  });
});

describe('확률 막대 폭 계산', () => {
  it('합이 1이 아니어도 총 폭이 100%가 된다', () => {
    const shares = probabilityShares({ win: 0.6, draw: 0.6, lose: 0.6 });
    expect(shares.win + shares.draw + shares.lose).toBeCloseTo(1, 12);
    expect(shares.win).toBeCloseTo(1 / 3, 12);
  });

  it('정상 입력은 그대로 통과시킨다', () => {
    const p = defaults.precomputed;
    expect(p).not.toBeNull();
    if (!p) return;
    const shares = probabilityShares(p);
    expect(shares.win).toBeCloseTo(p.win, 9);
  });

  it('합이 0이어도 NaN·Infinity 를 만들지 않는다', () => {
    const shares = probabilityShares({ win: 0, draw: 0, lose: 0 });
    for (const value of [shares.win, shares.draw, shares.lose]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
