/**
 * 조정 계층 정합·불변식 테스트
 *
 * 핵심은 **정합 테스트**입니다 — 파이썬(학습 시 검증)과 JS(런타임)에 이중 구현된 함수라,
 * 어긋나면 "학습 때 검증한 것"과 "사용자가 보는 것"이 달라집니다 (ADR-008 · 구현규약 §7).
 * 픽스처 `adjust-cases.json`은 B3가 프리셋 4종 × 슬라이더 3⁴ × 상대 3종 = 972건을
 * 파이썬 참조 구현으로 산출한 것입니다.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import adjustCasesJson from './fixtures/adjust-cases.json';
import { adjust } from '@/lib/tactics/adjust';
import { blendDrawShare, gridProbabilities } from '@/lib/tactics/blend';
import { adjustConstants, getMatchContext, scoreGridConstants } from '@/lib/tactics/constants';
import { defaults, formations, getFormation } from '@/lib/data';
import { formationIdSchema, matchIdSchema, slidersSchema } from '@/lib/schema';
import type { FormationId } from '@/types/data';

/**
 * 픽스처도 외부 경계다 — `as` 로 통과시키지 않고 스키마로 좁힌다 (구현규약 §6).
 * 재생성 스크립트가 형태를 망가뜨리면 여기서 즉시 드러난다.
 */
const fixtureSchema = z.object({
  tolerance: z.number(),
  defaultSliders: slidersSchema,
  cases: z.array(
    z.object({
      formationId: formationIdSchema,
      matchId: matchIdSchema,
      sliders: slidersSchema,
      effectiveEloDiff: z.number(),
      lambda: z.tuple([z.number(), z.number()]),
    }),
  ),
});

const fixture = fixtureSchema.parse(adjustCasesJson);
type AdjustCase = (typeof fixture)['cases'][number];

/**
 * 프리셋 그대로의 상태 — 파이썬 `preset_state()`
 *
 * 선수 포지션 = 슬롯 역할이므로 적합도 페널티가 0입니다. 픽스처가 이 상태로 생성됐습니다.
 */
function presetState(formationId: FormationId) {
  const slots = [...getFormation(formationId).slots].sort((a, b) => a.slotIndex - b.slotIndex);
  return {
    positions: slots.map((slot) => ({ x: slot.x, y: slot.y })),
    slotRoles: slots.map((slot) => slot.role),
    playerRoles: slots.map((slot) => slot.role),
    presetSlots: slots,
  };
}

function runCase(testCase: AdjustCase) {
  const context = getMatchContext(testCase.matchId);
  return adjust(
    {
      eloDiff: context.features.elo_diff,
      lambda0: context.lambda0,
      sliders: testCase.sliders,
      ...presetState(testCase.formationId),
    },
    adjustConstants,
  );
}

describe('adjust — B3 파이썬 참조 구현 대조', () => {
  it('픽스처가 972건이고 허용 오차가 1e-9이다', () => {
    expect(fixture.cases).toHaveLength(972);
    expect(fixture.tolerance).toBe(1e-9);
  });

  it(`972건 전부 오차 ${1e-9} 이내로 재현한다`, () => {
    let worstElo = 0;
    let worstLambda = 0;

    for (const testCase of fixture.cases) {
      const actual = runCase(testCase);
      worstElo = Math.max(worstElo, Math.abs(actual.effectiveEloDiff - testCase.effectiveEloDiff));
      worstLambda = Math.max(
        worstLambda,
        Math.abs(actual.lambda[0] - testCase.lambda[0]),
        Math.abs(actual.lambda[1] - testCase.lambda[1]),
      );
    }

    // 최대 오차를 한 번에 보고한다 — 972건을 개별 assert 하면 첫 실패에서 멈춰
    // "얼마나 어긋났는가"를 알 수 없다
    expect(worstElo).toBeLessThanOrEqual(fixture.tolerance);
    expect(worstLambda).toBeLessThanOrEqual(fixture.tolerance);
  });
});

describe('adjust — 불변식', () => {
  it('FT-R3: 기본 상태에서 조정 계층은 항등이다', () => {
    for (const matchId of ['cze', 'mex', 'rsa'] as const) {
      const context = getMatchContext(matchId);
      const result = adjust(
        {
          eloDiff: context.features.elo_diff,
          lambda0: context.lambda0,
          sliders: fixture.defaultSliders,
          ...presetState(defaults.formationId),
        },
        adjustConstants,
      );
      // 첫 화면의 확률이 "순수한 학습 모델의 출력"이라는 주장의 근거 (구현규약 §5-1)
      expect(result.effectiveEloDiff).toBe(context.features.elo_diff);
      expect(result.lambda[0]).toBe(context.lambda0[0]);
      expect(result.lambda[1]).toBe(context.lambda0[1]);
    }
  });

  it('defaults.json 의 기본 슬라이더가 픽스처의 기본값과 같다', () => {
    expect(defaults.sliders).toEqual(fixture.defaultSliders);
  });

  it('총 조정 상한 ±30%: 어떤 슬라이더 조합에서도 λ 가 기준의 [0.7, 1.3] 을 벗어나지 않는다', () => {
    // 클램프(구현규약 §5-6)를 빼먹으면 ADR-008 양날 설계가 무의미해진다 — 회귀 방지
    for (const testCase of fixture.cases) {
      const context = getMatchContext(testCase.matchId);
      const result = runCase(testCase);
      for (const side of [0, 1] as const) {
        const ratio = result.lambda[side] / context.lambda0[side];
        expect(ratio).toBeGreaterThanOrEqual(1 - adjustConstants.capRatio - 1e-12);
        expect(ratio).toBeLessThanOrEqual(1 + adjustConstants.capRatio + 1e-12);
      }
    }
  });

  it('λ 절대 상한(FT-R4)을 넘지 않는다', () => {
    for (const testCase of fixture.cases) {
      const result = runCase(testCase);
      expect(result.lambda[0]).toBeLessThanOrEqual(adjustConstants.lambdaCap);
      expect(result.lambda[1]).toBeLessThanOrEqual(adjustConstants.lambdaCap);
    }
  });

  it('F04 GWT: 슬라이더 4종 각각 단독 조작이 산출을 움직인다', () => {
    const context = getMatchContext(defaults.opponentMatchId);
    const state = presetState(defaults.formationId);
    const baseline = adjust(
      { eloDiff: context.features.elo_diff, lambda0: context.lambda0, sliders: defaults.sliders, ...state },
      adjustConstants,
    );

    for (const key of ['lineHeight', 'pressing', 'width', 'tempo'] as const) {
      const moved = adjust(
        {
          eloDiff: context.features.elo_diff,
          lambda0: context.lambda0,
          sliders: { ...defaults.sliders, [key]: 100 },
          ...state,
        },
        adjustConstants,
      );
      // 템포는 λ 비율을 바꾸지 않으므로 Δ_eff 는 그대로다 — 대신 λ 합이 움직이고,
      // 그것이 무승부 몫 채널(03장 §6.2)로 확률에 도달한다
      const eloMoved = Math.abs(moved.effectiveEloDiff - baseline.effectiveEloDiff) > 1e-9;
      const sumMoved =
        Math.abs(moved.lambda[0] + moved.lambda[1] - (baseline.lambda[0] + baseline.lambda[1])) > 1e-9;
      expect(eloMoved || sumMoved, `${key} 가 산출을 전혀 움직이지 않는다`).toBe(true);
    }
  });

  it('배치 이동이 조정 계층에 반영된다 (배치 파생 지표)', () => {
    const context = getMatchContext(defaults.opponentMatchId);
    const state = presetState(defaults.formationId);
    const raised = state.positions.map((position, index) =>
      state.slotRoles[index] === 'DF' ? { ...position, y: position.y + 0.15 } : position,
    );

    const baseline = adjust(
      { eloDiff: context.features.elo_diff, lambda0: context.lambda0, sliders: defaults.sliders, ...state },
      adjustConstants,
    );
    const highLine = adjust(
      {
        eloDiff: context.features.elo_diff,
        lambda0: context.lambda0,
        sliders: defaults.sliders,
        ...state,
        positions: raised,
      },
      adjustConstants,
    );

    // 수비 라인을 올리면 자기 λ 가 오른다 (전진 압축 — 피처_정의서 §4.2)
    expect(highLine.lambda[0]).toBeGreaterThan(baseline.lambda[0]);
  });

  it('GK 슬롯에 FW 를 세우면 최대 페널티가 걸리되 λ 는 유한하게 유지된다 (FT-R6)', () => {
    const context = getMatchContext(defaults.opponentMatchId);
    const state = presetState(defaults.formationId);
    const playerRoles = [...state.playerRoles];
    playerRoles[0] = 'FW'; // GK 슬롯 — 사슬 거리 3 (최대)

    const result = adjust(
      {
        eloDiff: context.features.elo_diff,
        lambda0: context.lambda0,
        sliders: defaults.sliders,
        ...state,
        playerRoles,
      },
      adjustConstants,
    );

    // 수비진 이탈은 상대 득점 기대를 올린다
    expect(result.lambda[1]).toBeGreaterThan(context.lambda0[1]);
    expect(Number.isFinite(result.effectiveEloDiff)).toBe(true);
  });

  it('프리셋 4종 전부 기본 슬라이더에서 항등이다', () => {
    const context = getMatchContext(defaults.opponentMatchId);
    for (const formation of formations) {
      const result = adjust(
        {
          eloDiff: context.features.elo_diff,
          lambda0: context.lambda0,
          sliders: defaults.sliders,
          ...presetState(formation.id),
        },
        adjustConstants,
      );
      // 프리셋마다 기준선이 자기 자신이므로 z_pos = 0 — 어떤 프리셋을 골라도
      // "아직 아무것도 안 했다" 상태의 확률은 같다
      expect(result.lambda[0]).toBe(context.lambda0[0]);
      expect(result.lambda[1]).toBe(context.lambda0[1]);
    }
  });
});

describe('무승부 몫 채널 (03장 §6.2)', () => {
  const context = getMatchContext(defaults.opponentMatchId);
  const classifier = context.baseline;

  it('격자 확률의 합이 1이다', () => {
    const p = gridProbabilities(context.lambda0[0], context.lambda0[1], scoreGridConstants);
    expect(p.win + p.draw + p.lose).toBeCloseTo(1, 12);
  });

  it('기본 상태(λ_adj == λ⁰)에서는 분류기 출력 그대로다 — FT-R3 항등 유지', () => {
    const blended = blendDrawShare(classifier, context.lambda0, context.lambda0, scoreGridConstants);
    expect(blended.win).toBeCloseTo(classifier.win, 12);
    expect(blended.draw).toBeCloseTo(classifier.draw, 12);
    expect(blended.lose).toBeCloseTo(classifier.lose, 12);
  });

  it('사전 계산 확률(F08 첫 페인트)이 기본 컨텍스트의 분류기 출력과 일치한다', () => {
    expect(defaults.precomputed).not.toBeNull();
    expect(defaults.precomputed?.win).toBeCloseTo(classifier.win, 6);
    expect(defaults.precomputed?.draw).toBeCloseTo(classifier.draw, 6);
    expect(defaults.precomputed?.lose).toBeCloseTo(classifier.lose, 6);
  });

  it('템포를 올리면 무승부 몫이 줄고 승·패가 함께 커진다', () => {
    const state = presetState(defaults.formationId);
    const fast = adjust(
      {
        eloDiff: context.features.elo_diff,
        lambda0: context.lambda0,
        sliders: { ...defaults.sliders, tempo: 100 },
        ...state,
      },
      adjustConstants,
    );

    const blended = blendDrawShare(classifier, fast.lambda, context.lambda0, scoreGridConstants);
    // "지고 있을 때 오픈 게임으로 승부수"가 수식으로 재현되는 지점 (피처_정의서 §4.2)
    expect(blended.draw).toBeLessThan(classifier.draw);
    expect(blended.win).toBeGreaterThan(classifier.win);
    expect(blended.lose).toBeGreaterThan(classifier.lose);
  });

  it('어떤 조합에서도 확률 합이 1이고 (0,1) 내부에 머문다', () => {
    const state = presetState(defaults.formationId);
    for (const tempo of [0, 25, 50, 75, 100]) {
      for (const lineHeight of [0, 50, 100]) {
        const result = adjust(
          {
            eloDiff: context.features.elo_diff,
            lambda0: context.lambda0,
            sliders: { ...defaults.sliders, tempo, lineHeight },
            ...state,
          },
          adjustConstants,
        );
        const p = blendDrawShare(classifier, result.lambda, context.lambda0, scoreGridConstants);
        expect(p.win + p.draw + p.lose).toBeCloseTo(1, 12);
        for (const value of [p.win, p.draw, p.lose]) {
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThan(1);
        }
      }
    }
  });
});
