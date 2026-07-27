/**
 * 배포 모델 상수 로드 — `public/model/score-params.json`
 *
 * B3가 동결한 계약 파일입니다. **B6의 GBDT 재적합은 같은 스키마로 이 파일만 덮어씁니다** —
 * `featureOrder`·`classOrder`를 바꾸지 않는 것이 계약 동결의 내용이므로, 이 파서가
 * 통과하는 한 프론트엔드는 재작업되지 않습니다.
 *
 * import 시점에 Zod로 파싱하므로 파일이 깨져 있으면 **빌드가 실패**합니다 (구현규약 §6 —
 * 외부 경계는 `as` 캐스팅이 아니라 스키마로 좁힌다). 조정 계층이 잘못된 상수로
 * 조용히 도는 경로를 만들지 않습니다.
 */

import { z } from 'zod';
import scoreParamsJson from '../../../public/model/score-params.json';
import type { AdjustConstants } from './adjust';
import type { ScoreGridConstants } from './blend';
import type { MatchId } from '@/types/data';

const positionChainSchema = z.object({
  GK: z.number(),
  DF: z.number(),
  MF: z.number(),
  FW: z.number(),
});

const adjustBlockSchema = z.object({
  c: z.number(),
  rhoPenalty: z.number(),
  deltaLine: z.number(),
  deltaLineRisk: z.number(),
  kappaLine: z.number(),
  deltaPress: z.number(),
  deltaPressAtt: z.number(),
  kappaPress: z.number(),
  deltaWidth: z.number(),
  kappaWidth: z.number(),
  deltaTempo: z.number(),
  posLineSpan: z.number().positive(),
  posWidthSpan: z.number().positive(),
  capRatio: z.number().positive(),
  positionChain: positionChainSchema,
  drawShiftClamp: z.tuple([z.number(), z.number()]),
});

const contextSchema = z.object({
  features: z.object({
    elo_diff: z.number(),
    self_form_pts: z.number(),
    self_form_gd: z.number(),
    self_exp_apps: z.number(),
    self_host: z.number(),
    opp_form_pts: z.number(),
    opp_form_gd: z.number(),
    opp_exp_apps: z.number(),
    opp_host: z.number(),
    stage_ko: z.number(),
  }),
  lambda0: z.tuple([z.number().positive(), z.number().positive()]),
  baseline: z.object({
    win: z.number(),
    draw: z.number(),
    lose: z.number(),
  }),
});

const scoreParamsSchema = z.object({
  version: z.string(),
  model: z.object({
    inputName: z.string(),
    outputName: z.string(),
    // 계약 동결의 핵심 — 이 두 배열이 바뀌면 B4가 만든 입력이 의미를 잃는다
    featureOrder: z.array(z.string()).length(10),
    classOrder: z.tuple([z.literal('win'), z.literal('draw'), z.literal('lose')]),
  }),
  score: z.object({
    rho: z.number(),
    gamma: z.number(),
    gridMax: z.number().int().positive(),
    lambdaCap: z.number().positive(),
  }),
  fallback: z.object({ dHat: z.number() }),
  adjust: adjustBlockSchema,
  contexts: z.record(z.string(), contextSchema),
});

export const scoreParams = scoreParamsSchema.parse(scoreParamsJson);

/** 조정 계층 상수 — `adjust` 블록 + `score.lambdaCap`(FT-R4) */
export const adjustConstants: AdjustConstants = {
  ...scoreParams.adjust,
  lambdaCap: scoreParams.score.lambdaCap,
};

/** 스코어 격자 상수 — 무승부 몫 채널이 쓴다 */
export const scoreGridConstants: ScoreGridConstants = {
  rho: scoreParams.score.rho,
  gamma: scoreParams.score.gamma,
  gridMax: scoreParams.score.gridMax,
  drawShiftClamp: scoreParams.adjust.drawShiftClamp,
};

export type MatchContext = z.infer<typeof contextSchema>;

/**
 * 상대별 런타임 컨텍스트
 *
 * 계약 벡터 10원소 중 런타임에 변하는 것은 `elo_diff` 하나이고(조정 계층이 Δ_eff로
 * 바꿔 넣는다), 나머지 9개는 상대별 상수라 이 파일에 실려 옵니다 (03장 §7).
 */
export function getMatchContext(matchId: MatchId): MatchContext {
  const context = scoreParams.contexts[matchId];
  // 여기 도달하면 score-params.json 과 matches.json 이 어긋난 것이다. 기본값으로
  // 조용히 넘어가면 "다른 상대의 확률"을 보여 주게 된다 (구현규약 §6 — 침묵 실패 금지).
  if (!context) {
    throw new Error(`score-params.json 에 상대 컨텍스트가 없습니다: ${matchId}`);
  }
  return context;
}
