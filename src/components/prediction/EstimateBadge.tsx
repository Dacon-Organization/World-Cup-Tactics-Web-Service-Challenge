import type { EstimateReason } from '@/types/worker';

interface EstimateBadgeProps {
  /** 배지를 띄운 이유 — 화면 본문이 아니라 보조 설명(title)에 쓴다 */
  reason: EstimateReason | null;
}

const DETAIL: Record<EstimateReason, string> = {
  'load-failed': '예측 모델을 불러오지 못해 간단한 통계 산식으로 계산했습니다.',
  timeout: '예측 모델 준비가 늦어져 간단한 통계 산식으로 먼저 계산했습니다.',
  unavailable: '이 브라우저에서 예측 모델을 실행할 수 없어 통계 산식으로 계산했습니다.',
  'infer-failed': '예측 모델 계산에 실패해 통계 산식으로 계산했습니다.',
};

/**
 * "간이 추정" 배지 (F05-R4)
 *
 * 정직 고지 장치입니다. 폴백은 폼·경험 피처가 빠진 간이 추정이고, 템포 슬라이더는
 * 확률을 움직이지 못합니다(ML 설계 §6.3의 `p_draw`가 상수). 그 한계를 감추지 않는 것이
 * 이 배지의 목적이며, 산식을 미화해 배지를 없애는 선택은 하지 않았습니다.
 */
export function EstimateBadge({ reason }: EstimateBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-warn/60 px-2 py-0.5 text-[12px] font-semibold text-text"
      title={reason ? DETAIL[reason] : undefined}
    >
      {/* 글자를 `--warn`으로 칠하지 않는 이유: #C98A21은 흰 배경 대비 2.94:1이라 라이트에서
          본문 기준(4.5:1)에 못 미칩니다. 색은 점과 테두리가 들고, 글자는 본문색을 씁니다 —
          어차피 이 배지는 텍스트를 항상 동반하므로 의미 전달이 색에 걸려 있지 않습니다. */}
      <span aria-hidden="true" className="size-1.5 rounded-full bg-warn" />
      간이 추정
    </span>
  );
}
