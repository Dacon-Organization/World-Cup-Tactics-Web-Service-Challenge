/**
 * 데이터층 단위 테스트
 *
 * G2(`npm run gate`)가 스키마와 참조 무결성을 보지만, 여기서는 **문서가 정한
 * 기하 규칙**을 봅니다. 스키마는 "x가 0~1인가"까지만 알고, "좌우 대칭인가"나
 * "라인 간격이 0.20~0.26인가"는 모르기 때문입니다.
 */

import { describe, expect, it } from 'vitest';
import { defaults, formations, getFormation, getMatch, koreaSquad, playersFile } from '@/lib/data';
import type { PositionRole } from '@/types/data';

describe('formations.json', () => {
  it('ADR-003이 정한 4프리셋이 모두 있다', () => {
    expect(formations.map((formation) => formation.id).sort()).toEqual([
      'f343',
      'f352',
      'f433',
      'f442',
    ]);
  });

  it('모든 프리셋이 11슬롯이고 GK는 정확히 1명이다', () => {
    for (const formation of formations) {
      expect(formation.slots).toHaveLength(11);
      expect(formation.slots.filter((slot) => slot.role === 'GK')).toHaveLength(1);
    }
  });

  it('f433 좌표가 DESIGN.md §3.4 원본과 일치한다', () => {
    // 기획서 PDF에 실린 그림과 배포 화면이 같아야 하므로 이 값은 협상 대상이 아니다
    const expected = [
      [0.5, 0.06],
      [0.16, 0.24],
      [0.38, 0.2],
      [0.62, 0.2],
      [0.84, 0.24],
      [0.28, 0.48],
      [0.5, 0.44],
      [0.72, 0.48],
      [0.2, 0.74],
      [0.5, 0.8],
      [0.8, 0.74],
    ];
    const actual = getFormation('f433').slots.map((slot) => [slot.x, slot.y]);
    expect(actual).toEqual(expected);
  });

  it('모든 프리셋이 좌우 대칭이다', () => {
    for (const formation of formations) {
      for (const slot of formation.slots) {
        const mirrored = formation.slots.find(
          (other) =>
            other.role === slot.role &&
            Math.abs(other.x - (1 - slot.x)) < 1e-9 &&
            Math.abs(other.y - slot.y) < 1e-9,
        );
        expect(mirrored, `${formation.id} slot ${slot.slotIndex} 의 대칭 짝이 없다`).toBeDefined();
      }
    }
  });

  it('신설 3프리셋의 라인 간 간격이 0.20~0.26이다', () => {
    // f433은 원본 좌표를 그대로 쓰므로 이 규칙의 대상이 아니다 (DESIGN.md §3.4)
    const meanY = (slots: { y: number }[]): number =>
      slots.reduce((sum, slot) => sum + slot.y, 0) / slots.length;

    for (const formation of formations.filter((item) => item.id !== 'f433')) {
      const lines: PositionRole[] = ['DF', 'MF', 'FW'];
      const centers = lines.map((role) =>
        meanY(formation.slots.filter((slot) => slot.role === role)),
      );
      for (let i = 1; i < centers.length; i += 1) {
        const gap = (centers[i] ?? 0) - (centers[i - 1] ?? 0);
        expect(gap, `${formation.id} 의 ${lines[i - 1]}→${lines[i]} 간격`).toBeGreaterThanOrEqual(0.2);
        expect(gap, `${formation.id} 의 ${lines[i - 1]}→${lines[i]} 간격`).toBeLessThanOrEqual(0.26);
      }
    }
  });
});

describe('players.json', () => {
  it('한국 26명 + 상대 3팀 이벤트 관련 선수로 구성된다', () => {
    expect(koreaSquad).toHaveLength(26);
    expect(playersFile.players).toHaveLength(29);
  });

  it('선수 ID가 유일하다', () => {
    const ids = playersFile.players.map((player) => player.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('가공명이 서로 겹치지 않는다', () => {
    // 같은 이름이 둘이면 토큰만 보고 누구인지 구분할 수 없다
    const names = playersFile.players.map((player) => player.displayName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('실명을 담을 필드가 스키마에 없다', () => {
    for (const player of playersFile.players) {
      expect(Object.keys(player).sort()).toEqual([
        'displayName',
        'id',
        'position',
        'profile',
        'teamId',
      ]);
    }
  });
});

describe('matches.json', () => {
  it('세 경기가 라운드 1·2·3으로 있다', () => {
    expect([...new Set(['cze', 'mex', 'rsa'].map((id) => getMatch(id as 'cze').round))].sort()).toEqual([
      1, 2, 3,
    ]);
  });

  it('xG에는 항상 출처 라벨이 붙는다', () => {
    // 같은 경기의 xG가 모델마다 다르다는 것이 P13에서 실측됐다
    for (const id of ['cze', 'mex', 'rsa'] as const) {
      const match = getMatch(id);
      if (match.xg) expect(match.xg.source).toBe('Opta');
    }
  });

  it('교체 이벤트는 같은 분에 2행으로 들어간다', () => {
    const subs = getMatch('rsa').events.filter((event) => event.type === 'sub');
    expect(subs).toHaveLength(2);
    expect(subs[0]?.minute).toBe(subs[1]?.minute);
    expect(subs[0]?.playerId).not.toBe(subs[1]?.playerId);
  });
});

describe('defaults.json', () => {
  it('슬라이더가 전부 50이다 — 이때 조정 계층은 항등이어야 한다', () => {
    expect(Object.values(defaults.sliders)).toEqual([50, 50, 50, 50]);
  });

  it('기본 상대가 체코다 (가공명_체계 §5.2)', () => {
    expect(defaults.opponentMatchId).toBe('cze');
  });
});
