# F04 구현 명세 — 전술 슬라이더 4종

> 대응 계약: [features/F04](../../features/version1.0/F04_전술_슬라이더.md) ·
> 매핑 정본: [피처_정의서 §4](../../ml/version1.0/피처_정의서_v1_0.md) · [ADR-008](../../decisions/ADR-008-슬라이더매핑.md)
>
> **B4 범위 경계**: 이 블록은 슬라이더 → **시각 프리뷰**(≤100ms) → **debounce 커밋** →
> **조정 계층 산출**(`adjust.ts`)까지입니다. 산출된 `TacticContext`를 소비해 확률을
> 갱신하는 것은 **B5**(F05·F06 Worker)입니다. F04-R2의 "시뮬레이션 자동 실행"은
> 커밋 지점까지 배선하고 소비자를 B5가 붙입니다 — §5에 미완 경로를 명시합니다.

---

## 1. 계약 재확인

| ID | 요구사항 | 구현 지점 |
|---|---|---|
| F04-R1 | WHEN 값 변경 → 100ms 내 시각 프리뷰 반영 | `onInput` → `setSlider` → `TacticsPreview` 즉시 리렌더. **transition 없음** (DESIGN.md §5 — transition을 넣으면 예산을 쓴다) |
| F04-R2 | WHEN 조작 종료(debounce) → 시뮬레이션 자동 실행 | `scheduleCommit(160ms)` → `adjust()` → `predictionStore.setContext()` · **소비자는 B5** |
| F04-R3 | WHILE 시뮬레이션 중 → 추가 조작 허용, 완료 시 최신 값 재실행 | 슬라이더에 `disabled` 상태 없음. 스케줄러가 항상 최신 스냅샷만 보관 |
| F04-R4 | IF 진행 중 값 재변경 → 진행 계산 취소·최신 값 재시작 | `scheduleCommit`이 이전 타이머를 `clearTimeout` + `generation` 카운터 증가 (구식 결과 폐기) |
| F04-R5 | IF 프리뷰가 100ms 초과 → 효과 단계적 축소, 값 반영은 유지 | `previewTier` 강등 (`full` → `lines`) — 값(`sliders`)은 절대 건드리지 않는다 |
| F04-R6 | IF 터치가 트랙을 벗어나며 끝나면 → 마지막 유효 값 확정 | `<input type="range">` 네이티브 동작 + `onChange`에서 재확정. 값 유실 경로 없음 |

**GWT** — 슬라이더 1개 조작 → 100ms 내 피치 시각 변화 / 4종 각각 조작 → 확률 변화
(**B5에서 관측 · B4는 `TacticContext`가 4종 모두에 반응하는 것을 단위 테스트로 대체**) /
최종 표시는 항상 마지막 값 기준 / 터치 타겟 ≥1cm.

## 2. 컴포넌트 트리

```
src/components/tactics/SliderSheet.tsx     (Client)
└─ TacticSlider × 4   — <input type="range" min=0 max=100 step=1>
src/components/pitch/TacticsPreview.tsx    (순수 SVG — 피치 <svg> 안)
```

```typescript
interface TacticSliderProps {
  slotKey: SliderKey;
  label: string;            // 감독 용어 — "라인 높이"
  value: number;            // 0~100
  qualitative: string;      // "낮음" | "보통" | "높음" (P5 질적 라벨 병기)
  onChange(key: SliderKey, value: number): void;
}
```

**네이티브 `<input type="range">`를 쓰는 이유** `[설계 결정]` — 커스텀 슬라이더는 키보드
(방향키·Home·End·PageUp/Down)·스크린리더(`role="slider"` + `aria-valuetext`)·터치 트랙
이탈 처리(F04-R6)를 전부 직접 구현해야 합니다. 네이티브는 이 셋이 이미 정확하고,
DESIGN.md §4의 규격(트랙 `--track`, 채움 `--brand`, 노브 `--brand-lit` 14px)은
`::-webkit-slider-thumb`·`::-moz-range-thumb`로 맞출 수 있습니다.

**터치 타겟** — 노브는 시각 14px이되 `input` 높이를 44px로 두고 트랙만 6px로 그립니다.
시각 크기와 히트 영역을 분리하는 표준 기법입니다.

## 3. 상태

| 값 | 위치 |
|---|---|
| `sliders` (4종 0~100) | `tacticsStore` — F13 URL 인코딩 대상 |
| `previewTier: 'full' \| 'lines'` | `TacticsBoard` 로컬 — 성능 파생값, 스토어 아님 |
| `context: TacticContext \| null` | `predictionStore` — **B4가 쓰고 B5가 읽는다** |

**파생값을 스토어에 넣지 않습니다** (구현규약 §3) — `z = (s-50)/50`도, 프리뷰 좌표도
전부 순수 함수가 매 렌더 계산합니다. 값이 두 곳에 있으면 어긋납니다.

## 4. 알고리즘·수식

### 4.1 시각 프리뷰 (`lib/tactics/preview.ts` — 순수)

프리뷰는 **모델이 실제로 보는 값**을 그립니다. 슬라이더 단독이 아니라 배치와 결합된
`z_line`·`z_width`(피처_정의서 §4.3)를 쓰므로, 드래그로 수비 라인을 올려도 가이드가 따라옵니다.

| 슬라이더 | 프리뷰 | 산식 (정규화 좌표) |
|---|---|---|
| 라인 높이 | 수비 라인 가이드 (가로 파선) | `y = 0.30 + 0.22 · z_line` |
| 압박 강도 | 압박 영역 음영 (가로 밴드) | 중심 `y_line`, 반높이 `0.10 + 0.10 · (z_press+1)/2`, opacity `0.06 + 0.10 · (z_press+1)/2` |
| 공격 폭 | 좌우 산개 가이드 (세로 파선 2개) | `x = 0.5 ± (0.18 + 0.16 · z_width)` |
| 템포 | 전진 화살표 밀도 | `n = 2 + round((z_tempo+1)/2 · 4)` → 2~6개 |

계수는 **표현용이며 모델 계수가 아닙니다** `[설계 결정]` — 모델 계수는 `score-params.json`이
정본입니다. 프리뷰가 모델을 대변한다고 주장하지 않고, "어느 방향으로 움직였는가"만 보입니다.

### 4.2 debounce 커밋 (`lib/tactics/scheduler.ts` — 순수 + 타이머)

```
COMMIT_DEBOUNCE_MS = 160     // 구현규약 §4 — 100ms 프리뷰 예산 이후 [설계 결정]
```

```typescript
interface CommitScheduler {
  schedule(snapshot: TacticSnapshot): void;  // 이전 예약 취소 후 재예약
  cancel(): void;
  readonly generation: number;               // 구식 결과 식별자 (F04-R4)
}
```

- `schedule`은 **항상 마지막 스냅샷만** 보관합니다 (F04-R3 "마지막 값 승리").
- `generation`은 호출마다 증가합니다. B5의 Worker 응답이 자기 `generation`과 다르면
  **구식 결과이므로 버립니다** — F04-R4의 "구식 결과 표시 금지"를 값으로 강제하는 장치입니다.
- 드래그 커밋(F02)·클릭-클릭(F03)도 **같은 스케줄러**를 씁니다 (F02 §8 "F04와 동일 debounce 경로").

### 4.3 조정 계층 호출

```typescript
const { effectiveEloDiff, lambda } = adjust(
  { eloDiff, lambda0, sliders, positions, roles },  // roles = 슬롯 역할 + 선수 포지션
  adjustConstants,                                   // score-params.json의 adjust 블록
);
```

7단계 순서·수식은 [`adjust.ts`](../../../../src/lib/tactics/adjust.ts) 주석과
구현규약 §5, 그리고 B3 파이썬 참조 구현(`notebooks/03_model_baseline.py` §6.1)에 있습니다.
**이 문서는 순서를 재기술하지 않습니다** — 세 곳에 적으면 어긋납니다.

### 4.4 프리뷰 저하 판정 (F04-R5)

```typescript
shouldDegradePreview(samples: number[]): boolean   // 최근 5개 중 3개 이상이 > 100ms
```

`onInput` 시각과 다음 페인트(`requestAnimationFrame`) 사이를 측정해 샘플로 쌓습니다.
강등되면 음영·화살표를 끄고 **선만** 남깁니다. `sliders` 값은 그대로이므로 모델 입력은
전혀 달라지지 않습니다 — "효과 축소, 값은 보존"(F04 §6).

## 5. 실패 경로

| 계약 | 코드 분기 |
|---|---|
| **F04-R4** 진행 중 재변경 | `scheduleCommit`이 `clearTimeout(prev)` + `generation++`. B5가 붙기 전까지 소비자가 없으므로 **B4에서는 구식 결과가 표시될 경로 자체가 존재하지 않는다**(확률이 정적). 스케줄러의 `generation`은 B5가 즉시 쓸 수 있게 지금 배선한다 |
| **F04-R5** 저성능 | `previewTier === 'lines'` → `TacticsPreview`가 음영 `<rect>`와 화살표 `<path>`를 렌더하지 않는다. 한 번 강등되면 세션 동안 유지 (진동 방지) |
| **F04-R6** 트랙 이탈 | `onInput`(연속) + `onChange`(확정) 둘 다 `setSlider`. 포인터가 트랙 밖에서 끝나도 브라우저가 `change`를 발화하므로 마지막 값이 확정된다 |
| `adjust` 입력 결측 | `lambda0`·`eloDiff`는 `score-params.json`의 상대별 컨텍스트에서 옵니다. 파싱은 Zod — 깨져 있으면 **빌드가 실패**하고 런타임에 도달하지 않습니다 (구현규약 §6) |
| 프리뷰 좌표가 피치 밖 | `previewGeometry`가 `[0,1]`로 클램프. 슬라이더가 극단이어도 가이드가 피치 밖으로 나가지 않는다 |
| **미완 (B5 인계)** | `predictionStore.context`를 소비하는 Worker가 아직 없다 → 확률은 `defaults.precomputed`에 고정. **F04 GWT 2번("4종 각각 조작 시 확률이 변한다")은 B4에서 미충족**이며, B4는 `adjust` 단위 테스트로 4종 각각이 `effectiveEloDiff` 또는 `lambda`를 움직인다는 것까지 보장한다 |

## 6. 테스트

| 층 | 대상 |
|---|---|
| 정합 (Vitest) | `adjust.ts` ↔ `tests/fixtures/adjust-cases.json` **972건 · 오차 1e-9** (구현규약 §7) |
| 단위 | FT-R3 항등 — 기본 상태에서 `lambda == lambda0` · `effectiveEloDiff == eloDiff` |
| 단위 | 총 조정 상한 — 전 슬라이더 극단에서 `λ`가 `λ⁰`의 ±30% 안 (클램프 누락 회귀 방지) |
| 단위 | **4종 각각 단독 조작이 산출을 움직인다** (F04 GWT 2의 B4 대체 검증) |
| 단위 | `previewGeometry` — 극단값에서도 `[0,1]` 이탈 0 · `shouldDegradePreview` 임계 |
| 단위 | `CommitScheduler` — 연속 호출 시 마지막 스냅샷만 · `generation` 단조 증가 |
| 실기기 (B8) | 저사양 기기 프리뷰 지연 실측 · 노브 터치 타겟 ≥1cm |

## 7. 근거 태그 회수

| 태그 | 내용 | 이관 |
|---|---|---|
| `[설계 결정]` | 프리뷰 표현 계수 (0.30/0.22/0.18/0.16 등) | B8 — "움직이는 게 보이는가"만 확인. 모델 값과 무관함을 QA 노트에 명시 |
| `[설계 결정]` | 저하 판정 임계 (5샘플 중 3개 > 100ms) | B8 저사양 실측 후 조정 |
| `[추정 설계목표]` | 프리뷰 ≤100ms | B8 실측 — 초과 시 R5 강등이 실제로 도는지 확인 |
| B5 인계 | `predictionStore.context` 소비 | **B5 착수 조건** — F05·F06 구현 명세에서 회수 |
