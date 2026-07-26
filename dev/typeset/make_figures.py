#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기획서 전용 그림 생성 — 분석 실측값을 조판 디자인 시스템으로 다시 그린다.

노트북(`notebooks/figures/`)의 그림은 분석 과정 기록용이라 서로 스타일이 다르다.
이 스크립트는 **같은 데이터·같은 수치**를 기획서 지면 폭과 팔레트에 맞춰 다시 렌더해
`dev/typeset/figures/`에 저장한다. 캡션은 그림 안에 넣지 않고 원고 마크다운에 둔다
(조판 시 그림 아래 캡션으로 조판되며, 그림 내부 텍스트와 겹치지 않게 하기 위함).

입력
  - data/raw/matches.csv, tournaments.csv               (jfjelstul/worldcup, CC BY-SA 4.0)
  - data/raw/martj42/results.csv                        (martj42/international_results, CC0)
  - docs/research/findings/ P5·P6·P11·P12·P13 확정 수치  (코드 내 상수 + 출처 주석)

실행: 워크트리 루트에서  `python dev/typeset/make_figures.py`
"""
from __future__ import annotations

import bisect
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw"
OUT = ROOT / "dev/typeset/figures"
OUT.mkdir(parents=True, exist_ok=True)

PIN_MARTJ42 = "a16ff3edb297bda95d0ed02d5fc0c1ecb5b1c1cf"

# ─────────────────────────────────────────────────────────────────────────────
# 디자인 시스템 — preamble.tex의 ink/accent와 같은 값
# ─────────────────────────────────────────────────────────────────────────────
INK = "#1A1D24"
ACCENT = "#1F4E79"
GREEN = "#2E7D5B"
AMBER = "#C98A21"
RED = "#B0413E"
PURPLE = "#7C4DBE"
GREY = "#98A2B3"
GRID = "#E4E7EC"
SOFT = "#EEF1F5"

plt.rcParams.update({
    "font.family": "Pretendard",
    "font.size": 10.5,
    "axes.titlesize": 12,
    "axes.titleweight": "bold",
    "axes.labelsize": 10,
    "axes.edgecolor": GREY,
    "axes.labelcolor": INK,
    "axes.titlecolor": INK,
    "text.color": INK,
    "xtick.color": INK, "ytick.color": INK,
    "xtick.labelsize": 9.5, "ytick.labelsize": 9.5,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.axisbelow": True,
    "legend.frameon": False, "legend.fontsize": 9.5,
    "figure.dpi": 200, "savefig.dpi": 200,
    "savefig.bbox": "tight", "savefig.facecolor": "white",
    "axes.unicode_minus": False,
})


def despine(ax, keep=("left", "bottom")):
    for s in ("top", "right", "left", "bottom"):
        ax.spines[s].set_visible(s in keep)


def save(fig, name: str):
    fig.savefig(OUT / name, pad_inches=0.08)
    plt.close(fig)
    print(f"  ok {name}")


# ─────────────────────────────────────────────────────────────────────────────
# 데이터
# ─────────────────────────────────────────────────────────────────────────────
TEAM_MAP = {  # 00장 실측 확정 매핑 6건 (jfjelstul 표기 → martj42 표기)
    "West Germany": "Germany", "East Germany": "German DR", "Soviet Union": "Russia",
    "Serbia and Montenegro": "Serbia", "Zaire": "DR Congo", "Dutch East Indies": "Indonesia",
}


def fetch_results() -> pd.DataFrame:
    dest = RAW / "martj42/results.csv"
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = ("https://raw.githubusercontent.com/martj42/international_results/"
               f"{PIN_MARTJ42}/results.csv")
        with urllib.request.urlopen(url, timeout=180) as r:
            dest.write_bytes(r.read())
    return (pd.read_csv(dest, parse_dates=["date"])
              .sort_values("date", kind="stable").reset_index(drop=True))


def run_elo(res: pd.DataFrame, K=32.0, HA=100.0, init=1500.0):
    """02장과 동일한 A매치 Elo — 감쇠 없음, 홈 어드밴티지는 기대 스코어에만."""
    R: dict[str, float] = {}
    hist_d: dict[str, list] = defaultdict(list)
    hist_r: dict[str, list] = defaultdict(list)
    for r in res.itertuples(index=False):
        h, a = r.home_team, r.away_team
        rh, ra = R.get(h, init), R.get(a, init)
        adv = 0.0 if r.neutral else HA
        e_home = 1.0 / (1.0 + 10 ** (-((rh + adv) - ra) / 400.0))
        s = 1.0 if r.home_score > r.away_score else (0.0 if r.home_score < r.away_score else 0.5)
        R[h] = rh + K * (s - e_home)
        R[a] = ra + K * ((1 - s) - (1 - e_home))
        hist_d[h].append(r.date); hist_r[h].append(R[h])
        hist_d[a].append(r.date); hist_r[a].append(R[a])
    return hist_d, hist_r, R


def label90(row) -> str:
    """90분 기준 결과 — 연장·승부차기는 90분 무승부 (01장과 동일 정의)."""
    if row["extra_time"] == 1 or row["penalty_shootout"] == 1:
        return "D"
    if row["home_team_score"] > row["away_team_score"]:
        return "W"
    if row["home_team_score"] < row["away_team_score"]:
        return "L"
    return "D"


# ─────────────────────────────────────────────────────────────────────────────
# F01 — 조 3위 12팀 진출선 (3절). P6 확정값만 표기, 나머지 순위는 익명
# ─────────────────────────────────────────────────────────────────────────────
def f01_group3rd():
    fig, ax = plt.subplots(figsize=(6.9, 3.4))
    known = {
        10: ("대한민국", "승점 3 · 골득실 −1 · 득점 2", ACCENT),
        11: ("스코틀랜드", "승점 3 · 골득실 −3", GREY),
        12: ("우루과이", "승점 2", GREY),
    }
    for r in range(1, 13):
        y = -r
        adv = r <= 8
        hi = r == 10
        ax.add_patch(plt.Rectangle((0, y - 0.32), 1.0, 0.64,
                                   facecolor=ACCENT if hi else (GREEN if adv else GREY),
                                   alpha=1.0 if hi else (0.16 if adv else 0.13),
                                   edgecolor="none", zorder=2))
        if r in known:
            name, detail, color = known[r]
            ax.text(0.05, y, name, va="center", ha="left", fontsize=10.5 if hi else 9.5,
                    color="white" if hi else INK, fontweight="bold" if hi else "normal", zorder=4)
            ax.text(1.06, y, detail, va="center", ha="left", fontsize=9,
                    color=INK if hi else GREY, fontweight="bold" if hi else "normal")
        else:
            ax.text(0.05, y, "32강 진출" if adv else "탈락", va="center", ha="left",
                    fontsize=9, color=GREY, zorder=4)
        ax.text(-0.05, y, f"{r}위", va="center", ha="right", fontsize=9.5,
                color=ACCENT if hi else GREY, fontweight="bold" if hi else "normal")

    ax.plot([-0.42, 2.55], [-8.5, -8.5], color=RED, ls=(0, (5, 3)), lw=1.6, zorder=5)
    ax.text(2.55, -8.42, "진출선 — 조 3위 12팀 중 상위 8팀", va="bottom", ha="right",
            fontsize=9.5, color=RED, fontweight="bold")
    ax.annotate("", xy=(-0.22, -8.64), xytext=(-0.22, -9.86),
                arrowprops=dict(arrowstyle="->", color=ACCENT, lw=1.6))
    ax.text(-0.30, -9.25, "두 계단", fontsize=9.5, color=ACCENT, fontweight="bold",
            va="center", ha="right")

    ax.set_xlim(-0.90, 2.6)
    ax.set_ylim(-12.75, -0.25)
    ax.axis("off")
    ax.set_title("진출선은 8위, 한국은 10위", loc="left", x=-0.075, pad=12)
    save(fig, "f01_group3rd.png")


# ─────────────────────────────────────────────────────────────────────────────
# F02 — 세 경기의 점유율·슈팅·xG (3·9절). 출처: P6(FotMob/Opta), P11
# ─────────────────────────────────────────────────────────────────────────────
def f02_three_matches():
    games = ["체코전\n2–1 승", "멕시코전\n0–1", "남아공전\n0–1"]
    poss, shots, shots_opp = [62, 42, 32], [15, 8, 13], [8, 9, 8]
    xg, xg_opp = [2.30, 0.53, 0.90], [0.83, 0.91, 1.16]

    fig, axes = plt.subplots(1, 3, figsize=(7.4, 2.75))
    x = np.arange(3)

    ax = axes[0]
    ax.bar(x, poss, width=0.5, color=ACCENT, zorder=3)
    ax.bar(x, [100 - p for p in poss], width=0.5, bottom=poss, color=SOFT, zorder=2)
    for i, p in enumerate(poss):
        ax.text(i, p - 5, f"{p}%", ha="center", va="top", color="white",
                fontweight="bold", fontsize=10)
    ax.set_ylim(0, 100); ax.set_yticks([0, 50, 100]); ax.set_yticklabels(["0", "50", "100%"])
    ax.set_title("점유율", loc="left", fontsize=11)

    ax = axes[1]
    ax.bar(x - 0.17, shots, width=0.32, color=ACCENT, label="한국", zorder=3)
    ax.bar(x + 0.17, shots_opp, width=0.32, color=GREY, alpha=0.5, label="상대", zorder=3)
    for i, (a, b) in enumerate(zip(shots, shots_opp)):
        ax.text(i - 0.17, a + 0.4, str(a), ha="center", fontsize=9, color=ACCENT, fontweight="bold")
        ax.text(i + 0.17, b + 0.4, str(b), ha="center", fontsize=9, color=GREY)
    ax.set_ylim(0, 20); ax.set_title("총 슈팅", loc="left", fontsize=11)
    ax.legend(loc="upper center", ncol=2, handlelength=1.0, columnspacing=0.7,
              bbox_to_anchor=(0.62, 1.03))

    ax = axes[2]
    ax.plot(x, xg_opp, "--o", color=GREY, lw=1.6, ms=5, zorder=3, label="상대")
    ax.plot(x, xg, "-o", color=ACCENT, lw=2.2, ms=6, zorder=4, label="한국")
    for i, (v, dy, va) in enumerate(zip(xg, [0.17, -0.20, -0.22], ["bottom", "top", "top"])):
        ax.text(i, v + dy, f"{v:.2f}", ha="center", va=va, fontsize=9,
                color=ACCENT, fontweight="bold")
    ax.set_ylim(0, 3.0); ax.set_title("기대득점 (Opta xG)", loc="left", fontsize=11)
    ax.legend(loc="upper center", ncol=2, handlelength=1.3, columnspacing=0.7,
              bbox_to_anchor=(0.66, 1.03))

    for ax in axes:
        despine(ax); ax.set_xticks(x); ax.set_xticklabels(games, fontsize=9)
        ax.grid(axis="x", visible=False)
    fig.tight_layout()
    save(fig, "f02_three_matches.png")


# ─────────────────────────────────────────────────────────────────────────────
# F03 — Elo 입력 확장의 효과 (10절). 노트북 c2 실측 3종
# ─────────────────────────────────────────────────────────────────────────────
def f03_elo_expansion():
    fig, axes = plt.subplots(1, 3, figsize=(7.4, 2.85))
    panels = [
        ("학습 입력 경기 수", [964, 49520], "{:,}경기", True, None),
        ("대회 첫 경기 직전의\n경기 공백 (중앙값)", [1456, 12], "{:,}일", True, "121배 단축"),
        ("Elo 차이 ↔ 실제 홈 승률\nSpearman ρ", [0.221, 0.308], "{:.3f}", False, None),
    ]
    labs = ["월드컵\n본선만", "전체\nA매치"]
    for ax, (title, vals, fmt, logy, note) in zip(axes, panels):
        bars = ax.bar([0, 1], vals, width=0.5, color=[GREY, ACCENT], zorder=3)
        bars[0].set_alpha(0.42)
        if logy:
            ax.set_yscale("log"); ax.set_ylim(min(vals) * 0.32, max(vals) * 4.2)
            for i, v in enumerate(vals):
                ax.text(i, v * 1.30, fmt.format(v), ha="center", fontsize=10.5,
                        fontweight="bold" if i else "normal", color=ACCENT if i else GREY)
        else:
            ax.set_ylim(0, max(vals) * 1.45)
            for i, v in enumerate(vals):
                ax.text(i, v + max(vals) * 0.05, fmt.format(v), ha="center", fontsize=10.5,
                        fontweight="bold" if i else "normal", color=ACCENT if i else GREY)
        if note:
            ax.text(0.5, max(vals) * 2.4, note, ha="center", fontsize=9.5,
                    color=ACCENT, fontweight="bold")
        ax.set_xticks([0, 1]); ax.set_xticklabels(labs, fontsize=9)
        ax.set_xlim(-0.62, 1.62)
        ax.set_title(title, loc="left", fontsize=10.5)
        ax.set_yticks([]); ax.minorticks_off()
        ax.tick_params(axis="y", length=0)
        ax.grid(axis="x", visible=False)
        despine(ax, keep=("bottom",))
    fig.tight_layout()
    save(fig, "f03_elo_expansion.png")


# ─────────────────────────────────────────────────────────────────────────────
# F04 — 자체 산출 Elo 궤적 (10절)
# ─────────────────────────────────────────────────────────────────────────────
def f04_elo_traj(hist_d, hist_r):
    picks = [("Brazil", "브라질", GREEN), ("Germany", "독일", ACCENT),
             ("Argentina", "아르헨티나", RED), ("France", "프랑스", AMBER),
             ("South Korea", "대한민국", PURPLE), ("Czech Republic", "체코", "#6B7280")]
    fig, ax = plt.subplots(figsize=(7.4, 3.2))
    for key, label, color in picks:
        d, r = hist_d.get(key, []), hist_r.get(key, [])
        if not d:
            continue
        hi = key in ("South Korea", "Czech Republic")
        ax.plot(d, r, color=color, lw=1.7 if hi else 1.0, alpha=1.0 if hi else 0.62,
                label=label, zorder=4 if hi else 3)
    ax.axhline(1500, color=GREY, ls=":", lw=1, zorder=2)
    ax.text(0.012, 0.335, "초기값 1500", transform=ax.transAxes, fontsize=8.5, color=GREY,
            va="bottom", bbox=dict(fc="white", ec="none", pad=1.2))
    ax.annotate("체코는 1994년 1500에서 새로 시작한다 —\n승계가 없는 팀의 레이팅을 잇지 않는 설계",
                xy=(pd.Timestamp("1994-04-01"), 1497), xytext=(pd.Timestamp("1934-01-01"), 1238),
                fontsize=9, color=INK,
                arrowprops=dict(arrowstyle="->", color=INK, lw=1.1,
                                connectionstyle="arc3,rad=-0.14"))
    ax.set_ylabel("Elo 레이팅")
    ax.set_ylim(1180, 2190)
    ax.legend(ncol=6, loc="upper left", bbox_to_anchor=(-0.005, 1.13), handlelength=1.3,
              columnspacing=1.1)
    despine(ax)
    ax.set_title("4년 주기 공백 없이 궤적이 이어진다", loc="left", x=-0.005, pad=30)
    save(fig, "f04_elo_traj.png")


# ─────────────────────────────────────────────────────────────────────────────
# F05 — Elo 차이 구간별 실제 90분 결과 (10절)
# ─────────────────────────────────────────────────────────────────────────────
def f05_calibration(wc: pd.DataFrame):
    bins = [-np.inf, -200, -100, -40, 40, 100, 200, np.inf]
    labels = ["−200\n이하", "−200~\n−100", "−100~\n−40", "−40~\n+40",
              "+40~\n+100", "+100~\n+200", "+200\n이상"]
    wc = wc.copy()
    wc["bin"] = pd.cut(wc["elo_diff"], bins=bins, labels=labels)
    g = (wc.groupby("bin", observed=False)["label90"].value_counts(normalize=True)
           .unstack().fillna(0).reindex(columns=["W", "D", "L"], fill_value=0))
    n = wc.groupby("bin", observed=False).size()

    fig, ax = plt.subplots(figsize=(7.4, 3.15))
    x = np.arange(len(labels))
    bottom = np.zeros(len(labels))
    for col, color, name in [("W", GREEN, "홈 승"), ("D", AMBER, "무"), ("L", RED, "홈 패")]:
        vals = g[col].values * 100
        ax.bar(x, vals, bottom=bottom, width=0.66, color=color, alpha=0.9, label=name, zorder=3)
        for i, v in enumerate(vals):
            if v >= 9:
                ax.text(i, bottom[i] + v / 2, f"{v:.0f}", ha="center", va="center",
                        color="white", fontsize=9.5, fontweight="bold")
        bottom += vals
    for i, c in enumerate(n.values):
        ax.text(i, 102, f"n={c}", ha="center", fontsize=8.3, color=GREY)
    ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=9)
    ax.set_ylim(0, 116); ax.set_yticks([0, 25, 50, 75, 100])
    ax.set_yticklabels(["0", "25", "50", "75", "100%"])
    ax.set_xlabel("경기 전 Elo 차이 (홈 − 원정)")
    ax.grid(axis="x", visible=False)
    ax.legend(ncol=3, loc="upper right", bbox_to_anchor=(1.0, 1.15), handlelength=1.1,
              columnspacing=1.0)
    despine(ax)
    ax.set_title("Elo 차이가 벌어지면 결과가 기운다 — 표본이 얇은 왼쪽 끝만 순서가 뒤집힌다",
                 loc="left", x=-0.055, pad=26)
    save(fig, "f05_calibration.png")


# ─────────────────────────────────────────────────────────────────────────────
# F06 — 득점 분포와 포아송 적합 + 기저율 (10절)
# ─────────────────────────────────────────────────────────────────────────────
def f06_score_model(m: pd.DataFrame):
    goals = pd.concat([m["home_team_score"], m["away_team_score"]]).astype(int)
    lam = goals.mean()
    ks = np.arange(0, 8)
    obs = np.array([(goals == k).mean() for k in ks]); obs[-1] = (goals >= 7).mean()
    pois = np.array([math.exp(-lam) * lam ** k / math.factorial(k) for k in ks])
    pois[-1] = max(0.0, 1 - pois[:-1].sum())

    fig, axes = plt.subplots(1, 2, figsize=(7.4, 2.9),
                             gridspec_kw={"width_ratios": [1.35, 1]})
    ax = axes[0]
    ax.bar(ks - 0.18, obs * 100, width=0.34, color=ACCENT, label="실제 분포", zorder=3)
    ax.bar(ks + 0.18, pois * 100, width=0.34, color=GREY, alpha=0.45,
           label=f"포아송 적합 (λ={lam:.2f})", zorder=3)
    ax.set_xticks(ks); ax.set_xticklabels([str(k) for k in ks[:-1]] + ["7+"])
    ax.set_xlabel("한 팀의 한 경기 득점"); ax.set_ylabel("비율 (%)")
    ax.set_ylim(0, 43)
    ax.legend(loc="upper right", bbox_to_anchor=(1.02, 1.04))
    ax.grid(axis="x", visible=False); despine(ax)
    d0 = (obs[0] - pois[0]) * 100
    ax.annotate(f"0골이 {d0:+.1f}%p", xy=(0.18, pois[0] * 100 + 0.6), xytext=(1.35, 30),
                fontsize=9, color=RED, fontweight="bold",
                arrowprops=dict(arrowstyle="->", color=RED, lw=1.1))
    ax.set_title("득점은 포아송을 따르되 0골에서 어긋난다", loc="left", fontsize=11)

    ax = axes[1]
    base = m["label90"].value_counts(normalize=True)
    vals = [base.get("W", 0) * 100, base.get("D", 0) * 100, base.get("L", 0) * 100]
    bars = ax.bar([0, 1, 2], vals, width=0.55, color=[GREEN, AMBER, RED], alpha=0.9, zorder=3)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1.4, f"{v:.1f}%", ha="center",
                fontsize=10.5, fontweight="bold")
    ax.set_xticks([0, 1, 2]); ax.set_xticklabels(["홈 승", "무", "홈 패"])
    ax.set_ylim(0, 66); ax.set_ylabel("비율 (%)")
    ax.grid(axis="x", visible=False); despine(ax)
    ax.set_title("모델이 넘어야 할 최소선 — 기저율", loc="left", fontsize=11)
    fig.tight_layout()
    save(fig, "f06_score_model.png")


# ─────────────────────────────────────────────────────────────────────────────
# F07 — 몬테카를로 반복 횟수와 표본오차 (8절)
# ─────────────────────────────────────────────────────────────────────────────
def f07_mc_error():
    n = np.logspace(2.3, 5.3, 400)
    se = 1.96 * np.sqrt(0.25 / n) * 100
    fig, ax = plt.subplots(figsize=(7.0, 2.8))
    ax.plot(n, se, color=ACCENT, lw=2.2, zorder=4)
    ax.fill_between(n, 0, se, color=ACCENT, alpha=0.07, zorder=2)
    for N, name, color, dx in [(5000, "빠른 모드 5,000회", GREEN, 1.45),
                               (25000, "정밀 모드 25,000회", ACCENT, 1.30)]:
        y = 1.96 * np.sqrt(0.25 / N) * 100
        ax.plot([N], [y], "o", color=color, ms=8, zorder=5)
        ax.vlines(N, 0, y, color=color, ls=":", lw=1.2, zorder=3)
        ax.annotate(f"{name}\n±{y:.1f}%p", xy=(N, y), xytext=(N * dx, y + 0.42),
                    fontsize=9.5, color=color, fontweight="bold", ha="left", va="bottom")
    ax.set_xscale("log")
    ax.set_xlim(200, 2.4e5); ax.set_ylim(0, 5.2)
    ax.set_xlabel("몬테카를로 반복 횟수 (로그 축)")
    ax.set_ylabel("95% 구간 반폭 (%p)")
    despine(ax)
    ax.set_title("반복을 5배로 늘려도 오차는 절반 남짓만 줄어든다", loc="left", x=-0.075, pad=10)
    save(fig, "f07_mc_error.png")


# ─────────────────────────────────────────────────────────────────────────────
# F08 — RPS 방어선 (10절). 출처: P12
# ─────────────────────────────────────────────────────────────────────────────
def f08_rps():
    rows = [
        ("무작위 추측 (1/3씩)\n이론값", 0.2222),
        ("국제대회 공개 실측 — Elo·로지스틱\n2018·2022 본선 128경기", 0.219),
        ("국제대회 공개 실측 — 더블포아송\n동일 128경기", 0.212),
        ("국제대회 공개 실측 — 최고 성능\n동일 128경기", 0.209),
        ("상용 클럽 예측 (참고)\n5대 리그 3시즌", 0.1957),
    ]
    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    ys = np.arange(len(rows))[::-1]
    for y, (label, v) in zip(ys, rows):
        ax.plot([0.1855, v], [y, y], color=GRID, lw=1.2, zorder=1)
        ax.plot([v], [y], "o", color=GREY, ms=8, zorder=4)
        ax.text(v + 0.0016, y, f"{v:g}", va="center", fontsize=9.5, color=INK)
    ax.axvspan(0.19, 0.22, color=ACCENT, alpha=0.10, zorder=0)
    ax.text(0.205, len(rows) - 0.55, "본 서비스의 방어선  0.19 – 0.22", ha="center",
            fontsize=10, color=ACCENT, fontweight="bold")
    ax.set_yticks(ys); ax.set_yticklabels([r[0] for r in rows], fontsize=9.3)
    ax.set_xlim(0.1855, 0.2325); ax.set_ylim(-0.7, len(rows) - 0.18)
    ax.set_xlabel("RPS — 낮을수록 좋음")
    ax.set_xticks([0.19, 0.20, 0.21, 0.22, 0.23])
    ax.grid(axis="y", visible=False)
    despine(ax, keep=("bottom",))
    ax.set_title("방어선은 우리가 정한 목표가 아니라 공개 실측이 놓인 자리다",
                 loc="left", x=-0.34, pad=12)
    save(fig, "f08_rps.png")


# ─────────────────────────────────────────────────────────────────────────────
# F09 — 지연 예산 (6·8절)
# ─────────────────────────────────────────────────────────────────────────────
def f09_latency():
    items = [
        ("슬라이더 → 피치 시각 프리뷰", 0.10, ACCENT),
        ("드래그 놓기 → 재배치 애니메이션", 0.10, ACCENT),
        ("단일 추론 (Web Worker)", 0.05, ACCENT),
        ("빠른 시뮬레이션 5,000회", 1.0, AMBER),
        ("초기 로딩 (모델 포함)", 3.0, AMBER),
        ("정밀 시뮬레이션 25,000회", 10.0, RED),
    ]
    fig, ax = plt.subplots(figsize=(7.2, 2.9))
    ys = np.arange(len(items))[::-1]
    for th, color in [(0.1, ACCENT), (1.0, AMBER), (10.0, RED)]:
        ax.axvline(th, color=color, ls=(0, (4, 3)), lw=1.3, alpha=0.7, zorder=2)
    for y, (label, v, color) in zip(ys, items):
        ax.barh(y, v - 0.013, left=0.013, height=0.46, color=color, alpha=0.85, zorder=3)
        txt = f"{int(v * 1000)}ms" if v < 1 else f"{v:.0f}초"
        ax.text(v * 1.16, y, txt, va="center", fontsize=9, color=INK, fontweight="bold")
    for th, name, color in [(0.1, "100ms\n직접 조작한다는 감각", ACCENT),
                            (1.0, "1초\n사고의 흐름", AMBER),
                            (10.0, "10초\n주의의 한계", RED)]:
        ax.text(th, len(items) - 0.42, name, fontsize=8.8, color=color,
                ha="center", va="bottom", fontweight="bold", linespacing=1.35)
    ax.set_xscale("log")
    ax.set_xlim(0.013, 30); ax.set_ylim(-0.7, len(items) + 0.85)
    ax.set_yticks(ys); ax.set_yticklabels([i[0] for i in items], fontsize=9.3)
    ax.set_xlabel("응답 시간 (로그 축)")
    ax.set_xticks([0.02, 0.1, 0.5, 1, 5, 10])
    ax.set_xticklabels(["20ms", "100ms", "500ms", "1초", "5초", "10초"])
    ax.grid(axis="y", visible=False)
    despine(ax, keep=("bottom",))
    save(fig, "f09_latency.png")


# ─────────────────────────────────────────────────────────────────────────────
# 디자인 자산 — 표지 키 비주얼·와이어프레임·UI 목업
# 실존 인물 연상 요소 없이 도형과 가공명 이니셜만 사용한다 (P7).
# ─────────────────────────────────────────────────────────────────────────────
FORMATION_433 = [  # (x, y) — 0~1 정규화 피치 좌표, 아래가 자기 진영
    (0.50, 0.06),
    (0.16, 0.24), (0.38, 0.20), (0.62, 0.20), (0.84, 0.24),
    (0.28, 0.48), (0.50, 0.44), (0.72, 0.48),
    (0.20, 0.74), (0.50, 0.80), (0.80, 0.74),
]
POS_COLORS = [AMBER] + [ACCENT] * 4 + [GREEN] * 3 + [RED] * 3


def canvas(figw, figh):
    """가로:세로 비율이 1:1로 유지되는 도화지 — 원이 원으로 그려진다.
    x는 0~A(=figw/figh), y는 0~1 범위를 쓴다."""
    fig, ax = plt.subplots(figsize=(figw, figh))
    A = figw / figh
    ax.set_xlim(0, A); ax.set_ylim(0, 1)
    ax.set_aspect("equal"); ax.axis("off")
    return fig, ax, A


PITCH_WH = 0.648  # 폭/길이 — 실제 경기장 비율(68m×105m)


def draw_pitch(ax, x0, y0, w, h, line="#FFFFFF", lw=1.1, alpha=0.55):
    """세로형 피치 라인 — 자체 제작 도형만 사용."""
    ax.add_patch(plt.Rectangle((x0, y0), w, h, fill=False, ec=line, lw=lw, alpha=alpha))
    ax.plot([x0, x0 + w], [y0 + h / 2, y0 + h / 2], color=line, lw=lw, alpha=alpha)
    ax.add_patch(plt.Circle((x0 + w / 2, y0 + h / 2), min(w, h) * 0.11,
                            fill=False, ec=line, lw=lw, alpha=alpha))
    for sy, sgn in ((y0, 1), (y0 + h, -1)):
        ax.add_patch(plt.Rectangle((x0 + w * 0.22, sy), w * 0.56, sgn * h * 0.13,
                                   fill=False, ec=line, lw=lw, alpha=alpha))
        ax.add_patch(plt.Rectangle((x0 + w * 0.36, sy), w * 0.28, sgn * h * 0.055,
                                   fill=False, ec=line, lw=lw, alpha=alpha))



def f00_cover():
    fig, ax, A = canvas(7.4, 4.3)
    ax.add_patch(plt.Rectangle((0, 0), A, 1, color="#10161F", zorder=0))

    ph = 0.70
    pw = ph * PITCH_WH
    px, py = A - pw - 0.17, 0.185
    draw_pitch(ax, px, py, pw, ph)
    for (fx, fy), c in zip(FORMATION_433, POS_COLORS):
        cx, cy = px + fx * pw, py + fy * ph
        ax.add_patch(plt.Circle((cx, cy), 0.0175, color=c, zorder=4))
        ax.add_patch(plt.Circle((cx, cy), 0.0265, fill=False, ec=c, lw=1.0,
                                alpha=0.45, zorder=3))
    # 조작의 흔적 — 토큰 하나가 위로 옮겨진 자취
    ax.annotate("", xy=(px + 0.72 * pw, py + 0.475 * ph),
                xytext=(px + 0.72 * pw, py + 0.295 * ph),
                arrowprops=dict(arrowstyle="->", color="#FFFFFF", lw=1.2, alpha=0.5),
                zorder=5)

    bx, by, bh = px, 0.115, 0.030
    for frac, color, lab in [(0.62, GREEN, "승 62"), (0.21, AMBER, "무 21"), (0.17, RED, "패 17")]:
        ax.add_patch(plt.Rectangle((bx, by), pw * frac, bh, color=color, zorder=4))
        ax.text(bx + pw * frac / 2, by - 0.032, lab, color=color, fontsize=7.5,
                ha="center", va="center")
        bx += pw * frac

    tx = 0.115
    ax.text(tx, 0.795, "RE:", color="#FFFFFF", fontsize=27, fontweight="bold",
            ha="left", va="center")
    ax.text(tx + 0.163, 0.795, "FORMATION", color="#7FB3E0", fontsize=27,
            fontweight="bold", ha="left", va="center")
    ax.text(tx + 0.004, 0.706, "리포메이션", color="#C7D2DE", fontsize=11.5,
            ha="left", va="center")
    ax.plot([tx, tx + 0.30], [0.655, 0.655], color="#3A4757", lw=1.2)
    ax.text(tx, 0.565, "전술을 다시 짜면,\n확률이 답한다", color="#FFFFFF", fontsize=15,
            ha="left", va="center", linespacing=1.6)
    ax.text(tx, 0.375, "드래그앤드롭 전술보드\n온디바이스 ML 승부 예측\n조별리그 3경기 리플레이",
            color="#8E9CAD", fontsize=9.5, ha="left", va="center", linespacing=2.0)
    ax.text(tx, 0.155, "기획서 v2.0 · 2026년 7월", color="#6B7A8C", fontsize=9,
            ha="left", va="center")
    ax.text(tx, 0.105, "FIFA 및 관련 기관과 무관한", color="#55636F", fontsize=8,
            ha="left", va="center")
    ax.text(tx, 0.068, "비공식 팬·학습 목적 프로젝트", color="#55636F", fontsize=8,
            ha="left", va="center")
    save(fig, "f00_cover.png")


def wf_box(ax, x, y, w, h, label="", sub="", fc="white", ec=GREY, lw=1.0, ls="-",
           fs=8.5, bold=False, tc=INK):
    ax.add_patch(plt.Rectangle((x, y), w, h, facecolor=fc, edgecolor=ec, lw=lw,
                               linestyle=ls, zorder=3))
    if label:
        ax.text(x + w / 2, y + h / 2 + (0.012 if sub else 0), label, ha="center",
                va="center", fontsize=fs, color=tc,
                fontweight="bold" if bold else "normal", zorder=4)
        if sub:
            ax.text(x + w / 2, y + h / 2 - 0.017, sub, ha="center", va="center",
                    fontsize=fs - 1.3, color=GREY, zorder=4)


def draw_prob_panel(ax, x, y, w, h, fs=8, note="5,000회 시뮬레이션 · 95% 구간 ±1.4%p"):
    wf_box(ax, x, y, w, h, fc=SOFT, ec=GRID)
    pad = w * 0.06
    left, by, bh = x + pad, y + h * 0.30, h * 0.19
    for frac, color in [(0.62, GREEN), (0.21, AMBER), (0.17, RED)]:
        ax.add_patch(plt.Rectangle((left, by), (w - 2 * pad) * frac, bh, color=color, zorder=4))
        left += (w - 2 * pad) * frac
    ax.text(x + pad, y + h * 0.76, "승 62%   무 21%   패 17%", fontsize=fs,
            color=INK, fontweight="bold", va="center", zorder=4)
    ax.text(x + pad, y + h * 0.12, note, fontsize=fs - 1.6, color=GREY,
            va="center", zorder=4)


def draw_board(ax, x, y, w, h, r=0.0095):
    ax.add_patch(plt.Rectangle((x, y), w, h, facecolor="#F7FAF8", edgecolor=GREEN,
                               lw=1.0, zorder=3))
    draw_pitch(ax, x, y, w, h, line=GREEN, lw=0.8, alpha=0.8)
    for (fx, fy), c in zip(FORMATION_433, POS_COLORS):
        ax.add_patch(plt.Circle((x + fx * w, y + fy * h), r, color=c, zorder=5))


def f10_wireframe_board():
    fig, ax, A = canvas(7.4, 3.9)

    # ── 모바일 (기준 설계)
    mx, my, mw, mh = 0.05, 0.055, 0.50, 0.83
    wf_box(ax, mx, my, mw, mh, fc="white", ec=INK, lw=1.4)
    ax.text(mx, my + mh + 0.045, "S1 전술보드 — 모바일 (기준 설계)", fontsize=10,
            fontweight="bold", color=INK)
    wf_box(ax, mx + 0.016, my + mh - 0.072, mw - 0.032, 0.055,
           "RE:FORMATION    보드 | 리플레이", fs=7, fc=SOFT, ec=GRID)
    bh_ = 0.42
    bw_ = bh_ * PITCH_WH
    draw_board(ax, mx + (mw - bw_) / 2, my + 0.325, bw_, bh_)
    draw_prob_panel(ax, mx + 0.016, my + 0.175, mw - 0.032, 0.125, fs=7.5,
                    note="5,000회 · 95% 구간 ±1.4%p")
    wf_box(ax, mx + 0.016, my + 0.055, mw - 0.032, 0.098,
           "슬라이더 시트 — 위로 스와이프", "라인 높이 · 압박 · 폭 · 템포", fs=7,
           fc="white", ec=GREY, ls=(0, (3, 2)))

    ax.annotate("", xy=(0.655, 0.50), xytext=(0.585, 0.50),
                arrowprops=dict(arrowstyle="->", color=GREY, lw=1.3))

    # ── 데스크톱
    dx, dy, dw, dh = 0.71, 0.20, 1.13, 0.62
    wf_box(ax, dx, dy, dw, dh, fc="white", ec=INK, lw=1.4)
    ax.text(dx, dy + dh + 0.045, "S1 전술보드 — 데스크톱", fontsize=10,
            fontweight="bold", color=INK)
    wf_box(ax, dx + 0.016, dy + dh - 0.062, dw - 0.032, 0.048,
           "RE:FORMATION           보드 | 리플레이           공유", fs=7.5,
           fc=SOFT, ec=GRID)
    bh2 = 0.44
    bw2 = bh2 * PITCH_WH
    draw_board(ax, dx + 0.05, dy + 0.05, bw2, bh2)
    rx = dx + 0.05 + bw2 + 0.05
    rw = dx + dw - rx - 0.05
    wf_box(ax, rx, dy + 0.29, rw, 0.20, "전술 슬라이더 4종",
           "라인 높이 · 압박 강도 · 공격 폭 · 템포", fs=8, fc="white", ec=GREY)
    draw_prob_panel(ax, rx, dy + 0.05, rw, 0.21)
    save(fig, "f10_wireframe_board.png")


def f11_wireframe_replay_share():
    fig, ax, A = canvas(7.4, 3.3)

    # ── S2b 리플레이 재생·개입
    rx0, ry0, rw0, rh0 = 0.06, 0.07, 1.28, 0.79
    wf_box(ax, rx0, ry0, rw0, rh0, fc="white", ec=INK, lw=1.4)
    ax.text(rx0, ry0 + rh0 + 0.045, "S2b 리플레이 재생·개입", fontsize=10,
            fontweight="bold", color=INK)
    wf_box(ax, rx0 + 0.02, ry0 + rh0 - 0.085, rw0 - 0.04, 0.065,
           "조별리그 1차전 · 2–1 · 과달라하라", fs=8, fc=SOFT, ec=GRID, bold=True)

    cx, cy, cw, ch = rx0 + 0.04, ry0 + 0.315, rw0 - 0.08, 0.29
    wf_box(ax, cx, cy, cw, ch, fc="#FBFCFD", ec=GRID)
    t = np.linspace(0, 1, 140)
    real = 0.30 + 0.34 * (1 / (1 + np.exp(-(t - 0.62) * 13)))
    scen = np.where(t < 0.55, np.nan, 0.30 + 0.52 * (1 / (1 + np.exp(-(t - 0.60) * 9))))
    ax.plot(cx + t * cw, cy + ch * 0.06 + real * ch * 0.80, color=ACCENT, lw=1.7, zorder=5)
    ax.plot(cx + t * cw, cy + ch * 0.06 + scen * ch * 0.80, color=AMBER, lw=1.6,
            ls=(0, (3, 2)), zorder=5)
    ax.text(cx + 0.018, cy + ch - 0.030, "승률 — 실제 경기", fontsize=7, color=ACCENT, zorder=6)
    ax.text(cx + 0.018, cy + ch - 0.058, "승률 — 내 개입 시나리오", fontsize=7,
            color=AMBER, zorder=6)

    ty0 = ry0 + 0.205
    ax.plot([cx, cx + cw], [ty0, ty0], color=GREY, lw=1.2, zorder=4)
    for frac, lab in [(0.06, "킥오프"), (0.55, "실점"), (0.70, "동점"), (0.90, "역전")]:
        ax.plot([cx + frac * cw], [ty0], "o", ms=4.5, color=INK, zorder=5)
        ax.text(cx + frac * cw, ty0 - 0.042, lab, fontsize=6.8, color=GREY, ha="center")
    ax.plot([cx + 0.47 * cw], [ty0], "o", ms=9, mfc="white", mec=RED, mew=1.7, zorder=6)
    ax.text(cx + 0.47 * cw, ty0 + 0.036, "개입 시점", fontsize=7, color=RED,
            ha="center", fontweight="bold")

    wf_box(ax, cx, ry0 + 0.05, cw, 0.062,
           "이 시점에 개입하기  →  전술보드 오버레이 (S1과 같은 컴포넌트)", fs=8,
           fc=ACCENT, ec=ACCENT, tc="white", bold=True)

    # ── S3 공유 수신 랜딩
    sx, sy, sw, sh = 1.46, 0.07, 0.72, 0.79
    wf_box(ax, sx, sy, sw, sh, fc="white", ec=INK, lw=1.4)
    ax.text(sx, sy + sh + 0.045, "S3 공유 수신 랜딩", fontsize=10, fontweight="bold", color=INK)
    wf_box(ax, sx + 0.02, sy + sh - 0.088, sw - 0.04, 0.068,
           "보낸 사람의 전술 — URL에서 복원", fs=8, fc=SOFT, ec=GRID)
    bh3 = 0.34
    bw3 = bh3 * PITCH_WH
    draw_board(ax, sx + (sw - bw3) / 2, sy + 0.315, bw3, bh3, r=0.0082)
    draw_prob_panel(ax, sx + 0.03, sy + 0.160, sw - 0.06, 0.140, fs=8.5,
                    note="수신자 기기에서 자동 재추론")
    wf_box(ax, sx + 0.03, sy + 0.06, sw - 0.06, 0.068,
           "내 전술로 바꿔보기", fs=8.5, fc=ACCENT, ec=ACCENT, tc="white", bold=True)
    save(fig, "f11_wireframe_replay_share.png")


def f12_probability():
    p, n = 0.62, 5000
    z = 1.96
    denom = 1 + z ** 2 / n
    center = (p + z ** 2 / (2 * n)) / denom
    half = (z / denom) * math.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2))
    lo, hi = (center - half) * 100, (center + half) * 100

    fig, axes = plt.subplots(1, 3, figsize=(7.4, 2.5),
                             gridspec_kw={"width_ratios": [1, 0.85, 1.35]})
    for a in axes:
        a.set_xticks([]); a.set_yticks([]); a.grid(False); despine(a, keep=())

    ax = axes[0]
    for i in range(100):
        r, c = divmod(i, 10)
        filled = i < 62
        ax.add_patch(plt.Circle((c, -r), 0.36, color=GREEN if filled else GRID, zorder=3))
    ax.set_xlim(-0.9, 9.9); ax.set_ylim(-9.9, 0.9); ax.set_aspect("equal")
    ax.set_title("① 100번 중 62번", loc="left", fontsize=10.5, pad=8)

    ax = axes[1]
    ax.text(0.5, 0.60, "62%", ha="center", va="center", fontsize=40,
            fontweight="bold", color=GREEN)
    ax.text(0.5, 0.30, "승리 확률", ha="center", va="center", fontsize=10, color=INK)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.set_title("② 숫자", loc="left", fontsize=10.5, pad=8)

    ax = axes[2]
    lo25, hi25 = 60.65, 63.32     # 25,000회일 때의 대비용 (아래에서 다시 계산)
    denom2 = 1 + z ** 2 / 25000
    c2 = (p + z ** 2 / (2 * 25000)) / denom2
    h2 = (z / denom2) * math.sqrt(p * (1 - p) / 25000 + z ** 2 / (4 * 25000 ** 2))
    lo25, hi25 = (c2 - h2) * 100, (c2 + h2) * 100

    ax.add_patch(plt.Rectangle((56, 0.44), 12, 0.10, color=GRID, zorder=2))
    ax.add_patch(plt.Rectangle((lo, 0.40), hi - lo, 0.18, color=GREEN, alpha=0.28, zorder=3))
    ax.plot([lo, hi], [0.49, 0.49], color=GREEN, lw=2.4, zorder=4)
    for v in (lo, hi):
        ax.plot([v, v], [0.42, 0.56], color=GREEN, lw=1.8, zorder=5)
    ax.plot([62], [0.49], "o", color=GREEN, ms=9, zorder=6)
    ax.text(lo - 0.18, 0.49, f"{lo:.1f}", ha="right", va="center", fontsize=8.5, color=GREEN)
    ax.text(hi + 0.18, 0.49, f"{hi:.1f}", ha="left", va="center", fontsize=8.5, color=GREEN)
    ax.text(62, 0.76, f"5,000회 → {lo:.1f} – {hi:.1f}%", ha="center",
            fontsize=9.5, color=INK, fontweight="bold")
    ax.plot([lo25, hi25], [0.25, 0.25], color=ACCENT, lw=2.4, zorder=4)
    for v in (lo25, hi25):
        ax.plot([v, v], [0.19, 0.31], color=ACCENT, lw=1.8, zorder=5)
    ax.plot([62], [0.25], "o", color=ACCENT, ms=7, zorder=6)
    ax.text(62, 0.09, f"25,000회 → {lo25:.1f} – {hi25:.1f}%", ha="center",
            fontsize=9, color=ACCENT)
    ax.set_xlim(56, 68); ax.set_ylim(0, 1)
    ax.set_title("③ 구간 — 반복을 늘리면 좁아진다", loc="left", fontsize=10.5, pad=8)
    fig.tight_layout()
    save(fig, "f12_probability.png")


def f13_share_card():
    fig, ax = plt.subplots(figsize=(6.4, 6.4 * 630 / 1200))
    ax.set_xlim(0, 1200); ax.set_ylim(0, 630)
    ax.set_aspect("equal"); ax.axis("off")
    ax.add_patch(plt.Rectangle((0, 0), 1200, 630, color="#10161F", zorder=0))
    ax.add_patch(plt.Rectangle((0, 0), 1200, 8, color=ACCENT, zorder=2))

    draw_pitch(ax, 60, 90, 300, 470)
    for (px, py), c in zip(FORMATION_433, POS_COLORS):
        ax.add_patch(plt.Circle((60 + px * 300, 90 + py * 470), 13, color=c, zorder=4))

    ax.text(430, 545, "RE:FORMATION", color="#7FB3E0", fontsize=13,
            fontweight="bold", va="center")
    ax.text(430, 487, "같은 체코전, 다른 전술", color="white", fontsize=22,
            fontweight="bold", va="center")
    ax.text(430, 424, "조별리그 1차전 · 4-3-3 · 59분 개입", color="#8E9CAD",
            fontsize=11, va="center")

    labels = ["라인 높이", "압박 강도", "공격 폭", "템포"]
    vals = [0.78, 0.62, 0.45, 0.70]
    for i, (lab, v) in enumerate(zip(labels, vals)):
        y = 370 - i * 42
        ax.text(430, y, lab, color="#8E9CAD", fontsize=10, va="center")
        ax.add_patch(plt.Rectangle((560, y - 5), 240, 10, color="#2A3442", zorder=3))
        ax.add_patch(plt.Rectangle((560, y - 5), 240 * v, 10, color=ACCENT, zorder=4))
        ax.plot([560 + 240 * v], [y], "o", ms=7, color="#7FB3E0", zorder=5)

    segs = [(0.62, GREEN, "승 62"), (0.21, AMBER, "무 21"), (0.17, RED, "패 17")]
    left = 430
    for frac, color, lab in segs:
        w = 700 * frac
        ax.add_patch(plt.Rectangle((left, 150), w, 30, color=color, zorder=4))
        ax.text(left + w / 2, 165, lab, color="white", fontsize=11, fontweight="bold",
                ha="center", va="center", zorder=5)
        left += w
    ax.text(430, 108, "5,000회 시뮬레이션 · 95% 구간 ±1.4%p", color="#6B7A8C",
            fontsize=9, va="center")
    ax.text(430, 62, "가공명 표기 · 비공식 팬 프로젝트", color="#55636F",
            fontsize=8.5, va="center")
    save(fig, "f13_share_card.png")


# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("기획서 그림 생성")
    matches = pd.read_csv(RAW / "matches.csv", parse_dates=["match_date"])
    tours = pd.read_csv(RAW / "tournaments.csv")
    mens = set(tours[~tours["tournament_name"].str.contains("Women", na=False)]["tournament_id"])
    m = matches[matches["tournament_id"].isin(mens)].copy()
    m["label90"] = m.apply(label90, axis=1)
    print(f"  월드컵 본선(남자) {len(m):,}경기")

    res = fetch_results()
    print(f"  A매치 {len(res):,}경기 — Elo 산출")
    hist_d, hist_r, _ = run_elo(res)

    def elo_at(team, date, init=1500.0):
        ds = hist_d.get(team)
        if not ds:
            return init
        i = bisect.bisect_left(ds, date)
        return hist_r[team][i - 1] if i > 0 else init

    k = lambda nm: TEAM_MAP.get(nm, nm)
    m["elo_diff"] = ([elo_at(k(h), d) for h, d in zip(m["home_team_name"], m["match_date"])]
                     - np.array([elo_at(k(a), d) for a, d in zip(m["away_team_name"], m["match_date"])]))

    f00_cover()
    f01_group3rd()
    f02_three_matches()
    f03_elo_expansion()
    f04_elo_traj(hist_d, hist_r)
    f05_calibration(m)
    f06_score_model(m)
    f07_mc_error()
    f08_rps()
    f09_latency()
    f10_wireframe_board()
    f11_wireframe_replay_share()
    f12_probability()
    f13_share_card()
    print(f"완료 -> {OUT}")


if __name__ == "__main__":
    main()
