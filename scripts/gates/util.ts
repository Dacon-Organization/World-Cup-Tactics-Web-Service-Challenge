/**
 * 게이트 공통 유틸 — 결과 표현·파일 수집
 *
 * 게이트의 설계 원칙은 [docs/제출-게이트.md](../../docs/제출-게이트.md)에 있습니다.
 * 핵심은 **우회 플래그를 만들지 않는 것**과 **침묵 실패를 만들지 않는 것**입니다.
 * 검사할 수 없는 상태(대조 목록 없음 등)는 통과가 아니라 실패입니다.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

export interface GateResult {
  name: string;
  passed: boolean;
  /** 화면에 그대로 찍히는 줄들. 실패 사유는 여기에 전부 적는다 */
  lines: string[];
}

export const ok = (text: string): string => `  ✓ ${text}`;
export const bad = (text: string): string => `  ✗ ${text}`;
export const note = (text: string): string => `  · ${text}`;

/** 어떤 게이트에서도 훑지 않는 경로 */
const ALWAYS_SKIP = new Set([
  'node_modules',
  '.next',
  '.git',
  'data', // 실명 대조 목록·생성 스크립트가 사는 곳 (gitignore)
  '.claude',
  'out',
  'dist',
]);

export interface CollectOptions {
  /** 이 확장자만 (소문자, 점 포함) */
  extensions?: Set<string>;
  /** 루트 기준 상대 경로가 이 접두사로 시작하면 건너뛴다 */
  skipPrefixes?: string[];
}

/** 저장소 안의 텍스트 파일을 모은다. 반환값은 루트 기준 상대 경로(슬래시 정규화) */
export function collectFiles(roots: string[], options: CollectOptions = {}): string[] {
  const found: string[] = [];

  const visit = (absolute: string): void => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ALWAYS_SKIP.has(entry.name)) continue;
      const child = join(absolute, entry.name);
      const rel = relative(ROOT, child).split(sep).join('/');
      if (options.skipPrefixes?.some((prefix) => rel.startsWith(prefix))) continue;
      if (entry.isDirectory()) {
        visit(child);
      } else if (!options.extensions || options.extensions.has(extensionOf(entry.name))) {
        found.push(rel);
      }
    }
  };

  for (const root of roots) {
    const absolute = join(ROOT, root);
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      visit(absolute);
    } else {
      const rel = relative(ROOT, absolute).split(sep).join('/');
      if (!options.skipPrefixes?.some((prefix) => rel.startsWith(prefix))) {
        found.push(rel);
      }
    }
  }

  return found.sort();
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
}

/** 게이트 하나를 실행하고 결과를 찍는다. 통과 여부를 돌려준다 */
export function report(result: GateResult): boolean {
  const mark = result.passed ? '통과' : '실패';
  console.log(`\n[${result.name}] ${mark}`);
  for (const line of result.lines) {
    console.log(line);
  }
  return result.passed;
}
