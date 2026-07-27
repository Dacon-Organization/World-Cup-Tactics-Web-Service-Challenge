# F05 구현 명세 — 온디바이스 예측 패널

> 대응 계약: [features/F05](../../features/version1.0/F05_온디바이스_예측_패널.md) ·
> 프로토콜 정본: [ML 설계 §6.1](../../ml/version1.0/ML_설계_v1_0.md) · 폴백 산식: 같은 문서 §6.3 ·
> 공통 규약: [구현규약 §4](구현규약_v1_0.md)
>
> **B5 범위 경계**: 이 문서는 **엔진을 띄우고 살려 두는 일**까지입니다. 몬테카를로 루프는
> [F06 impl](F06_몬테카를로_시뮬레이션_impl.md), 화면 표현은 [F07 impl](F07_확률_시각화_impl.md).
> B4가 남긴 인계 지점(`predictionStore.context` · `scheduler.generation`)을 여기서 회수합니다.

---

## 1. 계약 재확인

| ID | 요구사항 | 구현 지점 |
|---|---|---|
| F05-R1 | WHEN 전술 커밋 → Worker 추론 → 패널 반영 | `predictionStore.context` 구독 → `client.request()` → `result` → `setResult()` |
| F05-R2 | WHILE 추론 중 → 직전 확률 유지 + 인디케이터만 | `p`는 `result` 수신 시에만 대입. `status`만 바뀐다 — 스토어 분리(구현규약 §3)가 이미 보장 |
| F05-R3 | Ubiquitous 외부 네트워크 요청 0건 | `ort.env.wasm.wasmPaths`를 **객체형**으로 자체 경로 고정 (§4.2) + `images.remotePatterns: []` |
| F05-R4 | IF wasm 로드 실패 → JS 통계 폴백 + "간이 추정" 배지 | `error(load)` 수신 또는 SIMD 미지원 → `engine: 'fallback'` → `EstimateBadge` |
| F05-R5 | IF 로드 미완료 중 조작 → 허용 + "모델 준비 중" → 로드 완료 시 자동 추론 | `pendingContext` **1건만** 보관 → `ready` 수신 시 그것으로 추론 (§4.3) |
| F05-R6 | IF Worker 무응답 → 재기동 1회 → 재실패 시 폴백 | 2단 타임아웃 `T_soft`/`T_hard` (§4.4) |

**GWT** — ① DevTools Network에서 조작 반복 시 외부 요청 0건 ② 재방문 오프라인에서 추론 동작
③ wasm 차단 환경에서 "간이 추정" 배지와 함께 확률 표시 ④ 추론 반복 중 메인 스레드 인터랙션 무중단.

**B4에서 인계받은 미충족 항목** — [F04 impl §5](F04_전술_슬라이더_impl.md) 마지막 행의
"F04 GWT 2(슬라이더 4종 각각 조작 시 확률이 변한다)"를 이 블록이 충족시킵니다. 충족 경로는 §4.5.

## 2. 컴포넌트 트리

```
src/components/prediction/
├── PredictionPanel.tsx     (Client) — 패널 조립. TacticsBoard 인라인 <section>에서 승격
├── ProbabilityBar.tsx      (훅 없음 — Server/Client 동형, B4 산출물 유지)
├── EstimateBadge.tsx       (훅 없음) — engine==='fallback' 일 때만 렌더
└── EngineStatusLine.tsx    (훅 없음) — "모델 준비 중" · 반복 횟수 · 강등 고지
src/components/ServiceWorkerRegistrar.tsx  (Client) — layout.tsx 에 1회
src/hooks/usePredictionEngine.ts           (Client) — Worker 수명주기 + 스토어 배선
```

```typescript
interface PredictionPanelProps {
  opponentName: string;
}
interface EstimateBadgeProps {
  /** 배지를 띄우는 이유. 화면 문구가 아니라 title/aria 보조 설명에 쓴다 */
  reason: 'wasm-unsupported' | 'load-failed' | 'worker-timeout';
}
```

**패널을 `TacticsBoard`에서 떼어내는 이유** — B4에서는 확률이 정적이라 `<section>` 인라인으로
충분했습니다. 이제 패널은 엔진 상태·밴드·배열·HOPs를 함께 들므로, 전술보드 조율자 안에 두면
드래그 상태 변화가 예측 패널 전체를 리렌더시킵니다. 두 관심사의 리렌더를 분리합니다.

**`usePredictionEngine`을 훅으로 분리하는 이유** — Worker 생성은 **Client 마운트 이후**여야
합니다(구현규약 §2). 훅 경계가 그 규칙을 강제하고, S2b(F11)·S3(F13)가 같은 훅을 재사용합니다.

## 3. 상태

`predictionStore`를 B5 범위로 확장합니다. B4가 남긴 `context`·`p`·`engine`·`status`는 그대로 둡니다.

```typescript
interface PredictionState {
  // --- B4 산출물 (유지) ---
  p: Probabilities | null;
  engine: 'onnx' | 'fallback' | null;
  status: 'idle' | 'loading' | 'inferring' | 'simulating' | 'error';
  context: TacticContext | null;
  setContext(context: TacticContext): void;

  // --- B5 신설 ---
  band: Band | null;                 // 승/무/패 3범주 Wilson 묶음 (F06)
  frames: Frame[];                   // HOPs 재료 (F07)
  iterations: number | null;         // 화면에 표기할 실제 반복 횟수 (F06-R3)
  progress: { done: number; total: number } | null;
  degraded: boolean;                 // F06-R7 자동 강등 사실
  fallbackReason: EstimateReason | null;
  /** 마지막으로 화면에 반영한 세대. 이보다 낮은 응답은 버린다 (F04-R4) */
  appliedGeneration: number;
  setResult(generation: number, result: EngineResult): void;
  setStatus(status: PredictionState['status']): void;
  setProgress(generation: number, progress: { done: number; total: number } | null): void;
  setEngine(engine: 'onnx' | 'fallback', reason: EstimateReason | null): void;
  setDegraded(degraded: boolean): void;
}
```

**`appliedGeneration`을 스토어에 두는 이유** — 구식 결과 폐기 판정을 훅 로컬 ref에 두면,
훅이 두 번 마운트되는 상황(Strict Mode 이중 실행·S2b 동시 마운트)에서 판정 기준이 갈라집니다.
표시값과 같은 곳에 두어야 "지금 화면의 값은 몇 세대인가"가 하나로 정해집니다.

**`p`의 초기값은 여전히 `defaults.precomputed`** 입니다. 엔진이 준비되기 전에도 화면에 확률이
있고(F08-R1), 준비 후 같은 기본 상태를 추론하면 같은 값이라 화면이 흔들리지 않습니다(F08-R3).

## 4. 알고리즘·수식

### 4.1 Worker 계약 이식 — `src/types/worker.ts`

[ML 설계 §6.1](../../ml/version1.0/ML_설계_v1_0.md)의 판별 유니온을 **`type`·`payload` 구조 무변경**으로
이식하고, 미정의 타입 3종(`Band`·`Frame`·`InterventionContext`)을 정의합니다.

```typescript
/** 한 범주의 Wilson 구간. 표시 확률(center)이 아니라 밴드 끝점만 담는다 */
interface Interval { low: number; high: number; }
/** §6.1이 `wilson: Band` 단수로 적은 것의 실체 — 3범주 묶음이다 */
interface Band { win: Interval; draw: Interval; lose: Interval; }
/** HOPs 1프레임 = 몬테카를로 1회 (평가_설계 §4.5) */
interface Frame { outcome: Outcome; self: number; opp: number; }
```

두 곳에서 §6.1과 **의도적으로 갈립니다** `[설계 결정]`. 근거를 남기고 §7에서 회수합니다.

**(1) 응답 봉투에 `generation`을 얹는다**

```typescript
type WorkerResponseEnvelope = WorkerResponse & { generation: number };
```

§6.1의 `result` payload에는 세대 식별자가 없습니다. 그대로 두면 메인 스레드는 도착한 결과가
**어느 요청의 것인지 알 수 없고**, `cancel`이 청크 경계에서만 반영되므로(구현규약 §4) 취소
직후 도착한 옛 결과를 새 요청의 결과로 오인하는 경로가 실재합니다 — F04-R4 "구식 결과 표시
금지" 위반입니다. `TacticContext`에는 B4가 이미 `generation`을 넣어 두었으므로 **요청 쪽에만
있고 응답 쪽에 없는 비대칭**을 메우는 것입니다. 유니온의 각 갈래는 한 글자도 바뀌지 않고,
교차 타입으로 라우팅 필드 하나가 붙습니다.

**(2) `simulate`의 `iterations` 리터럴에 강등값을 추가한다**

```typescript
| { type: 'simulate'; payload: TacticContext & { iterations: Iterations } }
type Iterations = 2500 | 5000 | 12500 | 25000;   // 정상값 2종 + 각각의 절반
```

§6.1은 `5000 | 25000`인데 F06-R7이 "반복 횟수를 절반으로 낮춘다"를 요구합니다. 원래 리터럴
그대로면 **강등 상태를 타입으로 표현할 수 없습니다.** `number`로 넓히면 계약이 느슨해지므로
강등값 2개만 유니온에 더합니다. 상세는 [F06 impl §4.4](F06_몬테카를로_시뮬레이션_impl.md).

### 4.2 ORT 초기화 규격 — 이 절이 F05-R3의 전부

```typescript
import * as ort from 'onnxruntime-web/wasm';   // ort.wasm.bundle.min.mjs (72KB, glue 내장)

ort.env.wasm.wasmPaths = { wasm: new URL('/ort/ort-wasm-simd-threaded.wasm', location.origin).href };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';
```

**`wasmPaths`를 문자열 접두사로 주면 안 됩니다** — 1.27.0 번들 코드를 직접 확인한 결과,
접두사(string)를 주면 ORT는 glue `.mjs`도 **같은 접두사에서 받아오려 합니다**. 내장 glue를
쓰는 분기 조건이 `임베드 glue && !(mjs 재정의 || 접두사)`이기 때문입니다. 접두사를 주는 순간
`/ort/ort-wasm-simd-threaded.mjs` 요청이 발생하고, 우리는 그 파일을 호스팅하지 않으므로
**404 → 엔진 로드 실패**입니다. 객체형 `{ wasm }`만 주면 `n`(mjs 재정의)과 `t`(접두사)가 모두
비어 내장 glue가 쓰이고, `locateFile`이 항상 우리 절대 URL을 돌려주어 **요청은 `.wasm` 1건**입니다.

`numThreads = 1`이 필수인 이유도 같은 분기에 있습니다. 멀티스레드(`a=true`)면 내장 glue 사용
조건이 `스크립트 소스 URL 판별 가능`으로 좁아져 Worker 컨텍스트에서 예외가 날 수 있고,
애초에 스레드 wasm은 COOP/COEP 교차출처 격리 헤더를 요구합니다 — 그 헤더는 이 앱에 필요 없는
제약을 전역에 겁니다.

**ML 설계 §5.4의 "non-threaded 선택"과의 관계** — 1.27.0 dist에는 **비스레드 전용 바이너리가
존재하지 않습니다**(`ort-wasm-simd-threaded.*` 4종뿐). 문서가 말한 *의도*(스레드 풀 없음·교차출처
격리 불필요)는 `numThreads = 1`로 그대로 보존되고, *파일명 기준 서술*만 낡았습니다. §7 회수 대상.

| 자산 | raw | gzip -9 (실측) | 배치 |
|---|---|---|---|
| `ort-wasm-simd-threaded.wasm` | 13.48MB | **3.43MB** | `public/ort/` — 빌드타임 복사 |
| ORT 로더 (번들 변종) | 72KB | ~23KB | Worker 청크에 포함 |
| `outcome.onnx` | 789B | — | `public/model/` — 커밋됨 |

**자산 배포 — `scripts/copy-ort.ts`** `[설계 결정]`

`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm` → `public/ort/`로 무조건
덮어쓰기. 원본이 없거나 크기가 1MB 미만이면 **비영 종료**합니다(구현규약 §6 — 조용한 성공 금지).
`package.json`의 `prebuild`·`predev`에 걸어 Vercel 연동 배포(`npm install` → `npm run build`)에서
자동 발화하게 합니다. `public/ort/`는 `.gitignore` — `data/`와 같은 원칙으로 **없으면 실패**합니다.
13.48MB를 git 히스토리에 영구히 남기지 않는 것이 목적이며, 심사자가 clone 시 `npm install`이
필요하다는 사실은 README "실행 방법"에 적습니다.

### 4.3 엔진 수명주기 — `usePredictionEngine` + `client.ts`

```
                    ┌──────────── ready ────────────┐
                    │                               ▼
 mount → loading ───┼── T_soft(4s) ──→ loading+폴백 ─┴─→ onnx 승격
                    │                       │
                    └── T_hard(20s) ────────┴──→ 재기동 1회 → (또 T_hard) → 폴백 확정
```

| 단계 | 동작 |
|---|---|
| mount | `new Worker(new URL('../lib/prediction/worker.ts', import.meta.url), { type: 'module' })` → `postMessage({ type: 'init' })` |
| `ready` 수신 | `engine: 'onnx'`. **큐에 있던 최신 컨텍스트 1건**으로 즉시 `infer` → 이어서 `simulate` |
| 조작 발생 | `context` 변경 구독 → `cancel` 후 `simulate` 요청. `p`는 그대로 (F05-R2) |
| unmount | `worker.terminate()` |

**`init`/`ready`를 나누고 큐를 1건으로 제한하는 이유** (F05-R5) — 로드 중 사용자가 슬라이더를
다섯 번 만지면 다섯 번의 추론이 아니라 **마지막 상태 한 번**만 필요합니다. 중간 상태는 이미
화면에 없습니다. `pendingContext`를 덮어쓰기 변수 하나로 두는 것이 그 정책의 전부입니다.

**`ready` 직후 `infer`를 먼저 보내고 `simulate`를 뒤에 보내는 이유** — `infer`는 MC 없이 확률만
돌려주므로 가장 빠른 정직한 숫자입니다. 기본 상태라면 그 값이 `defaults.precomputed`와 같아
화면이 전혀 흔들리지 않습니다 — 이것이 **F08-R3 "모델 로드 완료 시 무단절 교체"의 교체하는 쪽**
구현입니다. 밴드·프레임은 뒤이은 `simulate`가 채웁니다.

### 4.4 무응답 판정 — 2단 타임아웃 `[설계 결정]`

| 타이머 | 값 | 만료 시 |
|---|---|---|
| `T_soft` | 4초 | **폴백을 켠다.** Worker는 죽이지 않는다 |
| `T_hard` | 20초 | Worker `terminate()` → 새 Worker 생성 → `init` (**1회만**) |
| 재기동 후 `T_hard` | 20초 | 폴백 확정. Worker 종료, 재기동 없음 |

**타임아웃을 두 단으로 나눈 이유** — 3.43MB 다운로드는 느린 회선에서 20초를 넘길 수 있습니다.
한 단짜리 타임아웃은 **정상 동작 중인 느린 회선**과 **진짜 무응답**을 구분하지 못해, 잘 받고 있던
엔진을 죽입니다. `T_soft`는 "사용자를 기다리게 하지 않는다"만 담당하고(폴백이 즉시 확률을 준다),
`T_hard`만 F05-R6의 재기동을 발동합니다.

**폴백은 되돌릴 수 있습니다** `[설계 결정]` — `T_soft` 폴백 이후에도 Worker가 살아 있으므로,
늦게라도 `ready`가 오면 ONNX로 승격하고 배지를 뗍니다. R6은 "재실패 시 폴백으로 전환"만
요구하지 영구 강등을 요구하지 않습니다.

**타이머 리셋 규칙** — 무응답은 "아무 메시지도 오지 않는 것"입니다. `progress`를 포함해
**어떤 응답이든 도착하면 타이머를 리셋**합니다. 그러지 않으면 25,000회 정밀 모드가 정상
진행 중인데도 재기동됩니다.

**승격 시 화면 처리** — 폴백 확률과 ONNX 확률은 값이 다릅니다(폴백은 폼·경험 피처가 빠진 간이
추정). 막대는 기존 220ms transition으로 이동하고, `aria-live="polite"`로 "모델 추정으로
갱신되었습니다"를 한 번 알립니다. 값이 조용히 바뀌게 두지 않습니다.

### 4.5 추론 파이프라인 — F04 GWT를 충족시키는 두 채널

Worker의 `infer` 처리는 **두 단계**이고, 두 번째를 빠뜨리면 템포 슬라이더가 확률을 전혀 움직이지
못합니다([blend.ts](../../../../src/lib/tactics/blend.ts) 주석 · ITERATION-LOG c3).

```
① 분류기        featureOrder 10원소 벡터 (9개는 contexts[matchId].features 상수,
                elo_diff 자리에 context.effectiveEloDiff) → ORT → p_cls
② 무승부 몫     blendDrawShare(p_cls, context.lambda, context.lambda0, scoreGridConstants) → p
```

| 슬라이더 | 확률을 움직이는 채널 |
|---|---|
| 라인 높이 · 압박 강도 · 공격 폭 | ① Δ_eff (승/패 비율) + ② λ 변화 (무승부 몫) |
| 템포 | **② 단독** — 정의상 λ 비율을 안 바꾸고 λ 합만 바꾼다 |

`blendDrawShare`·`gridProbabilities`는 B4가 파이썬 참조 구현과 대조해 둔 순수 함수이므로
Worker에서 **그대로 import**합니다. 재구현하지 않습니다.

### 4.6 JS 통계 폴백 — `src/lib/prediction/fallback.ts`

[ML 설계 §6.3](../../ml/version1.0/ML_설계_v1_0.md) 산식을 변형 없이 옮깁니다.

```
E      = 1 / (1 + 10^(−Δ_eff/400))
p_draw = d̂                              // score-params.json 의 fallback.dHat (= 0.2807)
p_win  = (1 − d̂) · E
p_lose = (1 − d̂) · (1 − E)
```

- 입력 `Δ_eff`는 **조정 계층을 통과한 값**입니다. 그래서 폴백에서도 슬라이더가 확률을 움직입니다.
- 다만 `p_draw`가 상수이므로 **템포는 폴백에서 움직이지 않습니다.** 이것을 `blendDrawShare`로
  메우면 폴백에서도 4종이 다 움직이지만, §6.3 산식을 임의로 확장하는 것이므로 하지 않습니다 —
  "간이 추정"이라는 배지가 이미 그 한계를 고지하고 있고, 정직 고지가 산식 미화보다 우선입니다.
- **메인 스레드에서 실행됩니다.** Worker가 없거나 죽은 상태가 폴백의 전제이기 때문입니다.
  따라서 `fallback.ts`·`montecarlo.ts`·`wilson.ts`는 Worker와 메인 스레드 **양쪽에서 import
  가능한 순수 모듈**이어야 합니다 — `self`·`postMessage` 참조 금지.

### 4.7 Service Worker — `public/sw.js`

F05 GWT의 "재방문(오프라인)에서 추론이 동작한다"는 자산만이 아니라 **앱 셸까지** 캐시해야
성립합니다. 전략을 자원별로 나눕니다 `[설계 결정]`.

| 대상 | 전략 | 근거 |
|---|---|---|
| `/ort/*` · `/model/*` | cache-first, 무기한 | 큰 불변 자산. 갱신은 캐시 버전 번호로 |
| `/_next/static/*` | cache-first | 내용 해시 파일명이라 옛 URL이 옛 내용인 것이 정상 |
| 내비게이션(HTML) | **network-first + 캐시 폴백** | 오프라인에서 열리되, 온라인이면 항상 새 배포를 본다 |
| 그 외 | 통과 | 캐시하지 않는다 |

**HTML을 cache-first로 두지 않는 이유** — 배포해도 옛 화면이 남습니다. Vercel이 CI를 기다리지
않고 배포한다는 이 레포의 기존 함정과 겹치면, 잘못된 화면이 캐시에 박힌 채로 되돌릴 방법이
사용자 브라우저 밖에 없습니다. 마감이 있는 프로젝트에서 감당할 수 없는 실패 유형입니다.

캐시 이름에 빌드 식별자를 넣고 `activate`에서 옛 캐시를 지웁니다. `skipWaiting()`은 **쓰지
않습니다** — 열려 있는 탭의 JS 청크가 교체되면 실행 중 화면이 깨집니다. 다음 방문에 적용됩니다.

**등록 실패는 무시합니다.** SW는 재방문 최적화이지 기능이 아닙니다. `navigator.serviceWorker`가
없거나 등록이 거부돼도(사파리 프라이빗 모드 등) 앱은 완전히 동작해야 합니다.

## 5. 실패 경로

| 계약 | 코드 분기 |
|---|---|
| **F05-R4** wasm 로드 실패 | ① `WebAssembly` 미정의 또는 SIMD 미지원 → Worker `init`이 `error(load)` 응답 ② `InferenceSession.create` 예외 → 같은 응답 ③ `/ort/*.wasm` 404(빌드타임 복사 실패) → 같은 응답. 셋 다 `engine: 'fallback'` + `EstimateBadge`. **패널은 비지 않는다** — `p`는 직전 값 또는 `precomputed` |
| **F05-R5** 로드 전 조작 | `status === 'loading'` 이면 `EngineStatusLine`에 "모델 준비 중". `pendingContext`를 덮어쓰며 보관하고 `ready` 시 1건만 추론. 조작 자체는 **어떤 경우에도 막지 않는다**(슬라이더·드래그에 `disabled` 없음) |
| **F05-R6** Worker 무응답 | §4.4의 2단 타임아웃. `T_hard` 1회 재기동 → 재실패 시 폴백 확정. 재기동 횟수는 `restarted: boolean` 하나로 세며, 세션 동안 초기화하지 않는다 |
| Worker 생성 자체가 실패 | `new Worker(...)`가 던지면(CSP·구형 브라우저) try-catch로 잡아 즉시 폴백. `error(load)`와 같은 종착점 |
| 구식 결과 도착 | `envelope.generation < appliedGeneration` 이면 **폐기**. `progress`도 같은 판정을 거친다 — 옛 시뮬레이션의 진행률이 새 진행률 바를 되감는 것을 막는다 |
| `p` 합이 1에서 벗어남 | 구현규약 §4의 `1 ± 1e-6` 계약. 위반 시 `console.error` + 해당 결과 폐기(직전 값 유지). 화면에 넣고 `probabilityShares`로 덮지 않는다 — 정규화는 표시 방어이지 계약 위반을 삼키는 장치가 아니다 |
| `score-params.json` 컨텍스트 결측 | `getMatchContext`가 이미 throw. Worker 안에서 나면 `error(infer)` → 폴백 |
| Service Worker 등록 실패 | 무시. 로그만 남기고 앱 동작에 영향 없음 (§4.7) |
| SW 캐시 용량 초과 | `caches.put` 실패를 catch. 다음 방문에 네트워크로 받으면 되므로 실패가 곧 정상 경로 |

## 6. 테스트

| 층 | 대상 |
|---|---|
| 단위 (Vitest) | `fallback.ts` — Δ=0에서 `p_win == p_lose`, Δ→±∞에서 [0,1] 수렴, 합 = 1 ± 1e-12 |
| 단위 | 세대 판정 — `appliedGeneration`보다 낮은 봉투를 `setResult`가 무시하는가 |
| 단위 | `client.ts` 상태기계 — 가짜 Worker(포트 스텁)로 `T_soft`→폴백, `T_hard`→재기동 1회, 재실패→폴백 확정, `ready` 늦게 도착 시 승격 |
| 단위 | `pendingContext` 큐잉 — 로드 중 3회 조작 후 `ready` → 추론 요청 **1건**이고 payload가 마지막 컨텍스트 |
| 정합 | `npm run verify:onnx` — 기존 하니스 재실행 (모델·픽스처 무변경이므로 회귀 검사) |
| 게이트 | `npm run gate` 전량 + `npm run build` |
| 수동 (B5 종료 시) | 프로덕션 빌드 Network 탭 — **요청 도메인이 자기 오리진뿐**이고 `/ort/` 요청이 `.wasm` 1건인지 |
| 수동 (B5 종료 시) | `ort.env.wasm.simd = false` 강제 주입 → 폴백 배지가 뜨고 슬라이더가 여전히 확률을 움직이는지 |
| 실기기 (B8) | 오프라인 재방문 · 저속 회선에서 `T_soft` 폴백→승격 전이 · 콘솔 에러 0건 |

**E2E를 도입하지 않는 원칙**(구현규약 §7)은 유지하되, 상태기계만은 단위 테스트로 덮습니다 —
타임아웃·재기동·승격은 수동 재연이 가장 어렵고 회귀가 조용히 일어나는 곳입니다.

## 7. 근거 태그 회수

| 태그 | 내용 | 이관 |
|---|---|---|
| **divergence** | ML 설계 §6.1 `WorkerResponse`에 `generation` 봉투 추가 | B8 문서 v1.1 — §6.1 갱신. README divergence 절에는 불필요(내부 계약) |
| **divergence** | ML 설계 §6.1 `iterations` 리터럴에 `2500 \| 12500` 추가 | B8 문서 v1.1 — §6.1 + F06 §4 동시 갱신 |
| **divergence** | ML 설계 §5.4 "non-threaded 바이너리" — 1.27.0에는 없음. `numThreads=1`로 의도 보존 | B8 문서 v1.1 — §5.4 문구 교정 |
| `[설계 결정]` | `wasmPaths` 객체형 강제 (문자열 접두사 금지) | 회수 불필요 — 근거를 §4.2에 고정 |
| `[설계 결정]` | `T_soft` 4초 · `T_hard` 20초 | B8 저속 회선 실측 후 조정 |
| `[설계 결정]` | 폴백 가역성(늦은 `ready` 승격) | B8 실기기에서 전이 관찰 |
| `[설계 결정]` | SW 자원별 전략 · `skipWaiting` 미사용 | B8 — 재배포 후 새 화면이 다음 방문에 뜨는지 확인 |
| `[설계 결정]` | 폴백에서 템포가 움직이지 않는 것을 허용 | B8 카피 검수 — "간이 추정" 배지 문구가 한계를 충분히 고지하는가 |
| `[추정 설계목표]` | 단일 추론 ≤50ms (F05 §8) | **B8 실측** — `performance.now()` 계측을 `infer` 처리에 심어 콘솔 보고 |
| `[추정 설계목표]` | 초기 로딩 3초 | **B8 실측 · 지표 분리**: ① 첫 화면(SSR HTML) ② 엔진 준비 완료. wasm 3.43MB는 ②에만 실리고 ①을 막지 않는다 — 두 값을 따로 기록한다 |
| 미검증 | Next.js 15.5 webpack에서 `{ type: 'module' }` Worker 청크 생성 | **B5 구현 중 즉시 확인**. 실패해도 종착점은 F05-R4 폴백이라 앱은 살아 있다 |
| 미검증 | Vercel이 `.wasm`을 `application/wasm`으로 서빙하는가 | B5 배포 직후 확인. 아니면 스트리밍 컴파일 대신 버퍼 컴파일로 내려앉을 뿐 기능은 유지 |
