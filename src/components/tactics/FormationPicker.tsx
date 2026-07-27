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
 * ## `<details>` 아코디언을 걷어낸 이유 (디자인 재설계 블록)
 *
 * 점진적 공개(F08 §3)를 아코디언으로 구현했더니, 프리셋 4개를 보려면 **펼치는 조작이 한 번
 * 더** 필요했습니다. 배타 선택지 4개는 접어서 아끼는 세로 공간(약 40px)보다 "지금 무엇이
 * 선택돼 있는가"를 항상 보여 주는 값이 큽니다. 접을 것은 이것이 아니라 예측 상세입니다.
 *
 * ## 라디오 그룹을 유지하는 이유
 *
 * "4종 중 하나"라는 의미가 마크업에 들어가고, 방향키 순회·`:checked`·그룹 라벨링이 전부
 * 표준으로 따라옵니다. 세그먼트처럼 보이게 만든 것은 표현일 뿐 의미는 라디오 그대로입니다.
 */
export function FormationPicker({ formations, value, onChange }: FormationPickerProps) {
  return (
    <fieldset className="min-w-0">
      {/* 프리셋 전환이 개별 배치를 버린다는 사실은 조작 **전에** 보여야 합니다 —
          되돌릴 수 없는 동작을 사후에 설명하는 것은 고지가 아닙니다 */}
      <legend className="mb-2 text-[14px] text-text-2">
        포메이션 <span className="text-text-3">· 바꾸면 개별 배치는 표준 좌표로</span>
      </legend>
      <div className="segmented">
        {formations.map((formation) => {
          const active = formation.id === value;
          return (
            <label key={formation.id} className="segment" data-active={active}>
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
    </fieldset>
  );
}
