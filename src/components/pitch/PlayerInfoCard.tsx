'use client';

import { POSITION_LABEL } from '@/lib/tactics/geometry';
import type { Player, PositionCode } from '@/types/data';

/** 프로파일 4종의 표시 순서와 한글명 — `players.json`의 필드 순서와 같다 */
const PROFILE_ROWS = [
  { key: 'attack', label: '공격' },
  { key: 'defense', label: '수비' },
  { key: 'stamina', label: '체력' },
  { key: 'speed', label: '속도' },
] as const;

interface PlayerInfoCardProps {
  id: string;
  player: Player;
  /** 슬롯이 요구하는 세부 포지션 — 선수 본인의 주포지션이 아니다 */
  code: PositionCode;
  /** 토큰이 프레임 아래쪽에 있으면 카드는 위로 열린다 (프레임 밖으로 나가지 않게) */
  placement: 'above' | 'below';
  align: 'start' | 'center' | 'end';
}

/**
 * 선수 정보 카드 (가공명 노출부)
 *
 * ## 모달이 아니라 팝오버인 이유
 *
 * 토큰 탭은 F03의 클릭-클릭 이동에서 **"선수 선택"** 으로 이미 쓰이고 있습니다. 여기에
 * 모달(포커스 트랩 + 배경 차단)을 띄우면 그다음 단계인 "목적지 탭"이 막혀 이동 경로가
 * 통째로 죽습니다. 그래서 이 카드는 조작을 가로채지 않습니다 — `pointer-events: none`이라
 * 카드 위를 탭해도 그 밑의 피치가 목적지 탭을 받습니다.
 *
 * ## 왜 가공명이 여기에만 있는가
 *
 * 토큰 안은 포지션 약어가 차지합니다(ADR-005 — 등번호 금지). 가공명은 데이터에 실재하는
 * 값이므로 어디에도 안 보이면 존재 이유가 없어집니다. 선택·호버라는 **명시적 의도**가
 * 있을 때만 꺼내 피치를 어지럽히지 않습니다.
 */
export function PlayerInfoCard({ id, player, code, placement, align }: PlayerInfoCardProps) {
  return (
    <div id={id} className="player-info-card" data-placement={placement} data-align={align}>
      {/* 이름·포지션은 토큰의 `aria-label`에 이미 들어 있다 — 두 번 읽히지 않게 가린다 */}
      <p className="player-info-card__name" aria-hidden="true">
        {player.displayName}
      </p>
      <p className="player-info-card__pos" aria-hidden="true">
        {code} · {POSITION_LABEL[code]}
      </p>
      <dl className="player-info-card__stats">
        {PROFILE_ROWS.map((row) => (
          <div key={row.key} className="player-info-card__stat">
            <dt>{row.label}</dt>
            {/* 막대는 중립색이다 — 결과 3색·포지션 4색과 같은 채널을 쓰면 의미가 섞인다.
                수치를 함께 두므로 막대 자체는 스크린리더에서 뺀다 */}
            <dd>
              <span className="player-info-card__bar" aria-hidden="true">
                <span style={{ width: `${player.profile[row.key]}%` }} />
              </span>
              <b>{player.profile[row.key]}</b>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
