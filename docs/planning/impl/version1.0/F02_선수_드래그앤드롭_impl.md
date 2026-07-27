# F02 구현 명세 — 선수 드래그앤드롭 (Pointer Events)

> 대응 계약: [features/F02](../../features/version1.0/F02_선수_드래그앤드롭.md) ·
> **구현 근거 정본: [P19 — 포인터 드래그 구현](../../../research/findings/P19-포인터드래그구현.md)**
>
> P19의 "구현 체크리스트"는 이 문서가 그대로 소비합니다. 항목을 바꾸려면 P19를 먼저 반박해야 합니다.

---

## 1. 계약 재확인

| ID | 요구사항 | 구현 지점 |
|---|---|---|
| F02-R1 | WHEN 드래그 시작 → 고스트·드롭섀도·커서 즉시 표시 | `pointerdown`에서 로컬 `drag` 상태 set → 원위치에 `.token-ghost`, 이동 토큰에 `.token-lifted` |
| F02-R2 | WHEN 드롭존 근접 드롭 → 슬롯 스냅 + ~100ms 애니메이션 | `resolveDrop()` → `movePlayer` → CSS `transition 120ms var(--ease-snap)` |
| F02-R3 | WHILE 드래그 중 → 다른 토큰 드래그 시작 무시 | `dragRef.current !== null` 이면 `pointerdown` 즉시 반환 |
| F02-R4 | IF Esc → 취소·원위치 | `window` `keydown` (드래그 중에만 등록) → `cancelDrag()` |
| F02-R5 | IF 피치 밖 드롭 → 원위치·상태 불변 | `resolveDrop`이 `null` 반환 → 커밋 없음 |
| F02-R6 | IF 회전·리사이즈 → 취소·복귀 후 재렌더 | `window` `resize`·`orientationchange` → `cancelDrag()` · **`pointercancel` 핸들러가 같은 경로** (P19) |
| F02-R7 | IF 두 번째 손가락 → 무시 | `if (!event.isPrimary) return;` (P19 C4) |

**GWT** — 데스크톱 마우스 드롭 시 스냅·100ms 고정 / 모바일 터치 이동 완료 / 드래그 중 Esc →
원위치 + 예측 재실행 없음 / 드래그 중 회전 → 크래시·좌표 왜곡 없이 취소.

## 2. 컴포넌트 트리

`PlayerToken`은 **포인터 계열 이벤트만** 답니다. 마우스 이벤트 핸들러 병용 금지 (P19 —
호환성 마우스 이벤트로 같은 조작이 두 번 처리됨).

```typescript
// components/pitch/PlayerToken.tsx  (Client)
interface PlayerTokenProps {
  index: number;
  player: Player;          // displayName 첫 글자 = 성 1음절 (가공명_체계 §5.1)
  role: PositionRole;      // 슬롯 역할 — 색상 링
  position: Position;      // 렌더 좌표 (draft 포함)
  state: 'idle' | 'dragging' | 'selected';
  disabled: boolean;       // F01-R2
  onPointerDown(index: number, event: React.PointerEvent<HTMLButtonElement>): void;
  onActivate(index: number): void;
  onKeyDown(index: number, event: React.KeyboardEvent<HTMLButtonElement>): void;
}
```

드래그 로직(`pointermove`/`up`/`cancel`)은 **`TacticsBoard`가 소유**합니다 — 토큰 단위로
흩어 놓으면 "단일 드래그 원칙"(F02-R3)을 컴포넌트 경계 너머로 강제할 수 없습니다.

## 3. 상태

```typescript
// TacticsBoard 로컬 (useRef + useState 이중화)
interface DragState {
  index: number;
  pointerId: number;
  origin: Position;       // 취소 시 복귀 좌표
  current: Position;      // 렌더용 — 스토어에 쓰지 않는다
  grabOffset: { dx: number; dy: number };  // 손가락과 토큰 중심의 차 (정규화)
}
```

- **`pointermove`에서 스토어 커밋 금지** (F02 §4 · P19 체크리스트) — `useRef`가 진실,
  `useState`는 렌더 트리거용. 커밋은 `pointerup` 1회.
- `positions`(스토어)는 드롭 시에만 `movePlayer(index, pos)`로 갱신됩니다.

## 4. 알고리즘·수식

### 4.1 이벤트 시퀀스 (P19 Q1 표준 패턴)

```
pointerdown  → isPrimary 아니면 return (R7)
             → dragRef 있으면 return (R3)
             → disabled 면 return (F01-R2)
             → grabOffset 계산
             → try { el.setPointerCapture(pointerId) } catch { return }   ← C2
pointermove  → current 갱신 (로컬만)
             → snapTargetIndex = nearestSlot(current) ← 좌표 근접 판정 (C3)
pointerup    → resolveDrop() → 커밋 또는 원위치
pointercancel→ cancelDrag()  ← F02-R6의 구현체
```

**`setPointerCapture` 호출 시점** (P19 C1) — 이 구현은 드래그 중 토큰을 DOM에서 재부착하지
않습니다(형제 순서 유지 + `z-index`만 올림). 따라서 "DOM 이동 후 캡처" 제약은 자동으로
충족되며, **재부착 설계로 바꾸는 순간 캡처 호출을 재부착 뒤로 옮겨야 합니다.**

**드롭존 하이라이트를 `pointerenter`로 만들지 않습니다** (P19 C3) — 캡처 중에는
`pointerover`/`enter`/`leave`/`out`이 발화하지 않습니다. 전부 좌표 근접 판정입니다.

### 4.2 스냅 마그네티즘

시각 경계보다 넓은 판정 (F02 §3). 피치가 2:3이므로 정규화 거리를 그대로 쓰면 x·y의 체감
거리가 달라집니다 — **피치 높이 단위로 정규화**합니다:

```
d(a, b) = sqrt( ((a.x - b.x) * (100/150))^2 + (a.y - b.y)^2 )
SNAP_RADIUS = 0.08          // 피치 높이의 8% ≈ 450px 피치에서 36px  [설계 결정]
OCCUPIED_EPS = 0.02         // 다른 토큰이 이만큼 안에 있으면 그 슬롯은 후보에서 뺀다
```

`nearestSlot(point, slots, positions, selfIndex)`:
1. 다른 토큰이 `OCCUPIED_EPS` 안에 있는 슬롯을 후보에서 제외 — **토큰이 겹쳐 쌓이는 상태를 만들지 않는다**
2. 남은 후보 중 `d ≤ SNAP_RADIUS`인 최근접 슬롯을 반환, 없으면 `null`

`resolveDrop(point)`:
- `point`가 `[0,1]²` 밖 → `null` (F02-R5)
- `nearestSlot` 있으면 그 슬롯 좌표, 없으면 `point` 그대로 (자유 배치)

### 4.3 CSS (P19 체크리스트 — 정적 선언 강제)

```css
.player-token {
  touch-action: none;           /* 토큰에만. 피치·페이지에 걸면 확대가 죽는다 (WCAG 1.4.4) */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;  /* 비표준 — 보강일 뿐, 없어도 기능이 성립해야 한다 */
  cursor: grab;
}
.player-token[data-state='dragging'] { cursor: grabbing; }
```

**JS로 `touch-action`을 바꾸지 않습니다** — MDN: 제스처가 시작된 뒤의 변경은 현재 제스처에
아무 영향이 없습니다. CSS에 정적으로 있어야 합니다.

**long-press 지연을 도입하지 않습니다** (P19 Q3 확정) — 토큰 한정 `touch-action`으로
"스크롤하려다 토큰이 끌려오는" 문제가 이미 해소되고, 지연은 P5의 100ms 반응 예산을
스스로 깹니다. B8은 도입 여부가 아니라 **확인만** 합니다.

## 5. 실패 경로

| 계약 | 코드 분기 |
|---|---|
| **F02-R4** Esc | 드래그 시작 시 `window.addEventListener('keydown')` 등록, 종료 시 해제. `key === 'Escape'` → `cancelDrag()` → `current = origin` · 커밋 없음 · **예측 트리거 없음** |
| **F02-R5** 피치 밖 | `resolveDrop`이 `null` → `dragRef = null`만 하고 `movePlayer` 미호출. 스토어가 변하지 않으므로 debounce 커밋도 발생하지 않는다 |
| **F02-R6** 회전·리사이즈·`pointercancel` | 셋 다 `cancelDrag()` 한 경로. `releasePointerCapture`는 **`try/catch`** — 이미 해제됐으면 던진다 |
| **F02-R7** 멀티터치 | `!event.isPrimary` → 반환. 추가로 `dragRef.current.pointerId !== event.pointerId`인 `pointermove`는 무시 (다른 포인터가 캡처 밖에서 움직이는 경우) |
| **C2** `NotFoundError` | `setPointerCapture`를 `try/catch`로 감싸고 **실패 시 드래그를 시작하지 않는다** — 캡처 없는 드래그는 손가락을 놓쳐 유령 상태가 된다 |
| 커밋 후 값이 같음 | `movePlayer`가 같은 좌표를 쓰면 스토어 참조는 바뀌지만 조정 계층 결과는 동일 — debounce 커밋이 한 번 돌지만 값이 같아 화면 변화 없음 (허용) |

## 6. 테스트

| 층 | 대상 |
|---|---|
| 단위 (Vitest) | `nearestSlot` — 반경 밖 `null` · 점유 슬롯 제외 · 최근접 선택 · 종횡비 보정 확인 |
| 단위 | `resolveDrop` — 피치 밖 `null` · 스냅 없음 시 자유 좌표 · 경계값 (0, 1) |
| 단위 | `toNormalized` — rect 밖 좌표가 클램프되는지 |
| 상호작용 | `pointerdown(isPrimary:false)` → 드래그 미시작 · 드래그 중 두 번째 `pointerdown` 무시 |
| 실기기 (B8) | iOS Safari: 토큰 위 드래그 성립 + **피치 여백 핀치 확대 유지** · 전화 수신·회전 시 `pointercancel` 발화 타이밍 (P19 `[미확인 유지]`) |

## 7. 근거 태그 회수

| 태그 | 내용 | 이관 |
|---|---|---|
| `[설계 결정]` | `SNAP_RADIUS = 0.08` · `OCCUPIED_EPS = 0.02` | B8 — 스냅이 과하면(의도한 자유 배치가 먹히면) 0.06으로 축소 |
| P19 `[미확인 유지]` | iOS 실기기 `pointercancel` 타이밍 | **B8 F02-R6 시나리오** — 회전·전화 수신·앱 전환 3종 |
| features `[설계 결정]` | long-press 지연 도입 여부 | **해소됨** — P19 Q3에서 미도입 확정. features v1.1에서 치환 (변경노트 누적) |
