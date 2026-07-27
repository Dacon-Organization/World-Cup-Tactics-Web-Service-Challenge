/**
 * 시드 난수 — 같은 전술은 항상 같은 밴드를 낳는다
 *
 * 근거: [F06 impl §4.3](../../../docs/planning/impl/version1.0/F06_몬테카를로_시뮬레이션_impl.md)
 *
 * `Math.random()`을 쓰면 슬라이더를 올렸다 내려 원위치시켰을 때 밴드 폭이 미묘하게
 * 달라집니다. 사용자는 그것을 "내 조작 때문"으로 읽지만 실제로는 난수 때문입니다.
 * 결정론은 그 오독을 없애고, 단위 테스트의 수렴 검증을 재현 가능하게 만듭니다.
 *
 * 불확실성을 축소하는 것이 아닙니다 — 밴드 **폭**은 여전히 반복 횟수가 결정하며,
 * 화면에 표기되는 반복 횟수도 실제 값입니다.
 */

/**
 * mulberry32 — 32비트 상태 PRNG
 *
 * 몬테카를로 표본 추출에 필요한 것은 암호학적 안전성이 아니라 **균등성과 재현성**입니다.
 * 상태 4바이트·연산 몇 개짜리 생성기가 25,000회 반복에서 병목이 되지 않으면서
 * 주기(2³²)가 반복 수보다 다섯 자릿수 크므로 충분합니다.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32비트 — 문자열 → 시드
 *
 * 해시 충돌이 나면 서로 다른 두 전술이 같은 난수열을 쓰게 되는데, 각 전술의 확률 `p`가
 * 다르므로 결과도 다릅니다. 즉 충돌은 품질 문제가 아니라 무해합니다.
 */
export function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 컨텍스트 → 시드
 *
 * 부동소수점을 그대로 문자열화하면 `0.30000000000000004` 같은 값이 섞여 논리적으로 같은
 * 전술이 다른 시드를 받습니다. 1e-6 자리에서 정수화해 그 흔들림을 지웁니다 — 확률에
 * 영향을 줄 수 없는 자리입니다.
 */
export function seedFrom(
  matchId: string,
  effectiveEloDiff: number,
  lambda: readonly [number, number],
  iterations: number,
): number {
  const q = (value: number): number => Math.round(value * 1e6);
  return hash32(
    `${matchId}|${q(effectiveEloDiff)}|${q(lambda[0])}|${q(lambda[1])}|${iterations}`,
  );
}
