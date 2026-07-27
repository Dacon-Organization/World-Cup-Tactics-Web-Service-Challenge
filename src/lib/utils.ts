import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui 규약의 클래스 병합 헬퍼 — 조건부 클래스 + Tailwind 충돌 해소 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
