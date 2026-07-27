/**
 * G3 `gate:license` — 라이선스 인벤토리
 *
 * 근거: [제출 게이트 §1 G3](../../docs/제출-게이트.md)
 *
 * 규칙은 하나다: **허용목록 밖 라이선스는 `license-exceptions.json`에 패키지
 * 이름·라이선스·사유가 적혀 있어야 하고, `브라우저전달: true`면 예외를 인정하지
 * 않는다.** 기재가 없으면 실패다.
 *
 * npm 의 production 의존성 여부를 합격 기준으로 쓰지 않는 이유: Next.js 의
 * production 의존성에는 빌드 전용 도구(이미지 네이티브 바이너리, 브라우저 지원
 * 데이터셋)가 섞여 있어서 "npm production = 브라우저 전달"이 성립하지 않는다.
 * 실제로 번들에 들어갔는지는 정적 분석(G4, B8)이 본다. 여기서는 **인벤토리와
 * 사유가 빠짐없이 존재하는지**만 보증하고, production closure 소속 여부는
 * 검토자가 보라고 화면에 표시만 한다.
 *
 * 에셋(폰트·데이터)의 고지 파일 존재도 함께 확인한다 — 파일이 없으면 OFL·CC BY-SA의
 * 고지 의무를 못 지킨 상태다.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, bad, note, ok, type GateResult } from './util.ts';

/** 배포물에 들어가도 되는 라이선스 */
const STRICT_ALLOW = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'OFL-1.1',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
]);

interface ExceptionEntry {
  패키지: string;
  라이선스: string;
  브라우저전달: boolean;
  사유: string;
}

function loadExceptions(): Map<string, ExceptionEntry> {
  const path = join(ROOT, 'scripts/gates/license-exceptions.json');
  if (!existsSync(path)) return new Map();
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { 예외?: ExceptionEntry[] };
  return new Map((parsed.예외 ?? []).map((entry) => [entry.패키지, entry]));
}

/** node_modules 를 훑어 패키지별 라이선스를 모은다 */
function scanInstalled(): Map<string, string> {
  const licenses = new Map<string, string>();

  const visit = (directory: string, depth: number): void => {
    if (depth > 5) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(directory, entry.name);
      if (entry.name.startsWith('@')) {
        visit(child, depth);
        continue;
      }
      const manifest = join(child, 'package.json');
      if (existsSync(manifest)) {
        try {
          const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
            name?: string;
            license?: string | { type?: string };
            licenses?: { type?: string }[];
          };
          if (pkg.name) {
            const license =
              typeof pkg.license === 'string'
                ? pkg.license
                : pkg.license?.type ??
                  pkg.licenses?.map((item) => item.type).filter(Boolean).join(' OR ') ??
                  '';
            licenses.set(pkg.name, license || '(라이선스 필드 없음)');
          }
        } catch {
          // 깨진 manifest 는 아래 '미확인'으로 남는다
        }
      }
      const nested = join(child, 'node_modules');
      if (existsSync(nested)) visit(nested, depth + 1);
    }
  };

  visit(join(ROOT, 'node_modules'), 0);
  return licenses;
}

/**
 * production 의존성 closure — 배포물에 들어가는 패키지 이름 집합
 *
 * `npm ls` 를 부르지 않고 manifest 를 직접 따라간다. Node 20+ 는 보안상
 * `.cmd`·`.bat` 직접 실행을 막아 Windows 에서 `npm.cmd` 호출이 실패하고,
 * 셸을 켜면 그것대로 주입 표면이 생긴다. 게이트가 환경 때문에 "판정 불가"로
 * 빠지는 쪽이 더 나쁘므로 계산을 자체적으로 한다.
 */
function productionClosure(): Set<string> | null {
  const rootManifest = join(ROOT, 'package.json');
  if (!existsSync(rootManifest)) return null;

  const readManifest = (path: string): Record<string, unknown> | null => {
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const root = readManifest(rootManifest);
  if (!root) return null;

  const names = new Set<string>();
  const queue = Object.keys((root.dependencies ?? {}) as Record<string, string>);

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || names.has(name)) continue;
    names.add(name);
    // npm 은 기본적으로 호이스팅하므로 루트 node_modules 에서 찾으면 대부분 맞는다
    const manifest = readManifest(join(ROOT, 'node_modules', name, 'package.json'));
    if (!manifest) continue;
    for (const key of ['dependencies', 'optionalDependencies'] as const) {
      queue.push(...Object.keys((manifest[key] ?? {}) as Record<string, string>));
    }
  }

  return names;
}

export function gateLicense(): GateResult {
  const lines: string[] = [];
  const problems: string[] = [];

  const installed = scanInstalled();
  if (installed.size === 0) {
    return {
      name: 'G3 gate:license',
      passed: false,
      lines: [bad('node_modules 를 읽지 못했습니다. `npm install` 후 다시 실행하세요.')],
    };
  }

  const production = productionClosure();
  const exceptions = loadExceptions();
  const usedExceptions = new Set<string>();
  let strictCount = 0;

  for (const [name, license] of [...installed].sort()) {
    if (STRICT_ALLOW.has(license)) {
      strictCount += 1;
      continue;
    }
    const entry = exceptions.get(name);
    if (!entry) {
      problems.push(`${name} 의 라이선스 '${license}' 가 허용목록 밖이고 예외 기재도 없음`);
      continue;
    }
    if (entry.라이선스 !== license) {
      problems.push(
        `${name} 의 라이선스가 예외 기재('${entry.라이선스}')와 다름 — 실제 '${license}'`,
      );
      continue;
    }
    if (entry.브라우저전달) {
      problems.push(`${name} 은 브라우저로 전달되는데 라이선스 '${license}' 가 허용목록 밖 (예외 불가)`);
      continue;
    }
    usedExceptions.add(name);
  }

  lines.push(ok(`설치 패키지 ${installed.size}개 · 엄격 허용목록 적합 ${strictCount}개`));
  if (production) {
    lines.push(note(`npm production closure ${production.size}개 (번들 적재 여부는 G4에서 확인)`));
  }
  for (const name of [...usedExceptions].sort()) {
    const inProduction = production?.has(name) ? ' · production closure' : '';
    lines.push(note(`예외 적용: ${name} (${installed.get(name)})${inProduction}`));
  }
  // 기재됐으나 설치되지 않은 예외 — 플랫폼별 네이티브 바이너리는 정상이다.
  // 개발은 Windows, CI·배포 빌드는 Linux라서 양쪽 이름을 다 적어 두고, 지금 플랫폼에
  // 없는 쪽은 여기로 떨어진다. 그것을 '정리 대상'이라고 부르면 지우게 되고, 지우면
  // 반대 플랫폼에서 게이트가 깨진다.
  const PLATFORM_SUFFIX = /-(win32|linux|linuxmusl|darwin|freebsd|android|wasm32)(-|$)/;
  for (const name of exceptions.keys()) {
    if (installed.has(name)) continue;
    if (PLATFORM_SUFFIX.test(name)) {
      lines.push(note(`다른 플랫폼용 기재 (이 환경에는 미설치): ${name}`));
    } else {
      lines.push(note(`예외 기재됐으나 설치되어 있지 않음: ${name} — 정리 대상`));
    }
  }

  // --- 에셋 고지 -----------------------------------------------------------
  const assetChecks: [string, string][] = [
    ['public/fonts/OFL.txt', '폰트 OFL 1.1 사본'],
    ['public/fonts/NOTICE.md', '폰트 파생 고지 (서브셋·이름 변경 사유)'],
    ['DATA-LICENSE.md', '학습 데이터 라이선스 고지'],
  ];
  for (const [path, label] of assetChecks) {
    if (existsSync(join(ROOT, path))) {
      lines.push(ok(`${label}: ${path}`));
    } else {
      problems.push(`${label} 파일이 없습니다: ${path}`);
    }
  }

  const dataLicensePath = join(ROOT, 'DATA-LICENSE.md');
  if (existsSync(dataLicensePath)) {
    const content = readFileSync(dataLicensePath, 'utf8');
    if (!/CC[\s-]?BY[\s-]?SA/i.test(content)) {
      problems.push('DATA-LICENSE.md 에 CC BY-SA 고지 문구가 없습니다 (P10 분리 고지)');
    } else {
      lines.push(ok('DATA-LICENSE.md 에 CC BY-SA 고지 확인'));
    }
  }

  for (const problem of problems) lines.push(bad(problem));

  return { name: 'G3 gate:license', passed: problems.length === 0, lines };
}

if (import.meta.filename === process.argv[1]) {
  const { report } = await import('./util.ts');
  process.exit(report(gateLicense()) ? 0 : 1);
}
