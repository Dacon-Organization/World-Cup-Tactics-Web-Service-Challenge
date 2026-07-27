/**
 * `npm run gate` — 제출 게이트 일괄 실행
 *
 * 하나라도 실패하면 종료 코드 1로 나가고, 커밋·빌드를 진행하지 않습니다.
 * **우회 플래그를 만들지 않습니다** (docs/제출-게이트.md §1).
 *
 * 실패한 게이트에서 멈추지 않고 전부 돌린 뒤 한 번에 보고합니다 — 한 번의
 * 실행으로 고쳐야 할 것을 전부 알 수 있어야 하기 때문입니다.
 */

import { gateLicense } from './license.ts';
import { gateNames } from './names.ts';
import { gateRefs } from './refs.ts';
import { report, type GateResult } from './util.ts';

const gates: (() => GateResult)[] = [gateNames, gateRefs, gateLicense];

const results = gates.map((gate) => {
  try {
    return gate();
  } catch (error) {
    return {
      name: gate.name,
      passed: false,
      lines: [`  ✗ 게이트 실행 중 예외: ${error instanceof Error ? error.message : String(error)}`],
    } satisfies GateResult;
  }
});

const allPassed = results.map(report).every(Boolean);

const failed = results.filter((result) => !result.passed).map((result) => result.name);
console.log('');
if (allPassed) {
  console.log(`제출 게이트 ${results.length}종 전부 통과.`);
} else {
  console.log(`제출 게이트 실패: ${failed.join(', ')}`);
  console.log('통과할 때까지 커밋하지 않습니다.');
}

process.exit(allPassed ? 0 : 1);
