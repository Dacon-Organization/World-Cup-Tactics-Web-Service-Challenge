# F01 구현 명세 — 전술보드 피치 + 포메이션 프리셋

> 대응 계약: [features/F01](../../features/version1.0/F01_전술보드_피치.md) ·
> 공통 규약: [구현규약_v1_0.md](구현규약_v1_0.md) · 시각 정본: [DESIGN.md](../../../../DESIGN.md) §3.3
>
> 작성 시점: B4 착수 직전 (2026-07-27). 템플릿은 구현규약 §0의 7섹션.

---

## 1. 계약 재확인

| ID | 요구사항 | 구현 지점 |
|---|---|---|
| F01-R1 | WHEN 프리셋 선택 → 11명을 표준 좌표로 ~100ms 애니메이션 이동 | `TacticsBoard.handleFormationChange` → `tacticsStore.setFormation` · 토큰 CSS `transition: left/top 120ms var(--ease-snap)` |
| F01-R2 | WHILE 전환 애니메이션 중 → 드래그 시작 무시 | `TacticsBoard.isTransitioning` (로컬) → `PlayerToken` `disabled` prop → `onPointerDown` 즉시 반환 |
| F01-R3 | 피치·토큰 전체가 뷰포트 내 (잘림 없음) | `.pitch-frame` = `aspect-ratio: 2/3` + `max-width: calc(56dvh * 2 / 3)` — 높이가 56dvh를 넘을 수 없다 |
| F01-R4 | IF 뷰포트 <320px → 최소 폭 고정·가로 스크롤 없이 축소 | 피치는 `width:100%` 유동. 고정 px 폭을 쓰지 않으므로 축소만 일어난다 |
| F01-R5 | IF SVG 렌더 실패 → 단순 그리드 폴백으로 토큰 위치 표시 | 토큰은 **SVG가 아니라 HTML 절대배치**. 프레임 배경·경계선은 CSS. SVG는 마킹 전용 |
| F01-R6 | IF 화면 회전 → 정규화 좌표 유지 재렌더 | 좌표는 스토어에 0~1로만 저장. 렌더는 `%` — 리사이즈 시 자동 정합 |

**GWT**

- 기본(4-3-3) → 3-4-3 선택 → 11명 전원이 3-4-3 표준 좌표 + 애니메이션 완료
- 개별 수정(F02) 후 다른 프리셋 선택 → 수정 폐기, 표준 좌표 재배치
- 375px 세로 → 피치·토큰·프리셋 UI 가로 스크롤 0

## 2. 컴포넌트 트리

```
src/app/page.tsx                         (Server) — 셸·헤더·고지문
└─ src/components/tactics/TacticsBoard.tsx        (Client) — 상태 조율자
   ├─ src/components/pitch/Pitch.tsx              (Client)
   │  ├─ PitchMarkings.tsx                        (순수 SVG — props 없음)
   │  ├─ TacticsPreview.tsx                       (순수 SVG — F04)
   │  └─ PlayerToken.tsx × 11                     (Client)
   ├─ src/components/tactics/FormationPicker.tsx  (Client)
   ├─ src/components/tactics/SliderSheet.tsx      (Client)
   └─ src/components/prediction/ProbabilityBar.tsx(순수 — F08)
```

```typescript
interface PitchProps {
  positions: Position[];          // 길이 11 (드래그 중이면 draft가 섞인 값)
  slots: PositionSlot[];          // 현재 프리셋 — 역할·스냅 후보
  squad: Player[];                // 슬롯 i ↔ squad[i]
  sliders: Sliders;               // 프리뷰용
  selectedIndex: number | null;
  disabled: boolean;              // F01-R2
  snapTargetIndex: number | null; // F02 드롭존 하이라이트 (좌표 근접 판정 결과)
  onTokenPointerDown(index: number, event: React.PointerEvent): void;
  onTokenActivate(index: number): void;      // F03 클릭-클릭 1단계
  onSurfaceActivate(position: Position): void; // F03 클릭-클릭 2단계
  onTokenKeyDown(index: number, event: React.KeyboardEvent): void;
}
```

**`page.tsx`를 Server로 유지하는 이유** — 구현규약 §2. `TacticsBoard`는 `'use client'`지만
Next.js가 첫 요청에서 서버 렌더하므로 초기 HTML에 피치·토큰·확률이 모두 들어 있습니다.
JS가 죽어도 이 HTML이 남습니다 (F08-R5와 공유하는 기반).

## 3. 상태

| 값 | 위치 | 이유 |
|---|---|---|
| `formationId` · `positions[11]` | `tacticsStore` | F13 URL 인코딩 대상 (구현규약 §3) |
| `isTransitioning` | `TacticsBoard` 로컬 | 파생·일시 상태. 스토어에 넣으면 URL 인코딩 대상이 오염된다 |
| 렌더용 좌표 | `TacticsBoard`가 `positions`에 draft를 덮어 계산 | 드래그·키보드 중에는 스토어를 건드리지 않는다 (F02 §4) |

`setFormation`은 `positions`를 프리셋 좌표로 **덮어쓰고** `selectedTokenIndex`를 비웁니다
(B2 구현 그대로 — F01 §4 "전환은 다시 시작").

## 4. 알고리즘·수식

### 4.1 피치 기하 (DESIGN.md §3.3 비율 이식)

`viewBox="0 0 100 150"` (w=100, h=150 — §3.2의 `가로 × 1.5` 종횡비).

| 요소 | 값 |
|---|---|
| 터치라인 | `rect(0.55, 0.55, 98.9, 148.9)` — stroke 1.1의 절반만큼 안쪽 |
| 하프웨이 라인 | `y = 75` |
| 센터 서클 | `cx=50 cy=75 r=11` (`min(w,h)×0.11`) |
| 페널티 박스 | `x=22 w=56 h=19.5` — 상단 `y=0`, 하단 `y=130.5` |
| 골 박스 | `x=36 w=28 h=8.25` — 상단 `y=0`, 하단 `y=141.75` |
| 선 | `#FFFFFF` / opacity 0.55 / width 1.1 |

전부 자체 도형. 외부 피치 에셋 0개 (DESIGN.md §7).

### 4.2 좌표 변환

정규화 `(x, y)`는 x: 좌→우, y: 자기 진영→상대 진영. SVG는 위가 상대 진영이므로 y가 뒤집힙니다.

```
svgX = x * 100
svgY = (1 - y) * 150
토큰 CSS: left = x*100%,  top = (1 - y)*100%,  transform: translate(-50%, -50%)
포인터 → 정규화: nx = (clientX - rect.left) / rect.width
                 ny = 1 - (clientY - rect.top) / rect.height
```

**`getBoundingClientRect` 하나로 끝나는 이유** `[설계 결정]` — 프레임에 `aspect-ratio: 2/3`을
걸고 SVG를 `absolute inset-0 w-full h-full`로 채우면 `preserveAspectRatio` 레터박싱이
발생하지 않습니다. P19가 `[미확인 유지]`로 남긴 항목의 해소책이며, 토큰이 HTML이라
SVG CTM 역변환이 애초에 필요 없습니다.

### 4.3 슬롯 ↔ 선수 배정

`squad[i]`(= `koreaSquad`의 i번째)를 슬롯 i에 배정합니다 — `players.json`이 GK 3 · DF 9 ·
MF 9 · FW 5 순으로 정렬돼 있으나 프리셋별 역할 분포와 다르므로, **역할이 일치하는 선수를
슬롯 순서대로 채우고 남으면 나머지에서 채웁니다** (`assignSquad`, 순수 함수).
슬롯 역할과 선수 포지션이 어긋난 배정은 조정 계층의 적합도 페널티(§4.4)로 값에 반영됩니다.

## 5. 실패 경로 (features IF-THEN 대응)

| 계약 | 코드 분기 |
|---|---|
| **F01-R4** 뷰포트 <320px | 피치·프리셋·슬라이더 전부 고정 px 폭 없음. `page.tsx`는 `max-w-*`만 쓰고 `min-width`를 쓰지 않는다 → 축소만 발생. 토큰은 `clamp(44px, 12%, 56px)`로 44px 하한을 유지하므로 아주 좁은 폭에서는 토큰이 겹칠 수 있으나 **잘리지는 않는다**. **B4 브라우저 실측(280×653)**: 가로 스크롤 0 · 피치 244×366 · 토큰 44px 유지 · 11명 전원 피치 안 · **겹치는 쌍 1건** — 조작을 막지 않는 수준이라 하한 44px를 유지한다 |
| **F01-R5** SVG 실패 | `PitchMarkings`는 `<svg>` 안에만 존재. 프레임의 배경(`--surface`)·경계(`border`)·하프웨이 라인(CSS `::after`)은 SVG 밖이므로 SVG가 통째로 실패해도 **경계가 있는 사각형 위에 토큰 11개가 정규화 좌표대로** 남는다 |
| **F01-R6** 회전·리사이즈 | 좌표가 `%`이므로 리렌더 없이도 정합. 단 **드래그 중이면** F02-R6이 우선해 드래그를 취소한다 (`resize`/`orientationchange` → `cancelDrag`) |
| **F01-R2** 전환 중 드래그 | `handleFormationChange`가 `isTransitioning=true` → `setTimeout(120ms)` → `false`. 그 사이 `onPointerDown`은 첫 줄에서 반환. 연타 시 이전 타이머를 `clearTimeout` — **마지막 선택만 적용** (F01 §6) |

## 6. 테스트

| 층 | 대상 |
|---|---|
| 단위 (Vitest) | `geometry.ts` — `toNormalized`/`toSvg` 왕복, 경계 클램프 · `assignSquad` — 11명·역할 우선 배정·중복 0 |
| 단위 | `pitchGeometry` 상수가 DESIGN.md §3.3 비율과 일치 (회귀 방지) |
| 상호작용 | 프리셋 전환 → `positions`가 프리셋 좌표와 정확히 일치 · `selectedTokenIndex === null` |
| 실기기 (B8) | 375×667에서 잘림 0 · 280px 폭 토큰 겹침 정도 · 회전 후 좌표 보존 |

## 7. 근거 태그 회수

| 태그 | 내용 | 이관 |
|---|---|---|
| ~~`[추정 설계목표]`~~ | 280px 폭에서 토큰 겹침 허용 범위 | **B4에서 실측 해소** — 겹침 1쌍, 조작 방해 없음. 하한 44px 유지 |
| `[설계 결정]` | 레터박스 회피를 CTM이 아니라 종횡비 일치로 해결 | **B4 실측**: 375px에서 피치 303×455, 비율 0.6667 = viewBox 2/3 일치(레터박스 0). 400% 확대 유지 여부는 B8 |
| features `[NEEDS CLARIFICATION]` | 토큰 표기 | **해소됨** — 가공명_체계 §5.1 확정(성 1음절 + 포지션 색상 링). features v1.1에서 치환 예정 (변경노트 누적) |
