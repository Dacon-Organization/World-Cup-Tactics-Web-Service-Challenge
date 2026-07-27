/**
 * 계약 벡터 조립 — 분류기 입력 10원소
 *
 * 근거: [F05 impl §4.5](../../../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md) ·
 * 계약 동결: `public/model/score-params.json`의 `model.featureOrder`
 *
 * **원소 순서를 하드코딩하지 않습니다.** `featureOrder`를 순회해 읽는 이유는, B6의 GBDT
 * 재적합이 `score-params.json`만 덮어쓰는 것으로 끝나야 하기 때문입니다(계약 동결).
 * 순서를 코드에 박으면 그 약속이 깨집니다.
 */

import type { MatchContext } from '@/lib/tactics/constants';

/** 런타임에 변하는 유일한 원소. 조정 계층의 Δ_eff가 이 자리에 들어간다 */
const RUNTIME_FEATURE = 'elo_diff';

export function buildFeatureVector(
  context: MatchContext,
  effectiveEloDiff: number,
  featureOrder: readonly string[],
): Float32Array {
  const source: Record<string, number> = { ...context.features, [RUNTIME_FEATURE]: effectiveEloDiff };
  const vector = new Float32Array(featureOrder.length);

  for (let i = 0; i < featureOrder.length; i += 1) {
    const name = featureOrder[i] as string;
    const value = source[name];
    // 결측을 0으로 채우면 "그 피처가 평균값"이라는 뜻이 되어 조용히 다른 경기를 예측한다.
    // Zod가 이미 10개 키를 강제하므로 여기 도달하면 계약 파일과 코드가 어긋난 것이다
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`계약 벡터 원소가 없거나 유한하지 않습니다: ${name}`);
    }
    vector[i] = value;
  }

  return vector;
}
