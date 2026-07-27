import { PITCH_VIEWBOX } from '@/lib/tactics/geometry';
import type { PreviewGeometry, PreviewTier } from '@/lib/tactics/preview';

interface TacticsPreviewProps {
  geometry: PreviewGeometry;
  tier: PreviewTier;
}

/** 정규화 y → viewBox y (위가 상대 진영) */
function vy(y: number): number {
  return (1 - y) * PITCH_VIEWBOX.height;
}

/**
 * F04 시각 프리뷰 — 슬라이더 조작이 피치에 즉시 보이는 층
 *
 * **`transition`을 넣지 않습니다** — DESIGN.md §5: 슬라이더 프리뷰는 "즉시(transition 없음)"이고,
 * 전환을 걸면 100ms 예산을 애니메이션이 먹습니다.
 *
 * `tier === 'lines'`는 저성능 강등 상태(F04-R5)입니다. 음영·화살표를 끄고 선만 남기되
 * **슬라이더 값 자체는 전혀 건드리지 않습니다** — "효과 축소, 값은 보존".
 *
 * 오버레이 색이 `--color-brand-lit`이 아니라 `--color-pitch-accent`인 이유: 라이트 모드의
 * 피치는 f10 와이어프레임대로 밝은 바탕(`#F7FAF8`)이라, 그 위에 `#7FB3E0`을 0.5~0.75
 * 불투명도로 얹으면 거의 보이지 않습니다. 피치 위 강조는 바탕 밝기를 따라가야 합니다.
 */
export function TacticsPreview({ geometry, tier }: TacticsPreviewProps) {
  const { lineY, pressBand, widthGuides, arrowCount } = geometry;
  const full = tier === 'full';

  const bandTop = vy(pressBand.top);
  const bandHeight = Math.max(0, vy(pressBand.bottom) - bandTop);

  return (
    <g aria-hidden="true">
      {full && (
        <rect
          x={0}
          y={bandTop}
          width={PITCH_VIEWBOX.width}
          height={bandHeight}
          fill="var(--color-pitch-accent)"
          opacity={pressBand.opacity}
        />
      )}

      {/* 수비 라인 가이드 */}
      <line
        x1={2}
        y1={vy(lineY)}
        x2={PITCH_VIEWBOX.width - 2}
        y2={vy(lineY)}
        stroke="var(--color-pitch-accent)"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.75}
      />

      {/* 공격 폭 가이드 */}
      {widthGuides.map((x) => (
        <line
          key={x}
          x1={x * PITCH_VIEWBOX.width}
          y1={vy(lineY)}
          x2={x * PITCH_VIEWBOX.width}
          y2={vy(0.95)}
          stroke="var(--color-pitch-accent)"
          strokeWidth={0.8}
          strokeDasharray="3 4"
          opacity={0.5}
        />
      ))}

      {/* 템포 — 전진 화살표 밀도 */}
      {full &&
        Array.from({ length: arrowCount }, (_, index) => {
          const x = ((index + 1) / (arrowCount + 1)) * PITCH_VIEWBOX.width;
          const base = vy(lineY + 0.06);
          return (
            <path
              key={index}
              d={`M ${x} ${base} l 0 -7 m -2.4 2.4 l 2.4 -2.4 l 2.4 2.4`}
              stroke="var(--color-pitch-accent)"
              strokeWidth={0.9}
              fill="none"
              opacity={0.55}
            />
          );
        })}
    </g>
  );
}
