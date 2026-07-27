# F03 구현 명세 — 클릭-클릭 대안 + 키보드 경로

> 대응 계약: [features/F03](../../features/version1.0/F03_클릭클릭_키보드_대안.md) ·
> 등급 근거: [P19 Q4](../../../research/findings/P19-포인터드래그구현.md) — **WCAG 2.5.7은 AA**
>
> **이 문서는 F02와 같은 블록(B4)에서 완결됩니다.** P19 Q4가 W3C WAI 원문으로 확증한 대로,
> 전술보드의 선수 배치는 드래그가 "essential"이 아니므로 **F02 단독은 AA 미달**입니다.
> F03을 뒤로 미루면 그 사이 어떤 배포도 기준 미달 상태입니다.

---

## 1. 계약 재확인

| ID | 요구사항 | 구현 지점 |
|---|---|---|
| F03-R1 | WHEN 토큰 탭 → 선택 상태 표시 | `onTokenActivate` → `tacticsStore.selectToken(index)` · 토큰 `data-state="selected"` |
| F03-R2 | WHEN 선택 상태에서 목적지 탭 → 이동 + 선택 해제 | `Pitch` 표면 `onClick` → `resolveDrop`(F02와 **같은 함수**) → `movePlayer` → `selectToken(null)` |
| F03-R3 | WHEN 포커스 토큰에서 Space → 선택 모드 + 방향키 활성화 | `onTokenKeyDown` `' '`/`'Spacebar'` → `selectToken` + `keyboardDraft` 개시 |
| F03-R4 | IF 선택 상태에서 다른 토큰 탭 → 이동이 아니라 선택 전환 | 토큰의 `onActivate`가 표면 클릭보다 먼저 발화 (`stopPropagation`) → 항상 선택 전환 |
| F03-R5 | IF Esc 또는 피치 밖 탭 → 선택 해제·위치 불변 | `Escape` → draft 폐기 + `selectToken(null)` · 프레임 밖 `pointerdown` → 동일 |
| F03-R6 | IF 방향키가 경계를 넘으려 하면 → 경계 정지 | `clampPosition`으로 `[0,1]²` 클램프 (스토어 `movePlayer`도 이중 방어) |

**GWT** — 탭 2회 이동 결과가 F02 드래그와 동일 / Tab→Space→방향키→Enter 완주 + 전 과정
포커스 표시 / 선택 상태에서 다른 토큰 탭 → 이동 없이 선택만 전환.

## 2. 컴포넌트 트리

새 컴포넌트를 만들지 않습니다 — **F02와 같은 `PlayerToken`·`Pitch`가 두 경로를 모두 처리**합니다.
경로가 갈리면 "조작 수단만 다르고 규칙은 하나"(F03 §4)가 코드에서 깨집니다.

| 요소 | 마크업 | 이유 |
|---|---|---|
| `PlayerToken` | `<button type="button">` | Tab 순회·Space·Enter가 **공짜로** 표준 동작. `div` + `tabIndex`는 키보드 의미를 직접 재구현해야 한다 |
| 피치 표면 | `<div>` + `onClick` | 목적지 지정 전용. 포커스 대상이 아니다 (선택 상태에서만 의미가 있음) |

**접근성 속성**

```
aria-pressed={state === 'selected'}
aria-label={`${player.displayName} · ${roleLabel(role)} · ${percent(x)}, ${percent(y)}`}
aria-describedby → 선택 시 "방향키로 이동, Enter로 확정, Esc로 취소" (F03 §8)
```

## 3. 상태

| 값 | 위치 | 이유 |
|---|---|---|
| `selectedTokenIndex` | `tacticsStore` (B2에 이미 있음) | 구현규약 §3이 슬라이스에 명시 |
| `keyboardDraft: { index, position } \| null` | `TacticsBoard` 로컬 | **Esc로 되돌릴 수 있어야 하므로 스토어에 쓰면 안 된다** (F03-R5) |

**클릭-클릭은 draft를 쓰지 않습니다** — 목적지 탭이 곧 확정이라 되돌릴 중간 상태가 없습니다.
키보드만 draft가 필요한 이유는 방향키가 "이동 중"이라는 중간 상태를 만들기 때문입니다.

## 4. 알고리즘·수식

### 4.1 키보드 시퀀스

```
Tab      → 토큰 포커스 (button 기본 동작 — 구현 없음)
Space    → selectToken(i) · keyboardDraft = { i, positions[i] }   (F03-R3)
방향키    → draft.position ± KEYBOARD_STEP, clamp [0,1]           (F03-R6)
Enter    → movePlayer(i, resolveDrop(draft.position) ?? draft.position) · draft = null
Esc      → draft = null · selectToken(null)  — 위치 불변          (F03-R5)
```

```
KEYBOARD_STEP = 0.02      // 피치 2% (features F03 §3 [설계 결정])
```

- 방향키는 `preventDefault()` — 선택 모드에서 페이지가 스크롤되면 토큰이 시야에서 사라집니다.
- **선택 모드가 아닐 때 방향키는 가로채지 않습니다** — 일반 스크롤을 막으면 접근성 퇴행입니다.
- Enter도 `resolveDrop`을 거칩니다 (F03 §4 "스냅 규칙 동일 적용").

**⚠️ 단, 키보드 경로는 자기 홈 슬롯을 스냅 후보에서 뺍니다** `[설계 결정 · B4 실측으로 신설]` —
방향키는 1회 2%인데 스냅 반경은 8%(피치 높이 단위)라, 홈 슬롯을 후보로 두면 **3번까지 누른
이동이 전부 제자리로 끌려와 아무 일도 일어나지 않습니다.** 브라우저 실측에서 확인했습니다
(2칸=4% 이동 → Enter → 원위치 복귀, 6칸=12%부터 커밋). 드래그는 손가락이 크게 움직이므로
홈 슬롯 자석이 "잘못 건드린 드래그를 되돌리는" 이득이 크지만, 키보드는 의도적인 이산
명령이라 되돌리는 쪽이 손해입니다. 이 차이를 두지 않으면 F03의 GWT("Tab→Space→방향키→Enter
**Then 이동이 완료되고**")가 짧은 이동에서 성립하지 않습니다 — WCAG 2.5.7 대안 경로가
형식적으로만 존재하게 됩니다.

### 4.2 두 경로가 같은 함수로 수렴하는 지점

```
F02 pointerup ─┐
F03 표면 탭    ─┼→ resolveDrop(point) → movePlayer(index, pos) → 같은 커밋 경로 → debounce
F03 Enter      ─┘
```

F03 §2 "두 경로의 결과 상태는 완전 동일"을 **함수 공유로 보장**합니다. 분기해서 각각
구현하면 한쪽만 고쳐지는 회귀가 생깁니다.

## 5. 실패 경로

| 계약 | 코드 분기 |
|---|---|
| **F03-R4** 다른 토큰 탭 | `PlayerToken`의 `onClick`이 `event.stopPropagation()` → 표면 `onClick`이 발화하지 않는다. 따라서 "선택 상태 + 다른 토큰 클릭"은 **언제나** 선택 전환. 진행 중 draft는 폐기 |
| **F03-R5** Esc / 밖 탭 | Esc는 `PlayerToken.onKeyDown`과 `window` 양쪽에서 처리 (포커스가 토큰을 떠났을 수도 있다). 프레임 밖 `pointerdown`은 `TacticsBoard` 루트에서 감지 → 선택 해제. **`movePlayer` 미호출** |
| **F03-R6** 경계 초과 | `clampPosition`이 draft 단계에서 자르고, `tacticsStore.movePlayer`가 커밋 단계에서 한 번 더 자른다(B2 구현). 이중 방어인 이유: 좌표가 오염되면 조정 계층의 배치 파생 지표까지 오염된다 (구현규약 §5-2) |
| 선택 상태에서 프리셋 변경 | `setFormation`이 `selectedTokenIndex = null` (B2 구현) + `TacticsBoard`가 draft 폐기 — 사라진 배치를 가리키는 선택이 남지 않는다 |
| 드래그 중 Space | `disabled`가 아니어도 `dragRef.current !== null`이면 키보드 선택을 시작하지 않는다 — 두 경로가 같은 토큰을 동시에 움직이는 상태 차단 |

## 6. 테스트

| 층 | 대상 |
|---|---|
| 단위 (Vitest) | `applyKeyboardStep(position, key)` — 4방향 · 경계 정지 · 미지원 키는 그대로 반환 |
| 단위 | `resolveDrop`이 F02·F03에서 **같은 입력에 같은 출력** (계약 공유 회귀 테스트) |
| 상호작용 | 선택 → 다른 토큰 클릭 → `positions` 불변 · `selectedTokenIndex` 전환 |
| 상호작용 | Space → 방향키 ×3 → Esc → `positions` 원본과 일치 |
| 수동 (B8) | 키보드만으로 U4 시나리오 완주 · 포커스 링이 피치 배경 위에서 보이는지 · 스크린리더 라벨 낭독 |

## 7. 근거 태그 회수

| 태그 | 내용 | 이관 |
|---|---|---|
| features `[설계 결정]` | 방향키 이동 단위 2% | B8 — 11명 배치에 2%가 너무 잘면 5%로. 실측 후 확정 |
| DESIGN.md `[추정 설계목표]` | 포커스 링 대비 (피치 배경 위) | B8 명도 대비 실측 |
| P19 Q4 | AA 준수 주장의 근거 | 기획서 v1.1 8절에 W3C 원문 인용으로 이관 |
