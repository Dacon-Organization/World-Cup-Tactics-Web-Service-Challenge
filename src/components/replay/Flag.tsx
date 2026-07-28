import type { Team } from '@/types/data';

interface FlagProps {
  team: Team;
  /** 카드는 `md`(32px), 경기 헤더는 `lg`(44px) */
  size?: 'md' | 'lg';
}

/**
 * 국기 (F09-R5 — 빈 아이콘 금지)
 *
 * ## JS 없이 폴백을 만드는 방법
 *
 * R5는 "국기 로드가 실패하면 국가 코드 텍스트로 대체"를 요구합니다. `onError` 핸들러를
 * 쓰면 이 컴포넌트가 Client Component가 되고, **JS가 죽은 환경에서는 폴백 자체가 죽습니다**
 * — 폴백이 가장 필요한 상황에서 작동하지 않는 설계입니다.
 *
 * 대신 **코드 텍스트를 항상 렌더해 두고 그 위에 이미지를 덮습니다.** 이미지가 오면 코드가
 * 가려지고, 이미지가 실패하면(404·차단·오프라인) 그 자리에 코드가 그대로 남습니다.
 * 서버 HTML만으로 성립하므로 `<noscript>` 경로에서도 동일합니다.
 *
 * `alt=""`인 이유: 카드에는 국가명이 텍스트로 이미 있습니다. 국기에 대체 텍스트를 또 주면
 * 스크린리더가 "체코 체코전"으로 두 번 읽습니다. 로드 실패 시 대체 텍스트가 그려지는
 * 브라우저 동작에 기대지 않는 것도 이 선택의 이유입니다 — 위의 코드 층이 그 일을 합니다.
 *
 * ## 국기를 수정하지 않는다
 *
 * 파일은 flag-icons 원본 무수정 복사본입니다. 색·비율·문양을 바꾸지 않고 크기만 바꿉니다
 * ([public/flags/NOTICE.md](../../../public/flags/NOTICE.md) · 국기법 제11조 제2항).
 */
export function Flag({ team, size = 'md' }: FlagProps) {
  return (
    <span className="flag" data-size={size}>
      {/* 폴백 층 — 이미지가 오면 가려진다. 3자리 코드는 F09-R5의 예시 표기(CZE) */}
      <span className="flag__code" aria-hidden="true">
        {team.id.toUpperCase()}
      </span>
      {/*
        `next/image`를 쓰지 않습니다. Next의 이미지 최적화는 SVG를 리사이즈·재인코딩하지
        않고 그대로 내보내며(그러려면 `dangerouslyAllowSVG`로 SVG 허용을 열어야 합니다),
        여기서 얻을 이득이 없습니다. 파일은 우리가 커밋한 4개뿐이고 크기도 고정입니다.
        무엇보다 국기 원본을 **변형하지 않는다**는 규약(NOTICE.md)에 맞습니다.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="flag__img"
        src={`/flags/${team.flagCode}.svg`}
        alt=""
        width={size === 'lg' ? 44 : 32}
        height={size === 'lg' ? 33 : 24}
      />
    </span>
  );
}
