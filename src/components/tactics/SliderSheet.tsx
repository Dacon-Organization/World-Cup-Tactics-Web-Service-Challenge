'use client';

import {
  SLIDER_HINT,
  SLIDER_KEYS,
  SLIDER_LABEL,
  qualitativeLabel,
} from '@/lib/tactics/preview';
import type { SliderKey, Sliders } from '@/types/data';

interface SliderSheetProps {
  sliders: Sliders;
  onChange(key: SliderKey, value: number): void;
}

/**
 * 전술 슬라이더 4종 (F04)
 *
 * ## 네이티브 `<input type="range">`를 쓰는 이유
 *
 * 커스텀 슬라이더는 키보드(방향키·Home·End·PageUp/Down)·스크린리더(`aria-valuetext`)·
 * **트랙 밖에서 손을 뗐을 때의 값 확정(F04-R6)** 을 전부 다시 만들어야 합니다. 네이티브는
 * 이 셋이 이미 정확하고, DESIGN.md §4의 시각 규격은 CSS로 맞출 수 있습니다.
 *
 * 터치 타겟은 `input` 높이 44px, 시각 트랙은 6px, 노브는 14px입니다 — 히트 영역과 시각
 * 크기를 분리해 "얇아 보이지만 누르기 쉬운" 상태를 만듭니다 (P5 ≥1cm).
 *
 * `onInput`과 `onChange`를 모두 받는 이유: React의 `onChange`는 연속 입력에서 발화하지만,
 * 브라우저 네이티브 `change`(손을 뗄 때)까지 함께 처리해야 F04-R6에서 값이 유실되지 않습니다.
 *
 * ## 설명문을 상시 노출에서 뺀 이유 (디자인 재설계 블록)
 *
 * 슬라이더 4종이 각각 라벨·트랙·설명 3줄을 차지해 그룹 높이가 471px였습니다. 슬라이더가
 * 화면 밖으로 밀려난 원인의 절반이 이 설명문입니다. 설명은 **처음 한 번 읽으면 되는 정보**고
 * 질적 라벨("높음"·"매우 빠름")은 조작할 때마다 필요한 정보라, 전자만 접습니다.
 *
 * 접어도 `aria-describedby`는 그대로 가리킵니다 — `hidden` 요소도 접근성 이름·설명 계산에
 * 쓰이므로 스크린리더 사용자에게는 **접기 전과 동일하게** 읽힙니다. 설명이 사라진 것이
 * 아니라 시각적으로만 접힌 것입니다.
 */
export function SliderSheet({ sliders, onChange }: SliderSheetProps) {
  return (
    <div className="flex flex-col gap-2">
      {SLIDER_KEYS.map((key) => {
        const value = sliders[key];
        const qualitative = qualitativeLabel(value);
        return (
          <div key={key} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`slider-${key}`} className="text-[14px] text-text-2">
                {SLIDER_LABEL[key]}
              </label>
              {/* 색·위치 단독으로 의미를 전달하지 않는다 — 질적 라벨을 항상 병기 */}
              <span className="text-[14px] font-semibold text-text tabular-nums">
                {qualitative}
              </span>
            </div>
            <input
              id={`slider-${key}`}
              className="tactic-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              // 크롬·사파리에는 채움 의사요소가 없어 트랙 그라디언트로 만든다 (globals.css)
              style={{ '--fill': `${value}%` } as React.CSSProperties}
              aria-valuetext={`${qualitative} (${value})`}
              aria-describedby={`slider-hint-${key}`}
              onInput={(event) => onChange(key, Number(event.currentTarget.value))}
              onChange={(event) => onChange(key, Number(event.currentTarget.value))}
            />
            <p id={`slider-hint-${key}`} hidden>
              {SLIDER_HINT[key]}
            </p>
          </div>
        );
      })}

      <details className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-[13px] text-text-3">
          슬라이더가 무엇을 바꾸나요?
        </summary>
        <dl className="mt-1 flex flex-col gap-2">
          {SLIDER_KEYS.map((key) => (
            <div key={key}>
              <dt className="text-[13px] font-semibold text-text-2">{SLIDER_LABEL[key]}</dt>
              <dd className="text-[13px] text-text-3">{SLIDER_HINT[key]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
