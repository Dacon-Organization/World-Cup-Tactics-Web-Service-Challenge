# F08 구현 명세 — 온보딩 기본 상태 (빈 화면 금지)

> 대응 계약: [features/F08](../../features/version1.0/F08_온보딩_기본상태.md) ·
> 경계 정본: [구현규약 §2](구현규약_v1_0.md) Server/Client · ADR-004(기본 전술)
>
> **B4 범위 경계**: F08-R3(모델 로드 완료 시 무단절 교체)의 *교체하는 쪽*은 B5입니다.
> B4는 **교체당하는 쪽**(SSR 사전 계산 확률)을 확정하고, 값이 같아 교체가 눈에 띄지 않는
> 구조를 만듭니다. F08-R6(공유 URL 우선)은 F13(B7) 범위입니다.

---

## 1. 계약 재확인

| ID | 요구사항 | 구현 지점 |
|---|---|---|
| F08-R1 | WHEN 첫 진입 → 기본 배치와 확률을 즉시 표시 | `page.tsx`(Server)가 `defaults`를 읽어 `TacticsBoard`에 props로 주입 → SSR HTML에 확률이 이미 들어 있다 |
| F08-R2 | 어떤 시점에도 "빈 보드" 없음 | 스토어 초기값이 `defaults`이므로 **로딩 상태 자체가 존재하지 않는다**. 스켈레톤 코드 0줄 |
| F08-R3 | WHEN 모델 로드 완료 → 사전 계산값을 추론값으로 무단절 교체 | `predictionStore.p` 초기값 = `precomputed`. B5가 같은 값을 다시 써도 **화면 변화 0** |
| F08-R4 | IF 초기 로딩 3초 초과 → 스켈레톤 대신 기본 배치+사전 계산 우선 | 구조적으로 충족 — 사전 계산값이 SSR HTML에 있어 JS·모델 도착 전에 이미 그려져 있다 |
| F08-R5 | IF JS 실패 → 서버 렌더 기본 배치 정적 화면 + 안내 문구 | `<noscript>` 안내 + SSR HTML이 그대로 남는다 (§4.2) |
| F08-R6 | IF 공유 URL 진입 → URL 복원 우선 | **F13(B7) 범위** — §5에 미완으로 명시 |

**GWT** — 시크릿 창 첫 진입 3초 내 배치+확률 / 3G에서 백지 구간 없음 / 첫 화면 노출이
피치·슬라이더 4개·예측 패널로 제한(세부는 접힘).

## 2. 컴포넌트 트리

```
src/app/page.tsx                              (Server)
├─ <header>  워드마크 · 제목 · 상대 표기       (Server)
├─ <TacticsBoard                              (Client — 단, SSR로 HTML 생성)
│     initialProbabilities={defaults.precomputed}
│     opponent={...} eloDiff/lambda0={...} />
│  ├─ Pitch (F01·F02·F03)
│  ├─ FormationPicker  ← <details> 안 (점진적 공개)
│  ├─ SliderSheet      (F04)
│  └─ ProbabilityBar   (순수 표시)
├─ <noscript> 안내 문구                        (Server)
└─ <footer>  "가공명 표기 · 비공식 팬 프로젝트" (Server)
```

```typescript
// components/prediction/ProbabilityBar.tsx — 순수 함수형, 훅 없음
interface ProbabilityBarProps {
  probabilities: Probabilities;   // 합 1 ± 1e-6
  source: 'precomputed' | 'inferred' | 'fallback';
}
```

**`ProbabilityBar`에 훅을 두지 않는 이유** — 훅이 없으면 Server/Client 어느 쪽에서 렌더해도
같은 HTML이 나옵니다. F08-R5(JS 없이도 보여야 함)와 F08-R3(JS로 갱신해야 함)을 **같은
컴포넌트**로 만족시키는 방법입니다. DESIGN.md §4의 F07 확장(DotGrid·WilsonBand)은 이 컴포넌트를
감싸는 형태로 B5가 추가합니다.

## 3. 상태

| 값 | 위치 | 초기값 |
|---|---|---|
| `formationId`·`positions`·`sliders` | `tacticsStore` | `defaults.json` (ADR-004: f433 + 전부 50) |
| `p` (표시 확률) | `predictionStore` | **`defaults.precomputed`** |
| `engine` | `predictionStore` | `null` — B5가 `'onnx'`/`'fallback'`으로 채운다 |
| `context` | `predictionStore` | `null` — B4의 debounce 커밋이 채우고 **B5가 소비** |

**하이드레이션 불일치가 생기지 않는 이유** — 두 스토어의 초기값이 전부 `defaults.json`에서
결정론적으로 파생되므로, 서버 렌더 HTML과 클라이언트 첫 렌더가 **같은 값**입니다.
`Date.now()`·`Math.random()`·`window` 참조가 초기 상태 계산 경로에 없습니다.

## 4. 알고리즘·수식

### 4.1 사전 계산 확률의 출처

`src/data/defaults.json.precomputed = { win: .489686, draw: .299343, lose: .210971 }`
— B3가 기본 상대(체코) 컨텍스트를 **조정 계층 항등 상태**(슬라이더 전부 50 + 프리셋 기준
배치)로 넣어 얻은 **순수 모델 출력**입니다 (피처_정의서 FT-R3).

이것이 "첫 화면 확률은 모델이 말한 것"이라는 주장의 근거이고, 조정 계층이 기본 상태에서
항등이어야 하는 이유이기도 합니다 (구현규약 §5-1).

### 4.2 JS 실패 시 남는 것 (F08-R5)

| 실패 지점 | 남는 화면 |
|---|---|
| JS 번들 로드 실패 | SSR HTML 전체 — 피치 SVG · 토큰 11개 · 슬라이더(값 표시) · 확률 바 |
| 하이드레이션 예외 | 동일 (React 19는 하이드레이션 실패 시 해당 경계만 클라이언트 재렌더 시도) |
| JS 비활성 | 동일 + `<noscript>` 안내 |

```html
<noscript>
  이 브라우저에서 JavaScript가 꺼져 있어 전술을 바꿀 수 없습니다.
  화면의 배치와 확률은 기본 전술 기준으로 계산된 값입니다.
</noscript>
```

**슬라이더가 SSR에서도 값을 보여야 하는 이유** — `<input type="range" value>`는 JS 없이도
현재 값을 시각적으로 렌더합니다. "조작은 안 되지만 상태는 보인다"가 백지보다 낫습니다.

### 4.3 점진적 공개 (F08 §3)

1차 노출 = **피치 · 슬라이더 4개 · 예측 패널**. 프리셋 선택기는 `<details>`로 접습니다.

`<details>`를 쓰는 이유 `[설계 결정]` — JS 없이 열리고, 키보드·스크린리더 동작이 표준이며,
접힘 상태가 SSR HTML에 그대로 실립니다. 커스텀 아코디언은 이 셋을 다시 만들어야 합니다.

## 5. 실패 경로

| 계약 | 코드 분기 |
|---|---|
| **F08-R4** 로딩 3초 초과 | 해당 없음 — 사전 계산값이 SSR HTML에 있어 "로딩 중" 구간이 존재하지 않는다. 스켈레톤을 만들지 않는 것이 구현이다 |
| **F08-R5** JS 실패 | §4.2. 추가로 `page.tsx`는 Server Component이므로 **클라이언트 예외가 헤더·푸터·고지문을 지우지 못한다** |
| `precomputed === null` | 타입이 `\| null`이므로 분기가 강제된다. B3 완료 후 `null`이면 **G2가 경고**하고 화면은 확률 대신 "기본 전술" 안내를 표시한다 (빈 패널 금지 — F05 계열 원칙) |
| 확률 합 ≠ 1 | `ProbabilityBar`가 렌더 시 3분할 폭을 합으로 정규화 — 합이 어긋나도 막대가 넘치거나 비지 않는다 |
| **미완 (B7 인계)** | **F08-R6** 공유 URL 우선 — F13의 URL 파싱이 없으므로 현재는 무조건 기본 상태. `page.tsx`가 `searchParams`를 읽지 않는 상태로 두고 B7이 추가한다 |
| **미완 (B5 인계)** | **F08-R3** 추론값 교체 — `predictionStore.p`를 쓰는 주체가 아직 없다 |

## 6. 테스트

| 층 | 대상 |
|---|---|
| 단위 (Vitest) | `defaults.precomputed`의 합이 1 ± 1e-6 · 세 값 모두 (0,1) 내부 |
| 단위 | 스토어 초기값이 `defaults.json`과 정확히 일치 (하이드레이션 불일치 회귀 방지) |
| 단위 | `ProbabilityBar`의 폭 계산이 합≠1 입력에서도 총 100%를 유지 |
| 빌드 | `npm run build` — SSR 산출 HTML에 확률 문자열이 포함되는지 (`.next` 출력 확인) |
| 실기기 (B8) | 시크릿 창 첫 진입 3초 내 표시 · 3G 스로틀 백지 0 · **JS 차단 상태에서 화면 유지** |

## 7. 근거 태그 회수

| 태그 | 내용 | 이관 |
|---|---|---|
| `[추정 설계목표]` | 초기 로딩 ≤3초 (P4) | B8 실측 — 3G 스로틀 |
| `[설계 결정]` | 프리셋 선택기를 `<details>`로 접음 | B8 — 심사자가 프리셋을 못 찾으면 기본 펼침으로 전환 검토 |
| features `[NEEDS CLARIFICATION]` | 기본 상대 | **해소됨** — 가공명_체계 §5.2 확정(체코). features v1.1에서 치환 (변경노트 누적) |
| B5·B7 인계 | F08-R3 · F08-R6 | 각 블록 구현 명세에서 회수 |
