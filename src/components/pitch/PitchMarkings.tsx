import { PITCH_GEOMETRY } from '@/lib/tactics/geometry';

/**
 * 피치 마킹 — 자체 제작 SVG 도형
 *
 * 외부 피치 이미지·에셋을 쓰지 않습니다 (DESIGN.md §7 — 라이선스 방어).
 * 비율은 DESIGN.md §3.3이 기획서 그림 생성 코드(`make_figures.py:draw_pitch`)에서
 * 역추출한 값이고, `geometry.ts`가 그것을 viewBox 단위로 환산합니다.
 *
 * 훅이 없는 순수 컴포넌트라 Server/Client 어느 쪽에서 렌더해도 같은 HTML이 나옵니다.
 */
export function PitchMarkings() {
  const { touchline, halfwayY, centerCircle, penaltyBox, goalBox, lineWidth, lineOpacity } =
    PITCH_GEOMETRY;
  // 자기 진영 박스는 아래 터치라인에 붙는다 — 위에서부터의 좌표로 환산
  const bottomEdge = touchline.y + touchline.height;
  const bottomPenaltyY = bottomEdge - penaltyBox.height;
  const bottomGoalY = bottomEdge - goalBox.height;

  return (
    <g
      fill="none"
      strokeWidth={lineWidth}
      /**
       * 라인 색·불투명도가 토큰인 이유 — 다크와 라이트가 **둘 다 동결 그림에 있다**
       *
       * 다크: f00 표지·f13 공유 카드의 `draw_pitch` 기본값 (흰 라인 alpha 0.55)
       * 라이트: f10 와이어프레임의 `draw_board` (바탕 `#F7FAF8` + `GREEN` 라인 alpha 0.8)
       *
       * `lineOpacity`는 다크값이자 토큰이 없을 때의 폴백입니다.
       */
      style={{
        stroke: 'var(--color-pitch-line)',
        strokeOpacity: `var(--pitch-line-opacity, ${lineOpacity})`,
      }}
      // 마킹은 장식이다 — 정보는 토큰·라벨이 전달하므로 보조기술에서 숨긴다
      aria-hidden="true"
    >
      <rect x={touchline.x} y={touchline.y} width={touchline.width} height={touchline.height} />
      <line x1={touchline.x} y1={halfwayY} x2={touchline.x + touchline.width} y2={halfwayY} />
      <circle cx={centerCircle.cx} cy={centerCircle.cy} r={centerCircle.r} />

      {/* 상대 진영 (위) */}
      <rect x={penaltyBox.x} y={touchline.y} width={penaltyBox.width} height={penaltyBox.height} />
      <rect x={goalBox.x} y={touchline.y} width={goalBox.width} height={goalBox.height} />

      {/* 자기 진영 (아래) */}
      <rect
        x={penaltyBox.x}
        y={bottomPenaltyY}
        width={penaltyBox.width}
        height={penaltyBox.height}
      />
      <rect x={goalBox.x} y={bottomGoalY} width={goalBox.width} height={goalBox.height} />
    </g>
  );
}
