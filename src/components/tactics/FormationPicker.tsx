'use client';

import type { Formation, FormationId } from '@/types/data';

interface FormationPickerProps {
  formations: Formation[];
  value: FormationId;
  onChange(id: FormationId): void;
}

/**
 * 포메이션 프리셋 선택기 (F01)
 *
 * `<details>` 안에 접혀 있습니다 — 첫 화면 노출을 피치·슬라이더·예측 패널로 제한하는
 * 점진적 공개(F08 §3). `<details>`는 **JS 없이 열리고** 키보드·스크린리더 동작이 표준이라
 * SSR 폴백(F08-R5)에서도 살아 있습니다.
 *
 * 라디오 그룹으로 만든 이유: "4종 중 하나"라는 의미가 마크업에 들어가고, 방향키 순회가
 * 공짜로 따라옵니다.
 */
export function FormationPicker({ formations, value, onChange }: FormationPickerProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">포메이션 프리셋</legend>
      <div className="grid grid-cols-4 gap-2">
        {formations.map((formation) => {
          const active = formation.id === value;
          return (
            <label
              key={formation.id}
              className={[
                'flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-1 text-[15px] font-semibold transition-colors',
                active
                  ? 'border-brand-lit bg-brand text-text'
                  : 'border-line bg-surface-raised text-text-2 hover:text-text',
              ].join(' ')}
            >
              <input
                type="radio"
                name="formation"
                value={formation.id}
                checked={active}
                onChange={() => onChange(formation.id)}
                className="sr-only"
              />
              {formation.label}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-text-3">
        프리셋을 바꾸면 개별 배치는 표준 좌표로 돌아갑니다.
      </p>
    </fieldset>
  );
}
