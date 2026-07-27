/**
 * `npm run copy:ort` (prebuild·predev 자동 실행) — ORT wasm 자체 호스팅 자산 배치
 *
 * 근거: [F05 impl §4.2](../docs/planning/impl/version1.0/F05_온디바이스_예측_패널_impl.md)
 *
 * ## 왜 git에 커밋하지 않는가
 *
 * 바이너리가 13.48MB입니다. 커밋하면 히스토리에 영구히 남고(나중에 제거하기 어렵다)
 * clone이 그만큼 느려집니다. `node_modules`에서 복사하면 **package.json이 고정한 버전과
 * 항상 일치**한다는 이점도 따라옵니다 — 커밋본은 의존성을 올릴 때 조용히 낡습니다.
 *
 * ## 왜 조용히 넘어가지 않는가
 *
 * 이 파일이 없으면 브라우저에서 wasm 로드가 404로 실패하고, 앱은 폴백으로 내려앉아
 * "간이 추정" 배지를 단 채 정상처럼 보입니다. 그 상태로 배포되는 것을 막는 유일한 방법이
 * **빌드를 실패시키는 것**입니다 (구현규약 §6 — 침묵 실패 금지).
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * 이 하나만 호스팅하면 됩니다 — `onnxruntime-web/wasm` 서브패스가 glue `.mjs`를 내장한
 * 번들 변종(`ort.wasm.bundle.min.mjs`)으로 해결되기 때문입니다. 대신 `wasmPaths`를
 * **객체형 `{ wasm }`** 으로 줘야 내장 glue가 쓰입니다(문자열 접두사를 주면 `.mjs`까지
 * 받아오려 하고, 우리는 그것을 호스팅하지 않으므로 404가 납니다).
 */
const WASM_FILE = 'ort-wasm-simd-threaded.wasm';

const SOURCE = join(ROOT, 'node_modules/onnxruntime-web/dist', WASM_FILE);
const TARGET = join(ROOT, 'public/ort', WASM_FILE);

/** 온전한 바이너리는 13MB대다. 이보다 훨씬 작으면 잘린 파일이거나 LFS 포인터다 */
const MIN_BYTES = 1_000_000;

function fail(message: string): never {
  console.error(`✗ ORT 자산 배치 실패 — ${message}`);
  process.exit(1);
}

if (!existsSync(SOURCE)) {
  fail(
    `원본이 없습니다: ${SOURCE}\n` +
      '  onnxruntime-web 이 설치되지 않았습니다. `npm install` 을 먼저 실행하세요.',
  );
}

const sourceSize = statSync(SOURCE).size;
if (sourceSize < MIN_BYTES) {
  fail(`원본이 비정상적으로 작습니다 (${sourceSize} bytes): ${SOURCE}`);
}

mkdirSync(dirname(TARGET), { recursive: true });
// 조건부 복사를 하지 않는다 — 의존성을 올렸을 때 옛 파일이 남아 있으면
// 로더와 바이너리의 버전이 어긋나 진단이 어려운 실패가 된다
copyFileSync(SOURCE, TARGET);

const copiedSize = statSync(TARGET).size;
if (copiedSize !== sourceSize) {
  fail(`복사본 크기가 원본과 다릅니다 (${copiedSize} ≠ ${sourceSize})`);
}

console.log(
  `✓ ORT wasm 배치 완료 — public/ort/${WASM_FILE} (${(copiedSize / 1024 / 1024).toFixed(2)}MB)`,
);
