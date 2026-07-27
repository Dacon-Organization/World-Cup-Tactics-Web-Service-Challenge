/**
 * F04 시각 프리뷰 — 슬라이더 조작을 ≤100ms 안에 피치에 그리는 파생값
 *
 * 근거: [F04 impl §4.1](../../../docs/planning/impl/version1.0/F04_전술_슬라이더_impl.md)
 *
 * **여기 계수는 표현용이며 모델 계수가 아닙니다.** 모델 계수의 정본은
 * `public/model/score-params.json` 입니다. 프리뷰는 "어느 방향으로 얼마나 움직였는가"만
 * 보이고, 그것이 확률로 번역되는 일은 조정 계층(`adjust.ts`)이 합니다.
 *
 * 다만 입력 z는 **모델이 실제로 보는 결합값**(슬라이더 ½ + 배치 ½, 피처_정의서 §4.3)을
 * 씁니다 — 드래그로 수비 라인을 올렸는데 가이드가 안 따라오면 화면이 거짓말을 합니다.
 */

import type { Sliders } from '@/types/data';

/** 프리뷰 강도 — 저성능 환경에서 한 단 내린다 (F04-R5) */
export type PreviewTier = 'full' | 'lines';

export interface PreviewGeometry {
  /** 수비 라인 가이드 (정규화 y) */
  lineY: number;
  /** 압박 영역 밴드 (정규화 y 구간) */
  pressBand: { bottom: number; top: number; opacity: number };
  /** 좌우 산개 가이드 (정규화 x 2개) */
  widthGuides: [number, number];
  /** 전진 화살표 개수 */
  arrowCount: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * 결합 z (−1~+1) → 프리뷰 도형
 *
 * 전부 `[0,1]`로 클램프합니다 — 슬라이더가 극단이어도 가이드가 피치 밖으로 나가지 않습니다.
 */
export function previewGeometry(z: {
  line: number;
  pressing: number;
  width: number;
  tempo: number;
}): PreviewGeometry {
  const lineY = clamp01(0.3 + 0.22 * z.line);
  const halfBand = 0.1 + 0.1 * ((z.pressing + 1) / 2);
  const spread = 0.18 + 0.16 * z.width;

  return {
    lineY,
    pressBand: {
      bottom: clamp01(lineY - halfBand),
      top: clamp01(lineY + halfBand),
      opacity: 0.06 + 0.1 * ((z.pressing + 1) / 2),
    },
    widthGuides: [clamp01(0.5 - spread), clamp01(0.5 + spread)],
    arrowCount: 2 + Math.round(((z.tempo + 1) / 2) * 4),
  };
}

/** 슬라이더 z와 배치 z를 F04 프리뷰 입력으로 결합 — 피처_정의서 §4.3과 같은 가중 */
export function previewZ(
  sliderZ: Record<keyof Sliders, number>,
  placement: { line: number; width: number },
): { line: number; pressing: number; width: number; tempo: number } {
  return {
    line: 0.5 * sliderZ.lineHeight + 0.5 * placement.line,
    width: 0.5 * sliderZ.width + 0.5 * placement.width,
    // 압박·템포는 배치에서 유도되지 않으므로 슬라이더 단독 (피처_정의서 §4.3)
    pressing: sliderZ.pressing,
    tempo: sliderZ.tempo,
  };
}

/** 프리뷰 예산 (P5) — 이 시간을 넘으면 "직접 조작감"이 깨진다 */
export const PREVIEW_BUDGET_MS = 100;
const SAMPLE_WINDOW = 5;
const DEGRADE_THRESHOLD = 3;

/**
 * 저성능 판정 (F04-R5)
 *
 * 최근 `SAMPLE_WINDOW`개 중 `DEGRADE_THRESHOLD`개 이상이 예산을 넘으면 강등합니다.
 * 1회 초과로 강등하지 않는 이유: 첫 조작은 폰트·레이아웃 때문에 늘 느립니다.
 * 한 번 강등되면 되돌리지 않습니다 — 켰다 껐다 하면 그 자체가 산만합니다.
 */
export function shouldDegradePreview(samples: readonly number[]): boolean {
  const recent = samples.slice(-SAMPLE_WINDOW);
  return recent.filter((duration) => duration > PREVIEW_BUDGET_MS).length >= DEGRADE_THRESHOLD;
}

/** 슬라이더 질적 라벨 — 색·수치 단독 의존 금지 (P5 · DESIGN.md §6) */
export function qualitativeLabel(value: number): string {
  if (value <= 20) return '매우 낮음';
  if (value <= 40) return '낮음';
  if (value < 60) return '보통';
  if (value < 80) return '높음';
  return '매우 높음';
}

/** 감독 용어 라벨 (ADR-002 · F04 §3) */
export const SLIDER_LABEL: Record<keyof Sliders, string> = {
  lineHeight: '라인 높이',
  pressing: '압박 강도',
  width: '공격 폭',
  tempo: '템포',
};

/** 각 슬라이더가 무엇을 바꾸는지 — 조작 전에 읽히는 한 줄 (P5 점진적 공개) */
export const SLIDER_HINT: Record<keyof Sliders, string> = {
  lineHeight: '올리면 전진 압축, 대신 뒷공간이 열립니다',
  pressing: '올리면 상대 빌드업을 막고, 대신 체력을 씁니다',
  width: '올리면 측면을 넓게 쓰고, 극단은 공격이 단조로워집니다',
  tempo: '올리면 양 팀 모두 기회가 늘어납니다',
};

export const SLIDER_KEYS: readonly (keyof Sliders)[] = [
  'lineHeight',
  'pressing',
  'width',
  'tempo',
];
