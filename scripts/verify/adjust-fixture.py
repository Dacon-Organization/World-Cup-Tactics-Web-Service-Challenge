"""조정 계층 대조 픽스처 재생성 — `tests/fixtures/adjust-cases.json`

## 왜 이 스크립트가 따로 있는가 (B4에서 발견한 B3 산출물 불일치)

03장은 조정 계수 `K_ADJ`를 **탐색된 전체 정밀도**로 들고 픽스처를 만들었는데,
`public/model/score-params.json`에는 `round(v, 8)`로 **8자리 반올림해서** 실었습니다
(`03_model_baseline.py` L1105). 배포된 앱은 JSON의 값밖에 쓸 수 없으므로, JS 구현은
아무리 정확해도 픽스처를 1e-9로 재현할 수 없습니다.

실측(B4): 최대 오차 Δ_eff 1.88e-6 · λ 상대 1.89e-8. 특히 템포는 λ 비율을 바꾸지 않는데도
양쪽 λ가 **정확히 같은 비율(-4.467491e-9)** 로 어긋났는데, 이는 `deltaTempo`가
`log(1.3) = 0.2623642644674911` 인데 JSON에 `0.26236426` 으로 실린 차이
(4.4674911e-9)와 **소수점까지 일치**합니다. 원인이 반올림임을 확정한 증거입니다.

## 이 스크립트가 하는 일

**배포되는 상수**(= `score-params.json`에 실제로 실린 값)로 파이썬 참조 구현을 돌려
픽스처를 다시 만듭니다. 그러면 대조 테스트가 "학습 때 쓴 값"이 아니라 **"사용자에게
배포되는 값"** 으로 JS↔Python 정합을 검증하게 됩니다 — 원래 그것이 목적이었습니다.

## 정본 관계 (중요)

아래 `adjust()`는 `notebooks/03_model_baseline.py` §6.1의 **참조 구현을 그대로 옮긴
것**입니다. 한쪽만 고치면 정합 검증이 조용히 무의미해집니다. 조정 계층 수식을 바꿀 때는
**세 곳을 함께** 고칩니다 — 노트북 §6.1 · 이 스크립트 · `src/lib/tactics/adjust.ts`.

실행: `python scripts/verify/adjust-fixture.py`  (Windows: `PYTHONUTF8=1` 권장)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCORE_PARAMS = ROOT / "public" / "model" / "score-params.json"
FORMATIONS = ROOT / "src" / "data" / "formations.json"
FIXTURE = ROOT / "tests" / "fixtures" / "adjust-cases.json"

params = json.loads(SCORE_PARAMS.read_text(encoding="utf-8"))
formations = {f["id"]: f for f in json.loads(FORMATIONS.read_text(encoding="utf-8"))}

K_ADJ = params["adjust"]
CONTEXTS = params["contexts"]
CHAIN = K_ADJ["positionChain"]
POS_LINE_SPAN = K_ADJ["posLineSpan"]
POS_WIDTH_SPAN = K_ADJ["posWidthSpan"]
CAP_RATIO = K_ADJ["capRatio"]
LAMBDA_CAP = params["score"]["lambdaCap"]

DEFAULT_SLIDERS = {"lineHeight": 50, "pressing": 50, "width": 50, "tempo": 50}


def preset_shape(fid: str) -> tuple[float, float]:
    slots = formations[fid]["slots"]
    df_y = [s["y"] for s in slots if s["role"] == "DF"]
    fp_x = [s["x"] for s in slots if s["role"] != "GK"]
    return float(np.mean(df_y)), float(np.std(fp_x))


def adjust(elo_diff, lam0, sliders, positions, slot_roles, player_roles, formation_id, k):
    """조정 계층 참조 구현 — 03장 §6.1과 **한 글자도 다르면 안 된다**."""
    z = {key: (sliders[key] - 50.0) / 50.0 for key in ("lineHeight", "pressing", "width", "tempo")}

    base_line, base_width = preset_shape(formation_id)
    df_y = [p["y"] for p, r in zip(positions, slot_roles) if r == "DF"]
    fp_x = [p["x"] for p, r in zip(positions, slot_roles) if r != "GK"]
    z_pos_line = np.clip((float(np.mean(df_y)) - base_line) / POS_LINE_SPAN, -1.0, 1.0)
    z_pos_width = np.clip((float(np.std(fp_x)) - base_width) / POS_WIDTH_SPAN, -1.0, 1.0)

    zL = 0.5 * z["lineHeight"] + 0.5 * z_pos_line
    zW = 0.5 * z["width"] + 0.5 * z_pos_width
    zP, zT = z["pressing"], z["tempo"]

    ls, lo = float(lam0[0]), float(lam0[1])
    # 라인 높이 — 전진 압축은 공격을 돕고, 높을수록 뒷공간이 열린다
    ls *= np.exp(k["deltaLine"] * zL)
    lo *= np.exp(k["kappaLine"] * zL ** 2) * np.exp(k["deltaLineRisk"] * max(zL, 0.0))
    # 압박 강도 — 상대 빌드업 저해 + 높은 회수 위치, 대가는 체력·압박 통과
    lo *= np.exp(-k["deltaPress"] * zP) * np.exp(k["kappaPress"] * zP ** 2)
    ls *= np.exp(k["deltaPressAtt"] * zP)
    # 공격 폭 — 측면 공간 활용, 극단은 공격 단조화
    ls *= np.exp(k["deltaWidth"] * zW) * np.exp(-k["kappaWidth"] * zW ** 2)
    # 템포 — 양 팀 모두 기회 수가 늘어난다 (비율이 아니라 합을 움직인다)
    tempo = np.exp(k["deltaTempo"] * zT)
    ls *= tempo
    lo *= tempo
    # 포지션 적합도 페널티
    d_att = sum(abs(CHAIN[pr] - CHAIN[sr]) for pr, sr in zip(player_roles, slot_roles) if sr in ("MF", "FW"))
    d_def = sum(abs(CHAIN[pr] - CHAIN[sr]) for pr, sr in zip(player_roles, slot_roles) if sr in ("GK", "DF"))
    ls *= np.exp(-k["rhoPenalty"] * d_att)
    lo *= np.exp(k["rhoPenalty"] * d_def)
    # 총 조정 상한
    lo_b, hi_b = 1.0 - CAP_RATIO, 1.0 + CAP_RATIO
    ls = float(np.clip(ls, lam0[0] * lo_b, lam0[0] * hi_b))
    lo = float(np.clip(lo, lam0[1] * lo_b, lam0[1] * hi_b))
    ls, lo = min(ls, LAMBDA_CAP), min(lo, LAMBDA_CAP)
    # Elo 등가 번역
    ratio = (ls / lo) / (lam0[0] / lam0[1])
    return {"effectiveEloDiff": float(elo_diff + k["c"] * 400.0 * np.log10(ratio)), "lambda": [ls, lo]}


def preset_state(fid: str):
    slots = sorted(formations[fid]["slots"], key=lambda s: s["slotIndex"])
    roles = [s["role"] for s in slots]
    return [{"x": s["x"], "y": s["y"]} for s in slots], roles, list(roles)


def main() -> None:
    cases = []
    for fid in formations:
        pos, slot_roles, player_roles = preset_state(fid)
        for lh in (0, 50, 100):
            for pr in (0, 50, 100):
                for wd in (0, 50, 100):
                    for tp in (0, 50, 100):
                        sl = {"lineHeight": lh, "pressing": pr, "width": wd, "tempo": tp}
                        for mid in CONTEXTS:
                            c = CONTEXTS[mid]
                            out = adjust(c["features"]["elo_diff"], c["lambda0"], sl,
                                         pos, slot_roles, player_roles, fid, K_ADJ)
                            cases.append({
                                "formationId": fid, "matchId": mid, "sliders": sl,
                                "effectiveEloDiff": round(out["effectiveEloDiff"], 10),
                                "lambda": [round(out["lambda"][0], 10), round(out["lambda"][1], 10)],
                            })

    # --- 불변식 자체 점검 — 픽스처가 조용히 망가진 채 커밋되지 않게 한다 -------------
    assert len(cases) == 972, f"케이스 수가 972가 아니다: {len(cases)}"
    for fid in formations:
        pos, slot_roles, player_roles = preset_state(fid)
        for mid, c in CONTEXTS.items():
            out = adjust(c["features"]["elo_diff"], c["lambda0"], DEFAULT_SLIDERS,
                         pos, slot_roles, player_roles, fid, K_ADJ)
            # FT-R3 — 기본 상태에서 조정 계층은 항등이다
            assert out["effectiveEloDiff"] == c["features"]["elo_diff"], (fid, mid)
            assert out["lambda"] == list(c["lambda0"]), (fid, mid)
    for case in cases:
        lam0 = CONTEXTS[case["matchId"]]["lambda0"]
        for side in (0, 1):
            ratio = case["lambda"][side] / lam0[side]
            # 총 조정 상한 ±30% (피처_정의서 §4.5) — 반올림 여유 1e-9
            assert 1 - CAP_RATIO - 1e-9 <= ratio <= 1 + CAP_RATIO + 1e-9, case

    FIXTURE.write_text(json.dumps({
        "_주석": (
            "조정 계층 Python 참조값. JS src/lib/tactics/adjust.ts 가 1e-9 이내로 재현해야 한다. "
            "B3 생성 → B4에서 scripts/verify/adjust-fixture.py 로 재생성 "
            "(배포되는 8자리 상수 기준. 사유는 그 스크립트 헤더 참조)"
        ),
        "tolerance": 1e-9, "defaultSliders": DEFAULT_SLIDERS, "cases": cases,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"재생성: {FIXTURE.relative_to(ROOT)} ({len(cases)}건) — 배포 상수 기준, 불변식 점검 통과")


if __name__ == "__main__":
    main()
