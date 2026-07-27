import { defaults, formations, koreaSquad, matches } from '@/lib/data';

/**
 * S1 전술보드 — **B2 시점의 자리표시자**
 *
 * 이 페이지는 B4에서 실제 전술보드(피치·토큰·슬라이더)로 교체됩니다. 지금은
 * 데이터층이 Server Component에서 실제로 읽히는지, 폰트·토큰이 적용되는지를
 * 눈으로 확인하기 위한 최소 화면입니다.
 *
 * Server Component인 것은 유지됩니다 — `page.tsx`는 전부 Server (구현규약 §2).
 */
export default function Home() {
  const defaultFormation = formations.find((formation) => formation.id === defaults.formationId);
  const defaultMatch = matches.find((match) => match.id === defaults.opponentMatchId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-brand-lit">RE:FORMATION</p>
        <h1 className="text-[22px] font-bold">전술보드 · 스캐폴드</h1>
        <p className="text-[15px] text-text-2">
          B2 블록에서 만든 데이터층이 서버 컴포넌트에서 그대로 읽히는지 확인하는 화면입니다.
          전술보드 UI는 B4에서 이 자리에 들어옵니다.
        </p>
      </header>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[15px] font-semibold">기본 상태 (defaults.json)</h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[15px]">
          <dt className="text-text-2">포메이션</dt>
          <dd>
            {defaultFormation?.label ?? '—'} <span className="text-text-3">({defaults.formationId})</span>
          </dd>
          <dt className="text-text-2">상대</dt>
          <dd>
            {defaultMatch ? `${defaultMatch.venue} · ${defaultMatch.dateKst}` : '—'}
          </dd>
          <dt className="text-text-2">슬라이더</dt>
          <dd>
            {Object.values(defaults.sliders).every((value) => value === 50)
              ? '전부 50 (조정 계층 항등)'
              : '기본값 아님'}
          </dd>
          <dt className="text-text-2">사전 계산 확률</dt>
          <dd className={defaults.precomputed ? '' : 'text-warn'}>
            {defaults.precomputed
              ? `승 ${Math.round(defaults.precomputed.win * 100)} · 무 ${Math.round(defaults.precomputed.draw * 100)} · 패 ${Math.round(defaults.precomputed.lose * 100)}`
              : 'B3에서 채움'}
          </dd>
        </dl>
      </section>

      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-[15px] font-semibold">데이터층 적재 현황</h2>
        <ul className="mt-3 space-y-1 text-[15px] text-text-2">
          <li>포메이션 프리셋 {formations.length}종 · 슬롯 11개 고정</li>
          <li>한국 선수 {koreaSquad.length}명 (가공명)</li>
          <li>
            경기 {matches.length}건 · 확정 이벤트{' '}
            {matches.reduce((sum, match) => sum + match.events.length, 0)}건
          </li>
        </ul>
      </section>

      <footer className="mt-auto text-xs text-text-4">
        가공명 표기 · 비공식 팬 프로젝트
      </footer>
    </main>
  );
}
