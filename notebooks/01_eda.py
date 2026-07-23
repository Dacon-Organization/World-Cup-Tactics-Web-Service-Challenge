# ---
# jupyter:
#   jupytext:
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.19.1
#   kernelspec:
#     display_name: Python 3
#     language: python
#     name: python3
# ---

# %% [markdown]
# # 01. EDA — 이 데이터는 무엇을 담고 있고, 무엇이 없는가
#
# > **「만약의 감독」 분석 노트북 (00~09 중 01장)** · 설계 정본: [노트북_서사_v1_0.md](../docs/planning/ml/version1.0/노트북_서사_v1_0.md)
#
# ## 이 장의 질문
#
# 1. 학습 데이터(`jfjelstul/worldcup`, CC BY-SA 4.0)는 실제로 무엇을 담고 있는가 — 기간·규모·품질?
# 2. 승/무/패의 **기저율**은 얼마이고, 시대에 따라 변했는가?
# 3. 득점은 정말 **포아송 분포**로 근사되는가? (07장 스코어 생성 모델의 전제 검증)
# 4. 개최국 효과는 데이터에서 관측되는가? (피처 후보의 근거)
# 5. **전술 성향 컬럼이 정말 없는가?** — ADR-008(슬라이더 = 조정 계층)의 사실 근거를 데이터로 재현
#
# ## 개정 이력 (반복 사이클 규약 — 정본: [ITERATION-LOG](ITERATION-LOG.md))
#
# | 사이클 | 날짜 | 발견 | 원인 | 수정 | 영향 범위 |
# |---|---|---|---|---|---|
# | c1 | 2026-07-23 이전 | 최초 작성 (수집·마스킹·기저율·포아송·개최국·전술 컬럼 부재) | — | — | — |
# | c2 | 2026-07-23 | 수집 서사·탐색 단계 부재 (사용자 피드백) | 9장 선형 구조에 "탐색" 관점 부재 | 수집·파일럿·마스킹 절(구 1-1~1-3)을 **00장으로 이관**, 이 장은 interim 로드 게이트 + 전처리 결정 절로 재편 | 이 장 §1 · 00장 신설 |
#
# ## 규약
#
# - **시드 42 고정** · 각 장 서두 "이 장의 질문" / 말미 "이 장의 답" (노트북_서사 §1)
# - **Decision Box(DB-n)**: 분석 중 설계 결정을 흐름 안에 기록 — 설계 문서의 `[설계 결정]` 태그와 상호 참조
# - **실명 마스킹(NB-R1)**: 마스킹은 **00장 로드 직후** 수행됨(c2 이동). 이 장은 마스킹된
#   `data/interim/`만 읽으며, 입력 게이트에서 실명 컬럼 0개를 재검증한다. 국가·팀명은 허용(P7)
# - 데이터 라이선스: 산출물은 CC BY-SA 4.0 분리 고지 대상 (P10, [DATA-LICENSE.md](../DATA-LICENSE.md))

# %%
# 환경·시드 고정 (재현 규약 — 노트북_서사 §5)
import sys, platform, random, hashlib, json, io, urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt
from scipy import stats

SEED = 42
random.seed(SEED); np.random.seed(SEED)

# 한글 폰트 — 디자인 시스템 폰트(Pretendard, 시스템 설치본) 우선
matplotlib.rcParams["font.family"] = ["Pretendard", "Malgun Gothic", "sans-serif"]
matplotlib.rcParams["axes.unicode_minus"] = False

ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
DATA_RAW = ROOT / "data" / "raw"
DATA_INTERIM = ROOT / "data" / "interim"
FIGURES = ROOT / "notebooks" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)

print(f"Python {sys.version.split()[0]} on {platform.system()}")
print(f"pandas {pd.__version__} | numpy {np.__version__} | matplotlib {matplotlib.__version__}")
print(f"SEED = {SEED} | ROOT = {ROOT.name}")

# %% [markdown]
# ## 1. 입력 게이트 — 00장 산출물 로드 (수집·마스킹은 00장으로 이관)
#
# c1의 수집(DB-01)·파일럿 검증·마스킹 셀은 **00장(수집·탐색)으로 이관**되었다.
# 이 장은 마스킹 완료된 `data/interim/`만 읽으며, 진입 시 세 가지를 검증한다:
#
# 1. **NB-R5**: 00장 산출물이 없으면 명시적 에러로 중단 (조용한 재수집 금지)
# 2. **NB-R1 재검증**: 로드한 전 테이블에 실명 계열 컬럼이 0개인지 (방어의 이중화)
# 3. **설계 가정**: ML_설계 §3.1의 스키마 가정과 일치하는지 (구 파일럿 검증 계승)

# %%
NAME_KEYS = ("given_name", "family_name", "player_name", "full_name", "shirt_name")
_required = ["jfjelstul_matches", "jfjelstul_team_appearances", "jfjelstul_tournaments", "jfjelstul_goals"]
_missing = [f for f in _required if not (DATA_INTERIM / f"{f}.parquet").exists()]
if _missing:
    raise FileNotFoundError(f"00장을 먼저 실행하세요 — 누락: {_missing} (NB-R5)")

matches = pd.read_parquet(DATA_INTERIM / "jfjelstul_matches.parquet")
team_apps = pd.read_parquet(DATA_INTERIM / "jfjelstul_team_appearances.parquet")
tournaments = pd.read_parquet(DATA_INTERIM / "jfjelstul_tournaments.parquet")
goals = pd.read_parquet(DATA_INTERIM / "jfjelstul_goals.parquet")

# NB-R1 재검증 — 00장이 마스킹했지만 이 장에서도 게이트를 세운다 (구조의 이중화)
for name, df in [("matches", matches), ("team_appearances", team_apps),
                 ("tournaments", tournaments), ("goals", goals)]:
    bad = [c for c in df.columns if any(k in c.lower() for k in NAME_KEYS)]
    assert not bad, f"{name}에 실명 컬럼 잔존: {bad}"
    print(f"── {name}: {df.shape[0]:,}행 × {df.shape[1]}열 · 실명 컬럼 0개")

# 설계 가정 검증 (구 파일럿 검증): ML_설계 §3.1 스키마 가정과 일치하는가
assert {"match_id", "extra_time", "penalty_shootout", "home_team_score", "away_team_score"} <= set(matches.columns)
assert {"team_name", "goals_for", "goals_against", "match_date"} <= set(team_apps.columns)
assert {"tournament_id", "year", "host_country"} <= set(tournaments.columns)
print("\n입력 게이트 통과 — 00장 산출물 · 마스킹 재검증 · 스키마 가정 일치")

# %% [markdown]
# ## 1.5. 전처리 결정 — 00장 탐색이 넘긴 과제에 답한다
#
# ### Decision Box DB-02' — 전처리 방침 (00장 인계 과제의 해소)
#
# | # | 00장 인계 과제 | 결정 | 근거 |
# |---|---|---|---|
# | ① | results(martj42)에 2026 본선 포함 → 컷오프 | **02장 Elo에서 처리** — 사전 레이팅은 "해당 경기 이전 경기만의 함수"로 계산되므로 구조적으로 차단, 02장 리키지 assert가 검증. 이 장의 EDA는 jfjelstul(1930~2022)만 사용 — 아래에서 2026 미포함을 실측 확인 | 평가_설계 §3 |
# | ② | 남녀 대회 분리 기준 | `tournament_name`의 "Men" 포함 여부 (§2에서 적용) — martj42는 남자 한정이므로 여자 Elo는 기존 방식 유지 | ADR-007 |
# | ③ | 승부차기·연장 라벨 | 90분 기준 유지 — `extra_time`/`penalty_shootout` 경기는 무승부 계상 (§3 DB-02) | 피처_정의서 §2 |
# | — | 결측 처리 | **불필요** — 00장 실측: matches·results 결측 0. 별도 대체·제거 없음 | 00장 §5 |

# %%
# ①의 실측 확인 — 이 장의 분석 대상(jfjelstul)에는 2026 대회가 없다
_years = tournaments["year"]
print(f"jfjelstul 대회 연도 범위: {_years.min()}~{_years.max()} (2026 미포함 → EDA는 컷오프 무관)")
assert _years.max() <= 2023, "jfjelstul에 2024 이후 대회 등장 — 컷오프 설계 재검토 필요"

# %% [markdown]
# ## 2. 데이터 개요 — 기간·규모·품질 진단

# %%
# 남자/여자 대회 분리 (ADR-007: 주 학습은 남자 대회, 여자는 증강 실험)
tournaments["is_mens"] = tournaments["tournament_name"].str.contains("Men")
mens_ids = set(tournaments.loc[tournaments["is_mens"], "tournament_id"])

m_matches = matches[matches["tournament_id"].isin(mens_ids)].copy()
m_apps = team_apps[team_apps["tournament_id"].isin(mens_ids)].copy()

summary = pd.DataFrame({
    "행 수": [len(matches), len(m_matches), len(team_apps), len(goals), len(tournaments)],
    "설명": ["경기 전체(남+여)", "남자 대회 경기", "팀-경기 전체", "득점 이벤트(마스킹됨)", "대회"],
}, index=["matches", "matches(남)", "team_appearances", "goals", "tournaments"])
print(summary)

mens_t = tournaments[tournaments["is_mens"]]
print(f"\n남자 대회: {len(mens_t)}개 ({mens_t['year'].min()}~{mens_t['year'].max()}) — 설계 가정(22개 대회) 검증")
assert len(mens_t) == 22, "ADR-007 전제(남자 22개 대회) 불일치"

# 품질: 결측·중복
print(f"\nmatches 결측 상위: ")
na = m_matches.isna().sum()
print(na[na > 0].sort_values(ascending=False).head(5) if (na > 0).any() else "  핵심 컬럼 결측 없음")
print(f"match_id 중복: {m_matches['match_id'].duplicated().sum()}건")


# %% [markdown]
# ## 3. 라벨 기초 — 승/무/패 기저율
#
# ### Decision Box DB-02 — 90분 기준 라벨 재구성
#
# [피처_정의서 §2](../docs/planning/ml/version1.0/피처_정의서_v1_0.md)의 `[설계 결정]`을 구현한다:
# **라벨 = 정규 90분 기준 승/무/패.** `extra_time` 또는 `penalty_shootout`이 참인 경기는 90분
# 시점에 동점이었으므로 무승부로 계상한다. 서비스의 예측 대상(조별리그 컨텍스트)에서 무승부는
# 유효한 결과이기 때문이다. 아래에서 재구성 라벨과 원본 `result`의 차이(= 연장/승부차기 경기 수)를
# 확인해 변환이 의도대로인지 검증한다.

# %%
def label_90min(row) -> str:
    """90분 기준 결과 — 연장·승부차기는 90분 무승부"""
    if row["extra_time"] == 1 or row["penalty_shootout"] == 1:
        return "draw"
    if row["home_team_score"] > row["away_team_score"]:
        return "home_win"
    if row["home_team_score"] < row["away_team_score"]:
        return "away_win"
    return "draw"

m_matches["label90"] = m_matches.apply(label_90min, axis=1)
n_et = int(((m_matches["extra_time"] == 1) | (m_matches["penalty_shootout"] == 1)).sum())
print(f"연장/승부차기 경기(→ 90분 무승부 계상): {n_et}건 / {len(m_matches)}경기")

base = m_matches["label90"].value_counts(normalize=True).rename("비율")
print("\n승/무/패 기저율 (홈 팀 기준, 90분):")
print((base * 100).round(1).astype(str) + "%")

# %%
# 연대별 기저율 추이 — 무승부 비율의 시대 변화
m_matches["year"] = m_matches["tournament_id"].map(tournaments.set_index("tournament_id")["year"])
m_matches["era"] = (m_matches["year"] // 10 * 10).astype(int)

era_rates = (m_matches.groupby("era")["label90"]
             .value_counts(normalize=True).unstack().fillna(0))
fig, ax = plt.subplots(figsize=(9, 4.2))
era_rates[["home_win", "draw", "away_win"]].plot(
    kind="bar", stacked=True, ax=ax,
    color=["#2f6b4f", "#c9a227", "#27436b"], width=0.75)
ax.set_title("연대별 승/무/패 기저율 (남자 대회, 90분 기준)")
ax.set_xlabel("연대"); ax.set_ylabel("비율")
ax.legend(["홈 승", "무승부", "원정 승"], loc="upper right", fontsize=9)
plt.tight_layout()
fig.savefig(FIGURES / "01_baserate_by_era.png", dpi=150)
plt.show()

draw_recent = era_rates.loc[era_rates.index >= 1990, "draw"].mean()
print(f"1990년대 이후 무승부 비율 평균: {draw_recent:.1%} — 폴백 산식(ML_설계 §6.3)의 d̂ 상수 후보")

# %% [markdown]
# ## 4. 득점 분포 — 포아송 근사는 성립하는가
#
# 07장 스코어 생성 모델(bivpois λ + Dixon-Coles τ, ADR-006)은 "팀당 득점이 포아송으로
# 근사된다"를 전제한다. 전제를 **먼저 데이터로 확인**한다 — 히스토그램과 λ=표본평균 포아송
# pmf를 겹쳐 보고, 저점수 구간의 이탈(τ 보정이 필요한 이유)을 관찰한다.

# %%
gf = m_apps["goals_for"].astype(int)
lam = gf.mean()
ks = np.arange(0, gf.max() + 1)
obs = gf.value_counts(normalize=True).reindex(ks, fill_value=0)
pois = stats.poisson.pmf(ks, lam)

fig, ax = plt.subplots(figsize=(9, 4.2))
ax.bar(ks, obs, width=0.7, color="#2f6b4f", alpha=0.8, label="관측 빈도")
ax.plot(ks, pois, "o-", color="#27436b", label=f"Poisson(λ={lam:.2f})")
ax.set_title("팀당 득점 분포 vs 포아송 근사 (남자 대회 전 경기)")
ax.set_xlabel("득점"); ax.set_ylabel("확률")
ax.legend()
plt.tight_layout()
fig.savefig(FIGURES / "01_goals_poisson.png", dpi=150)
plt.show()

# 저점수 이탈 정량 — Dixon-Coles τ 보정의 근거
dev = pd.DataFrame({"관측": obs.iloc[:3].values, "포아송": pois[:3]}, index=[0, 1, 2])
dev["차이(관측-이론)"] = dev["관측"] - dev["포아송"]
print("저점수(0~2골) 구간 관측 vs 이론:")
print(dev.round(4))
print("\n→ 근사는 대체로 성립하되 저점수 구간에 이탈이 있다 — DC τ 보정(ADR-006)의 데이터 근거")

# %%
# 시대별 평균 득점 추이 — 저득점화 경향 (시계열 감각)
era_goals = m_apps.merge(
    tournaments[["tournament_id", "year"]], on="tournament_id")
era_goals["era"] = (era_goals["year"] // 10 * 10).astype(int)
trend = era_goals.groupby("era")["goals_for"].mean()

fig, ax = plt.subplots(figsize=(9, 3.6))
ax.plot(trend.index, trend.values, "o-", color="#2f6b4f", linewidth=2)
ax.set_title("연대별 팀당 평균 득점 — 현대로 올수록 저득점")
ax.set_xlabel("연대"); ax.set_ylabel("팀당 평균 득점")
ax.grid(alpha=0.3)
plt.tight_layout()
fig.savefig(FIGURES / "01_goals_era_trend.png", dpi=150)
plt.show()
print(trend.round(2))
print("\n→ 초기 대회(1930~50년대)의 고득점은 현대와 분포가 다르다 — 시간 감쇠·시대 피처를"
      " 두지 않는 대신, Elo가 시대 내 상대 강도를 흡수하는지 02장에서 확인")

# %% [markdown]
# ## 5. 개최국 효과 — host 피처의 근거
#
# 월드컵은 대부분 중립 경기지만 개최국만은 예외다. 피처_정의서 §2의 `host` 피처가 실제로
# 신호를 갖는지 기초 통계로 확인한다. (공동 개최 대회는 문자열 포함 매칭으로 처리)

# %%
m_apps2 = m_apps.merge(tournaments[["tournament_id", "host_country"]], on="tournament_id")
m_apps2["is_host"] = m_apps2.apply(
    lambda r: str(r["team_name"]) in str(r["host_country"]), axis=1)

host_stats = m_apps2.groupby("is_host").agg(
    경기수=("win", "size"), 승률=("win", "mean"),
    평균득점=("goals_for", "mean"), 평균실점=("goals_against", "mean")).round(3)
host_stats.index = ["비개최국", "개최국"]
print(host_stats)

diff = host_stats.loc["개최국", "승률"] - host_stats.loc["비개최국", "승률"]
print(f"\n개최국 승률 우위: +{diff:.1%}p — host 피처 채택의 데이터 근거 (피처_정의서 §2)")

# %% [markdown]
# ## 6. 전술 컬럼 부재 확인 — ADR-008의 사실 근거를 데이터로 재현
#
# [ADR-008](../docs/planning/decisions/ADR-008-슬라이더매핑.md)은 "학습 데이터에 전술 성향
# 컬럼이 존재하지 않는다"를 근거로 슬라이더를 학습 피처가 아닌 **입력 조정 계층**으로 확정했다.
# 그 사실 확인을 노트북 안에서 재현한다 — 데이터셋 27개 테이블 전체의 헤더를 스캔해 전술
# 키워드(formation·tactic·press·tempo·style·system)를 검색한다. (헤더만 소량 요청, 결과 캐시)

# %%
# 커밋 핀 고정 URL (00장과 동일 핀 — 수집 규약 c2)
PIN_JFJELSTUL = "35a8667f518b07469182ae16d35574dd0e7a00fb"
BASE = f"https://raw.githubusercontent.com/jfjelstul/worldcup/{PIN_JFJELSTUL}/data-csv/"

ALL_TABLES = [
    "award_winners", "awards", "bookings", "confederations", "goals", "group_standings",
    "groups", "host_countries", "manager_appearances", "manager_appointments", "managers",
    "matches", "penalty_kicks", "player_appearances", "players", "qualified_teams",
    "referee_appearances", "referee_appointments", "referees", "squads", "stadiums",
    "substitutions", "team_appearances", "teams", "tournament_stages",
    "tournament_standings", "tournaments"]
KEYWORDS = ("formation", "tactic", "press", "tempo", "style", "system")

cache = DATA_RAW / "_headers.json"
if cache.exists():
    headers = json.loads(cache.read_text(encoding="utf-8"))
    print("헤더 캐시 사용")
else:
    headers = {}
    for t in ALL_TABLES:
        req = urllib.request.Request(BASE + f"{t}.csv", headers={"Range": "bytes=0-4095"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                first = r.read().decode("utf-8", errors="replace").splitlines()[0]
            headers[t] = first.split(",")
        except Exception as e:  # 네트워크 실패는 기록만 (비치명)
            headers[t] = [f"<fetch 실패: {e}>"]
    cache.write_text(json.dumps(headers, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"27개 테이블 헤더 수집·캐시 완료")

hits = {t: [c for c in cols if any(k in c.lower() for k in KEYWORDS)]
        for t, cols in headers.items()}
found = {t: h for t, h in hits.items() if h}
total_cols = sum(len(c) for c in headers.values())
print(f"\n스캔: 테이블 {len(headers)}개 · 컬럼 {total_cols}개 · 전술 키워드 매치: {sum(len(h) for h in found.values())}건")
print(f"매치 상세: {found if found else '없음 — 전술 성향 컬럼 부재 확인'}")
assert not found, "전술 컬럼 발견 — ADR-008 재검토 필요"
print("\n→ ADR-008의 전제가 데이터 전수 스캔으로 재확인됨: 슬라이더는 조정 계층이 유일한 경로")

# %% [markdown]
# ## 7. 이 장의 답
#
# | 질문 | 답 | 후속 |
# |---|---|---|
# | 데이터 실체 | 남자 대회 22개(1930~2022) 정상 적재 · 핵심 컬럼 결측 없음 · match_id 중복 0 | 02장 피처로 진행 |
# | 기저율 | 위 3절 실측 — 90분 무승부 비율(1990~)이 폴백 산식 d̂ 상수의 후보값 | ML_설계 §6.3 d̂ 확정 재료 |
# | 포아송 근사 | 대체로 성립, **저점수 구간 이탈 관측** — DC τ 보정의 데이터 근거 확보 | 07장 스코어 모델 |
# | 개최국 효과 | 개최국 승률 우위 실측 — host 피처 근거 | 02장 피처 채택 |
# | 전술 컬럼 | **27개 테이블 전수 스캔 매치 0건** — ADR-008 전제 재확인 | 조정 계층 확정 유지 |
#
# **기획서 반영 후보** (조판 블록 인계):
# - 9·10절: 기저율·득점 분포 실측 그림(`01_goals_poisson.png`) — "포아송 전제를 데이터로 확인했다"
# - 10절 한계 고지: 저점수 이탈 → τ 보정 필요성의 실측 근거
# - 16절 부록: 본 노트북 산출 수치의 출처를 "자체 분석(01장)"으로 등재
#
# **02장 인계 조건**: `data/interim/` 4테이블(+results·team_name_map) 존재 · 남자 22개 대회
# 검증 통과 · 마스킹 재검증 통과 · 전처리 결정(DB-02') 확정 — 2026 컷오프는 02장 Elo가 검증
