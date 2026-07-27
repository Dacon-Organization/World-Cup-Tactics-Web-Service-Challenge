/**
 * G1 `gate:names` — 실명·연상 표기 검사 (제출 게이트 3순위)
 *
 * 근거: [가공명_체계 §3](../../docs/planning/data/version1.0/가공명_체계_v1_0.md) ·
 *       P7 (서울서부지법 2010카합245 — 성명을 변형해도 특정인이 연상되면 침해)
 *
 * 세 가지를 본다.
 *   ① 공개 파일 어디에도 실명이 **완전 일치**로 나오지 않는가        → 걸리면 실패
 *   ② 가공명이 실명과 **초성+음절수 동시 일치**하지 않는가            → 경고
 *   ③ 가공명의 로마자 표기가 실명과 **편집거리 <=2**가 아닌가         → 경고
 *
 * 경고는 수동 재검 기록(`name-review.json`)이 있어야 통과합니다. 기록 없이 남은
 * 경고는 실패입니다 — "경고니까 괜찮겠지"가 실격의 전형적 경로이기 때문입니다.
 *
 * **대조 목록이 없으면 통과가 아니라 실패입니다.** 조용히 통과시키면 CI나 다른
 * 기계에서 게이트가 늘 초록으로 보이면서 실제로는 아무것도 검사하지 않습니다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, bad, collectFiles, note, ok, type GateResult } from './util.ts';

/** 대조 목록 — 커밋되지 않는 로컬 경로 (data/ 는 .gitignore 대상) */
const REAL_NAMES_PATH = join(ROOT, 'data/gate/real-names.txt');

/** 수동 재검 기록 — 가공명만 담으므로 커밋 가능 */
const REVIEW_PATH = join(ROOT, 'scripts/gates/name-review.json');

/**
 * 리서치 원장은 완전일치 검사에서 제외한다 `[설계 결정]`.
 *
 * 이유: 이 파일들은 FIFA 공식 매치리포트 같은 **1차 출처를 사실로 인용한 대조
 * 기록**이고, 퍼블리시티권이 문제 삼는 것은 서비스가 실명을 이용해 얻는 이익이지
 * 사실 확인 기록이 아니다. 이 기록을 지우면 "세 경기 팩트를 어떻게 확정했는가"의
 * 감사 추적이 사라진다.
 *
 * **다만 제외는 조용히 이뤄지지 않는다** — 실행할 때마다 몇 개 파일에서 몇 건이
 * 걸렸는지 그대로 찍는다. 최종 판단(수정·저장소 밖 이동·현행 유지)은 B8 수동
 * 게이트에서 사람이 한다.
 */
const EXEMPT_PREFIXES = ['docs/research/'];

/**
 * 검사 대상 — 서비스 표면 + **커밋되는 모든 공개 파일**
 *
 * `dev/`(조판 파이프라인·작업 대시보드)를 빼놓지 않는다. 저장소가 공개되므로
 * 대시보드 HTML도 노출 표면이고, 실제로 여기서 실명 1건이 나왔다.
 */
const SCAN_ROOTS = [
  'src',
  'public',
  'docs',
  'notebooks',
  'scripts',
  'dev',
  'README.md',
  'DESIGN.md',
  'DATA-LICENSE.md',
  'CLAUDE.md',
];

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.css', '.html', '.svg',
  '.txt', '.csv', '.ipynb', '.py',
]);

const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const CHO_ROMAN: Record<string, string> = {
  'ㄱ': 'g', 'ㄲ': 'kk', 'ㄴ': 'n', 'ㄷ': 'd', 'ㄸ': 'tt', 'ㄹ': 'r',
  'ㅁ': 'm', 'ㅂ': 'b', 'ㅃ': 'pp', 'ㅅ': 's', 'ㅆ': 'ss', 'ㅇ': '',
  'ㅈ': 'j', 'ㅉ': 'jj', 'ㅊ': 'ch', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': 'h',
};
const JUNG_ROMAN = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];
const JONG_ROMAN = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
  'm', 'p', 'l', 'l', 'l', 'l', 'm', 'p', 't', 't',
  'ng', 't', 't', 'k', 't', 'p', 't',
];

function decompose(char: string): [number, number, number] | null {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code >= 11172) return null;
  return [Math.floor(code / 588), Math.floor((code % 588) / 28), code % 28];
}

function choseongOf(name: string): string {
  let out = '';
  for (const char of name) {
    const parts = decompose(char);
    if (parts) out += CHOSEONG[parts[0]] ?? '';
  }
  return out;
}

function romanize(name: string): string {
  let out = '';
  for (const char of name) {
    const parts = decompose(char);
    if (!parts) {
      out += char;
      continue;
    }
    const [cho, jung, jong] = parts;
    out += (CHO_ROMAN[CHOSEONG[cho] ?? ''] ?? '') + (JUNG_ROMAN[jung] ?? '') + (JONG_ROMAN[jong] ?? '');
  }
  return out.toLowerCase();
}

/** 발음 부호를 벗기고 영숫자만 남긴다 — 체코·스페인어 표기의 diacritic 유무를 같게 본다 */
function normalizeLatin(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 99;
}

interface RealNames {
  hangul: string[];
  latin: string[];
  latinNormalized: string[];
  choLen: Set<string>;
}

function loadRealNames(): RealNames | null {
  if (!existsSync(REAL_NAMES_PATH)) return null;
  const hangul: string[] = [];
  const latin: string[] = [];
  for (const raw of readFileSync(REAL_NAMES_PATH, 'utf8').split(/\r?\n/)) {
    const line = (raw.split('#')[0] ?? '').trim();
    if (!line) continue;
    if (/[가-힣]/.test(line)) hangul.push(line.replace(/\s+/g, ''));
    else latin.push(line);
  }
  const latinNormalized = [
    ...new Set([...latin.map(normalizeLatin), ...hangul.map((h) => normalizeLatin(romanize(h)))]),
  ].filter(Boolean);
  return {
    hangul,
    latin,
    latinNormalized,
    choLen: new Set(hangul.map((h) => `${choseongOf(h)}:${h.length}`)),
  };
}

interface ReviewRecord {
  displayName: string;
  reason: string;
  reviewedAt: string;
  verdict: 'keep' | 'replace';
}

function loadReview(): ReviewRecord[] {
  if (!existsSync(REVIEW_PATH)) return [];
  const parsed: unknown = JSON.parse(readFileSync(REVIEW_PATH, 'utf8'));
  return Array.isArray(parsed) ? (parsed as ReviewRecord[]) : [];
}

export function gateNames(): GateResult {
  const lines: string[] = [];
  const real = loadRealNames();

  if (!real) {
    return {
      name: 'G1 gate:names',
      passed: false,
      lines: [
        bad(`대조 목록이 없습니다: ${REAL_NAMES_PATH}`),
        note('이 목록은 실명을 담으므로 커밋하지 않습니다. 로컬에 두고 다시 실행하세요.'),
        note('없을 때 통과시키면 아무것도 검사하지 않으면서 초록으로 보입니다 — 그래서 실패입니다.'),
      ],
    };
  }
  lines.push(ok(`대조 목록 ${real.hangul.length}건(한글) + ${real.latin.length}건(로마자)`));

  // --- ① 완전 일치 ---------------------------------------------------------
  const files = collectFiles(SCAN_ROOTS, { extensions: TEXT_EXTENSIONS });
  const violations: string[] = [];
  const exemptHits: string[] = [];

  const latinPatterns = real.latin.map(
    (name) => [name, new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')] as const,
  );

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(join(ROOT, file), 'utf8');
    } catch {
      continue;
    }
    const hits = new Set<string>();
    for (const name of real.hangul) {
      if (content.includes(name)) hits.add(name);
    }
    for (const [name, pattern] of latinPatterns) {
      if (pattern.test(content)) hits.add(name);
    }
    if (hits.size === 0) continue;

    const isExempt = EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix));
    const summary = `${file} — ${hits.size}건`;
    if (isExempt) exemptHits.push(summary);
    else violations.push(summary);
  }

  lines.push(note(`검사 파일 ${files.length}개`));
  if (exemptHits.length > 0) {
    lines.push(
      note(`제외 경로(${EXEMPT_PREFIXES.join(', ')}) 적중 ${exemptHits.length}개 파일 — 리서치 원장, B8 수동 판단 대상`),
    );
    for (const hit of exemptHits) lines.push(note(`    ${hit}`));
  }
  if (violations.length > 0) {
    lines.push(bad(`실명 완전 일치 ${violations.length}개 파일`));
    for (const hit of violations) lines.push(bad(`    ${hit}`));
  } else {
    lines.push(ok('실명 완전 일치 0건 (제외 경로 밖)'));
  }

  // --- ②③ 가공명 유사도 ----------------------------------------------------
  const playersPath = join(ROOT, 'src/data/players.json');
  const warnings: { displayName: string; reason: string }[] = [];

  if (!existsSync(playersPath)) {
    lines.push(bad('src/data/players.json 이 없습니다 — 가공명 검사를 할 수 없습니다.'));
    return { name: 'G1 gate:names', passed: false, lines };
  }

  const players = JSON.parse(readFileSync(playersPath, 'utf8')) as {
    players: { displayName: string }[];
  };

  for (const { displayName } of players.players) {
    const flat = displayName.replace(/\s+/g, '');
    const isHangul = /[가-힣]/.test(flat);
    if (isHangul && real.choLen.has(`${choseongOf(flat)}:${flat.length}`)) {
      warnings.push({ displayName, reason: '초성+음절수 동시 일치' });
      continue;
    }
    const latin = isHangul ? normalizeLatin(romanize(flat)) : normalizeLatin(flat);
    const near = real.latinNormalized.find((candidate) => editDistance(latin, candidate) <= 2);
    if (near) {
      warnings.push({ displayName, reason: '로마자 편집거리 ≤2' });
    }
  }

  const review = loadReview();
  const reviewed = new Set(review.filter((r) => r.verdict === 'keep').map((r) => r.displayName));
  const unreviewed = warnings.filter((w) => !reviewed.has(w.displayName));

  if (warnings.length === 0) {
    lines.push(ok(`가공명 ${players.players.length}건 — 유사도 경고 0건`));
  } else {
    lines.push(note(`유사도 경고 ${warnings.length}건 (재검 기록 ${reviewed.size}건)`));
    for (const warning of unreviewed) {
      lines.push(bad(`    ${warning.displayName} — ${warning.reason} · 수동 재검 기록 없음`));
    }
    if (unreviewed.length === 0) {
      lines.push(ok('모든 경고에 수동 재검 기록 있음'));
    }
  }

  return {
    name: 'G1 gate:names',
    passed: violations.length === 0 && unreviewed.length === 0,
    lines,
  };
}

if (import.meta.filename === process.argv[1]) {
  const { report } = await import('./util.ts');
  process.exit(report(gateNames()) ? 0 : 1);
}
