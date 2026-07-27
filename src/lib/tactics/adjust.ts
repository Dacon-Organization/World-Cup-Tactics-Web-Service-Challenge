/**
 * 조정 계층 — 데이터에 없는 입력(슬라이더·배치)을 모델 입력으로 바꾸는 순수 함수
 *
 * 정본 순서: [구현규약 §5](../../../docs/planning/impl/version1.0/구현규약_v1_0.md) ·
 * 매핑표: [피처_정의서 §4](../../../docs/planning/ml/version1.0/피처_정의서_v1_0.md) · ADR-008
 *
 * **파이썬 참조 구현이 정본입니다** — `notebooks/03_model_baseline.py` §6.1의 `adjust()`.
 * 이 파일은 그 함수를 런타임(브라우저)으로 옮긴 것이고, 두 구현이 어긋나면
 * 학습 시 검증한 것과 사용자가 보는 것이 달라집니다. 그래서 대조 테스트가 의무입니다
 * (`adjust.test.ts` — `tests/fixtures/adjust-cases.json` 972건, 허용 오차 1e-9).
 *
 * ## 연산 순서를 바꾸지 마세요
 *
 * 아래 곱셈들은 **부동소수점 결과가 순서에 의존**합니다. 예를 들어
 * `lo *= exp(a) * exp(b)` 를 `lo *= exp(a); lo *= exp(b);` 로 풀면 마지막 자리가
 * 달라져 1e-9 대조가 깨집니다. 파이썬 원본과 같은 묶음·같은 순서를 유지합니다.
 */

import type { Position, PositionRole, PositionSlot, Sliders } from '@/types/data';

/**
 * `score-params.json`의 `adjust` 블록 + `score.lambdaCap`
 *
 * 값은 B3가 민감도 분석으로 캘리브레이션한 배포 상수입니다. 여기 하드코딩하지 않는 이유:
 * B6의 GBDT 재적합이 같은 파일을 덮어쓰기 때문입니다 (계약 동결 — 파일만 교체).
 */
export interface AdjustConstants {
  /** Elo 등가 번역 계수 */
  c: number;
  /** 포지션 적합도 페널티 계수 ρ (피처_정의서 §4.4) */
  rhoPenalty: number;
  deltaLine: number;
  deltaLineRisk: number;
  kappaLine: number;
  deltaPress: number;
  deltaPressAtt: number;
  kappaPress: number;
  deltaWidth: number;
  kappaWidth: number;
  deltaTempo: number;
  /** DF 평균 y가 이만큼 움직이면 z_pos = ±1 */
  posLineSpan: number;
  /** 필드 플레이어 x 표준편차 기준 */
  posWidthSpan: number;
  /** 총 조정 상한 (기준 대비 ±capRatio) — 피처_정의서 §4.5 */
  capRatio: number;
  /** 포지션 사슬 GK–DF–MF–FW 상의 좌표 */
  positionChain: Record<PositionRole, number>;
  /** λ 절대 상한 — FT-R4 */
  lambdaCap: number;
}

export interface AdjustInput {
  /** 조정 전 Elo 차이 */
  eloDiff: number;
  /** 기준 λ 쌍 [자기, 상대] */
  lambda0: readonly [number, number];
  sliders: Sliders;
  /** 현재 배치 — 인덱스가 곧 슬롯 번호 */
  positions: readonly Position[];
  /** 슬롯이 원래 요구하는 역할 */
  slotRoles: readonly PositionRole[];
  /** 그 자리에 실제로 선 선수의 포지션 — 적합도 페널티의 재료 */
  playerRoles: readonly PositionRole[];
  /** 프리셋 기준 배치 — 배치 파생 지표가 "기준 대비 얼마나 움직였나"를 재는 원점 */
  presetSlots: readonly PositionSlot[];
}

export interface AdjustOutput {
  /** Δ_eff — 분류기 입력 */
  effectiveEloDiff: number;
  /** 조정 후 λ 쌍 — 스코어 모델 입력 */
  lambda: [number, number];
}

/** numpy `np.mean` 과 같은 정의 */
function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** numpy `np.std` 와 같은 정의 — 모표준편차(ddof=0) */
function std(values: readonly number[]): number {
  const m = mean(values);
  let total = 0;
  for (const value of values) total += (value - m) * (value - m);
  return Math.sqrt(total / values.length);
}

function clip(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * 프리셋의 라인·폭 기준값 — 파이썬 `preset_shape()`
 *
 * `adjust()` 안에서 현재 배치에 대해 쓰는 것과 **같은 함수**로 계산합니다.
 * 배치가 프리셋과 동일하면 두 값이 비트 단위로 같아져 `z_pos`가 정확히 0이 되고,
 * FT-R3(기본 상태 항등)이 반올림 오차 없이 성립합니다.
 */
function shapeOf(
  xs: readonly number[],
  ys: readonly number[],
): { line: number; width: number } {
  return { line: mean(ys), width: std(xs) };
}

/** DF 슬롯의 y, GK 아닌 슬롯의 x — 배치 파생 지표의 재료 (피처_정의서 §4.3) */
function shapeInputs(
  points: readonly { x: number; y: number }[],
  roles: readonly PositionRole[],
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const role = roles[i];
    if (!point || !role) continue;
    if (role === 'DF') ys.push(point.y);
    if (role !== 'GK') xs.push(point.x);
  }
  return { xs, ys };
}

/**
 * 배치 파생 지표 `z_pos_line` · `z_pos_width` (구현규약 §5-2)
 *
 * `adjust()`와 F04 시각 프리뷰가 **같은 함수**를 씁니다. 프리뷰가 자체 산식을 갖고 있으면
 * "화면에 보이는 라인"과 "모델이 받는 라인"이 갈라집니다.
 */
export function placementZ(
  positions: readonly Position[],
  slotRoles: readonly PositionRole[],
  presetSlots: readonly PositionSlot[],
  k: Pick<AdjustConstants, 'posLineSpan' | 'posWidthSpan'>,
): { line: number; width: number } {
  const preset = shapeInputs(presetSlots, presetSlots.map((slot) => slot.role));
  const current = shapeInputs(positions, slotRoles);
  const base = shapeOf(preset.xs, preset.ys);
  const now = shapeOf(current.xs, current.ys);
  return {
    line: clip((now.line - base.line) / k.posLineSpan, -1, 1),
    width: clip((now.width - base.width) / k.posWidthSpan, -1, 1),
  };
}

/** 슬라이더 중심화 `z = (s − 50) / 50` — 기본 상태(50)에서 0 */
export function sliderZ(sliders: Sliders): Record<keyof Sliders, number> {
  return {
    lineHeight: (sliders.lineHeight - 50) / 50,
    pressing: (sliders.pressing - 50) / 50,
    width: (sliders.width - 50) / 50,
    tempo: (sliders.tempo - 50) / 50,
  };
}

/**
 * 조정 계층 7단계 (구현규약 §5)
 *
 * 1. 슬라이더 중심화 `z = (s − 50) / 50`
 * 2. 배치 파생 `z_pos_line`(DF 평균 y) · `z_pos_width`(필드 플레이어 x 표준편차)
 * 3. 이중 계상 방지 결합 `z = ½·z_slider + ½·z_pos` (압박·템포는 슬라이더 단독)
 * 4. 매핑표대로 λ 쌍에 이득 항(z)·리스크 항(z²)을 `exp()` 곱셈
 * 5. 포지션 적합도 페널티
 * 6. 총 조정 상한 ±capRatio 클램프
 * 7. Elo 등가 번역
 */
export function adjust(input: AdjustInput, k: AdjustConstants): AdjustOutput {
  const { eloDiff, lambda0, sliders, positions, slotRoles, playerRoles, presetSlots } = input;

  // --- 1. 슬라이더 중심화 — 기본 상태(전부 50)에서 z=0이므로 조정 계층은 항등 -------
  const z = sliderZ(sliders);

  // --- 2. 배치 파생 지표 -----------------------------------------------------
  const zPos = placementZ(positions, slotRoles, presetSlots, k);

  // --- 3. 이중 계상 방지 결합 — 배치도 라인·폭 정보를 담으므로 반씩 섞는다 ---------
  const zL = 0.5 * z.lineHeight + 0.5 * zPos.line;
  const zW = 0.5 * z.width + 0.5 * zPos.width;
  const zP = z.pressing;
  const zT = z.tempo;

  // --- 4. 매핑표 적용 (피처_정의서 §4.2) --------------------------------------
  let ls = lambda0[0];
  let lo = lambda0[1];

  // 라인 높이 — 전진 압축은 공격을 돕고, 높을수록 뒷공간이 열린다
  ls *= Math.exp(k.deltaLine * zL);
  lo *= Math.exp(k.kappaLine * zL ** 2) * Math.exp(k.deltaLineRisk * Math.max(zL, 0));
  // 압박 강도 — 상대 빌드업 저해 + 높은 회수 위치, 대가는 체력·압박 통과
  lo *= Math.exp(-k.deltaPress * zP) * Math.exp(k.kappaPress * zP ** 2);
  ls *= Math.exp(k.deltaPressAtt * zP);
  // 공격 폭 — 측면 공간 활용, 극단은 공격 단조화
  ls *= Math.exp(k.deltaWidth * zW) * Math.exp(-k.kappaWidth * zW ** 2);
  // 템포 — 양 팀 모두 기회 수가 늘어난다 (비율이 아니라 합을 움직인다)
  const tempo = Math.exp(k.deltaTempo * zT);
  ls *= tempo;
  lo *= tempo;

  // --- 5. 포지션 적합도 페널티 -----------------------------------------------
  // 공격진 이탈은 자기 득점 기대를 깎고, 수비진 이탈은 상대 득점 기대를 올린다
  let dAtt = 0;
  let dDef = 0;
  for (let i = 0; i < slotRoles.length; i += 1) {
    const slotRole = slotRoles[i];
    const playerRole = playerRoles[i];
    if (!slotRole || !playerRole) continue;
    const distance = Math.abs(k.positionChain[playerRole] - k.positionChain[slotRole]);
    if (slotRole === 'MF' || slotRole === 'FW') dAtt += distance;
    else dDef += distance;
  }
  ls *= Math.exp(-k.rhoPenalty * dAtt);
  lo *= Math.exp(k.rhoPenalty * dDef);

  // --- 6. 총 조정 상한 — 이걸 빼먹으면 양날 설계가 무의미해진다 (ADR-008) --------
  const lowBound = 1 - k.capRatio;
  const highBound = 1 + k.capRatio;
  ls = clip(ls, lambda0[0] * lowBound, lambda0[0] * highBound);
  lo = clip(lo, lambda0[1] * lowBound, lambda0[1] * highBound);
  ls = Math.min(ls, k.lambdaCap);
  lo = Math.min(lo, k.lambdaCap);

  // --- 7. Elo 등가 번역 — 조정 메커니즘은 하나(λ)이고 분류기는 그 번역본을 받는다 --
  const ratio = ls / lo / (lambda0[0] / lambda0[1]);
  return {
    effectiveEloDiff: eloDiff + k.c * 400 * Math.log10(ratio),
    lambda: [ls, lo],
  };
}
