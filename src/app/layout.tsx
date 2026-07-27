import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RE:FORMATION — 같은 경기, 다른 전술',
  description:
    '2026 월드컵 한국 대표팀의 세 경기를 전술로 다시 짜 보는 비공식 팬 프로젝트. 예측은 브라우저 안에서만 계산됩니다.',
  // 비공식 팬 프로젝트임을 검색 결과에서도 오해하지 않게 명시
  applicationName: 'RE:FORMATION',
};

export const viewport: Viewport = {
  themeColor: '#10161f',
  // 400% 확대에서도 가로 스크롤이 생기지 않아야 하므로 확대를 막지 않는다 (DESIGN.md §6)
  initialScale: 1,
  width: 'device-width',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
