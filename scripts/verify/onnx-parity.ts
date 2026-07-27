/**
 * `npm run verify:onnx` — ONNX 정합 검증 하니스 (ML-R5)
 *
 * 근거: [ML 설계 §5.2](../../docs/planning/ml/version1.0/ML_설계_v1_0.md)
 *
 * **이 검사가 없으면 놓치는 실패**: 학습은 잘 됐는데 브라우저에서 다른 확률이 나오는
 * 침묵 실패입니다. 모델이 에러를 내지 않고 *조금 다른 값*을 내므로, 화면만 봐서는
 * 절대 발견되지 않습니다.
 *
 * 그래서 검사 대상은 파이썬 쪽 onnxruntime이 아니라 **브라우저가 실제로 쓰는 런타임**
 * 이어야 합니다. `onnxruntime-web`을 Node에서 wasm 백엔드로 돌리면 B5의 Web Worker가
 * 쓸 커널과 같은 코드 경로를 지나갑니다 — 그것이 이 하니스가 `onnxruntime-node`가 아닌
 * `onnxruntime-web`을 쓰는 이유입니다.
 *
 * 기대값(`tests/fixtures/onnx-cases.json`)은 노트북 03장이 파이썬 sklearn 기준으로
 * 생성합니다. 모델을 교체하면(06장 GBDT) 픽스처도 함께 재생성되어야 하며, 재생성 없이
 * 모델만 바꾸면 이 하니스가 실패해서 알려 줍니다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ort from 'onnxruntime-web';
import { ROOT, bad, note, ok, report, type GateResult } from '../gates/util.ts';

interface Fixture {
  featureOrder: string[];
  classOrder: string[];
  tolerance: number;
  cases: { features: number[]; expected: number[] }[];
}

const MODEL_PATH = join(ROOT, 'public/model/outcome.onnx');
const PARAMS_PATH = join(ROOT, 'public/model/score-params.json');
const FIXTURE_PATH = join(ROOT, 'tests/fixtures/onnx-cases.json');

async function verifyOnnx(): Promise<GateResult> {
  const lines: string[] = [];
  const problems: string[] = [];

  for (const path of [MODEL_PATH, PARAMS_PATH, FIXTURE_PATH]) {
    if (!existsSync(path)) {
      return {
        name: 'ONNX 정합 (ML-R5)',
        passed: false,
        lines: [bad(`산출물 없음: ${path} — 노트북 03장을 먼저 실행하세요`)],
      };
    }
  }

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;
  const params = JSON.parse(readFileSync(PARAMS_PATH, 'utf8')) as {
    model: { inputName: string; outputName: string; featureOrder: string[]; classOrder: string[] };
  };

  // 계약 대조 — 픽스처와 배포 파라미터가 같은 계약을 말하고 있는가
  const sameOrder = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);
  if (!sameOrder(params.model.featureOrder, fixture.featureOrder)) {
    problems.push('score-params.json 과 픽스처의 featureOrder 가 다릅니다 — 계약 불일치');
  }
  if (!sameOrder(params.model.classOrder, fixture.classOrder)) {
    problems.push('score-params.json 과 픽스처의 classOrder 가 다릅니다 — 계약 불일치');
  }

  // wasm 바이너리는 패키지 안에서 찾는다 (외부 CDN 요청 0건 — F05-R3).
  // Windows 절대경로(`C:\...`)는 Node의 ESM 로더가 거부하므로 file:// URL로 준다.
  ort.env.wasm.wasmPaths = pathToFileURL(join(ROOT, 'node_modules/onnxruntime-web/dist/')).href;
  ort.env.wasm.numThreads = 1; // non-threaded 서브셋 (ML 설계 §5.4)
  ort.env.logLevel = 'error';

  const session = await ort.InferenceSession.create(readFileSync(MODEL_PATH), {
    executionProviders: ['wasm'],
  });

  const featureCount = fixture.featureOrder.length;
  const classCount = fixture.classOrder.length;
  const rows = fixture.cases.length;
  const flat = Float32Array.from(fixture.cases.flatMap((c) => c.features));
  const output = await session.run({
    [params.model.inputName]: new ort.Tensor('float32', flat, [rows, featureCount]),
  });
  const probs = output[params.model.outputName]?.data as Float32Array | undefined;
  if (!probs) {
    problems.push(`출력 '${params.model.outputName}' 가 세션 결과에 없습니다`);
    return { name: 'ONNX 정합 (ML-R5)', passed: false, lines: problems.map(bad) };
  }

  let maxError = 0;
  let worst = -1;
  let maxSumDeviation = 0;
  for (let i = 0; i < rows; i += 1) {
    let sum = 0;
    for (let k = 0; k < classCount; k += 1) {
      const got = probs[i * classCount + k] as number;
      const want = fixture.cases[i]!.expected[k] as number;
      const error = Math.abs(got - want);
      if (error > maxError) {
        maxError = error;
        worst = i;
      }
      sum += got;
    }
    maxSumDeviation = Math.max(maxSumDeviation, Math.abs(sum - 1));
  }

  lines.push(note(`onnxruntime-web ${ort.env.versions.web} · wasm 백엔드 · 스레드 1`));
  lines.push(note(`케이스 ${rows}건 × ${classCount}범주 (입력 ${featureCount}원소)`));

  if (maxError <= fixture.tolerance) {
    lines.push(ok(`Python ↔ ORT-Web 최대 절대 오차 ${maxError.toExponential(3)} ≤ ${fixture.tolerance}`));
  } else {
    problems.push(
      `최대 절대 오차 ${maxError.toExponential(3)} > 허용치 ${fixture.tolerance} (케이스 #${worst}) ` +
        '— ML-R5에 따라 배포를 중단하고 m2cgen 경로로 전환해야 합니다',
    );
  }

  if (maxSumDeviation <= 1e-6) {
    lines.push(ok(`확률 합 최대 이탈 ${maxSumDeviation.toExponential(2)} ≤ 1e-6`));
  } else {
    problems.push(`확률 합이 1에서 ${maxSumDeviation.toExponential(2)} 벗어났습니다 (계약: 1 ± 1e-6)`);
  }

  for (const problem of problems) lines.push(bad(problem));
  return { name: 'ONNX 정합 (ML-R5)', passed: problems.length === 0, lines };
}

if (import.meta.filename === process.argv[1]) {
  process.exit(report(await verifyOnnx()) ? 0 : 1);
}

export { verifyOnnx };
