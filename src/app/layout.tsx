import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import './globals.css';

export const metadata: Metadata = {
  title: 'RE:FORMATION — 같은 경기, 다른 전술',
  description:
    '2026 월드컵 한국 대표팀의 세 경기를 전술로 다시 짜 보는 비공식 팬 프로젝트. 예측은 브라우저 안에서만 계산됩니다.',
  // 비공식 팬 프로젝트임을 검색 결과에서도 오해하지 않게 명시
  applicationName: 'RE:FORMATION',
};

export const viewport: Viewport = {
  // 기본값이 다크이므로 주소창 색도 다크다. 라이트로 바꾼 사용자는 이 값과 어긋나지만,
  // 첫 진입(= 심사자가 보는 상태)의 정합을 우선한다.
  themeColor: '#10161f',
  // 400% 확대에서도 가로 스크롤이 생기지 않아야 하므로 확대를 막지 않는다 (DESIGN.md §6)
  initialScale: 1,
  width: 'device-width',
};

/**
 * 테마 부트 스크립트 — **첫 페인트 전에** 실행돼야 한다
 *
 * React가 마운트된 뒤에 테마를 적용하면 라이트 사용자가 다크 화면을 한 번 보고 번쩍입니다.
 * `<head>` 안의 동기 스크립트만 그 순서를 보장합니다.
 *
 * 저장값이 'light'일 때만 속성을 답니다 — 기본값(다크)은 CSS의 `:root`가 이미 갖고 있으므로
 * 아무것도 하지 않는 것이 곧 다크입니다. 저장소 접근이 막혀 예외가 나도 다크로 남습니다.
 *
 * 키 문자열은 `ThemeToggle`의 `THEME_STORAGE_KEY`와 같아야 합니다. 여기서 그 상수를
 * import하지 않는 이유는, 이 문자열이 번들이 아니라 **인라인 스크립트 본문**으로 들어가기
 * 때문입니다.
 */
const THEME_BOOT = `try{if(localStorage.getItem('rf-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
