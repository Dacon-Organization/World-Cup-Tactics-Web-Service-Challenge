'use client';

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

/** `localStorage` 키 — 부트 스크립트(layout.tsx)와 **같은 문자열**이어야 한다 */
export const THEME_STORAGE_KEY = 'rf-theme';

/**
 * 라이트/다크 전환 (디자인 재설계 블록)
 *
 * ## 기본값이 다크인 이유
 *
 * 기획서 PDF는 본문이 라이트지만 **브랜드 그림 2종(f00 표지·f13 공유 카드)이 다크**입니다.
 * 서비스 첫 화면이 대조되는 대상은 후자이므로, 저장된 선택이 없으면 다크로 시작합니다.
 * `prefers-color-scheme`을 따르지 않는 것도 같은 이유입니다 — 라이트 OS를 쓰는 심사자에게
 * 첫인상이 기획서와 갈리는 것을 피합니다. 전환은 **명시적 선택**으로만 일어납니다.
 *
 * ## SSR에서 아무것도 그리지 않는 이유
 *
 * 서버는 사용자의 저장값을 알 수 없습니다. 서버가 "다크"로 그린 버튼이 클라이언트에서
 * "라이트"로 바뀌면 하이드레이션 불일치입니다. 마운트 뒤에만 라벨을 채우고, 그전에는
 * 크기가 같은 빈 버튼을 둡니다 — 레이아웃이 흔들리지 않습니다(CLS 0).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // 부트 스크립트가 이미 확정한 값을 그대로 읽는다 — 여기서 다시 판단하지 않는다
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 사파리 프라이빗 모드 등 저장이 막힌 환경 — 이번 세션 동안만 적용되고
      // 새로고침하면 기본값(다크)으로 돌아갑니다. 전환 자체는 계속 동작해야 합니다.
    }
  };

  const label = theme === 'light' ? '어두운 화면으로' : '밝은 화면으로';

  return (
    <button
      type="button"
      onClick={toggle}
      // 마운트 전에는 무엇으로 바뀌는지 단정할 수 없으므로 보조기술에서 숨긴다
      aria-hidden={theme === null}
      tabIndex={theme === null ? -1 : undefined}
      aria-label={theme === null ? undefined : label}
      title={theme === null ? undefined : label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-text-2 hover:text-text"
    >
      <span aria-hidden="true" className="text-[15px]">
        {theme === null ? '' : theme === 'light' ? '◓' : '◒'}
      </span>
    </button>
  );
}
