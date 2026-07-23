# 데이터 라이선스 고지 (코드 라이선스와 분리)

> 이 문서는 **데이터셋 기반 산출물**에 대한 라이선스 고지입니다.
> 이 저장소의 소스 코드 라이선스와는 별개이며, CC BY-SA 4.0의 동일조건변경허락(ShareAlike)
> 조항이 코드에 전염되지 않도록 적용 범위를 명확히 분리합니다. (근거: 리서치 P10)

---

## 원 데이터셋

### 1차 — Fjelstul World Cup Database

- **출처**: [jfjelstul/worldcup](https://github.com/jfjelstul/worldcup) (GitHub) · Kaggle 동일 저작자 배포
- **저작자**: Joshua C. Fjelstul, Ph.D.
- **라이선스**: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (저작자표시-동일조건변경허락 4.0 국제)
- **사용 범위**: 모델 학습·통계 집계 파이프라인의 입력 (원본 CSV는 이 저장소에 **커밋하지 않음** — `data/`는 .gitignore)

### 2차 — International football results (Elo 산출 입력, 2026-07-23 채택)

- **출처**: [martj42/international_results](https://github.com/martj42/international_results) (GitHub)
- **라이선스**: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (퍼블릭 도메인 기증 — 고지 의무 없음이나 투명성을 위해 출처 명기)
- **사용 범위**: `results.csv`(남자 A매치 경기 결과 — 선수명 컬럼 없음)만 Elo 레이팅 산출 입력으로 사용. **`goalscorers.csv`는 선수 실명을 포함하므로 다운로드·사용하지 않음** (실명 경계 — 기획서 13절). 원본 CSV 비커밋 규약 동일

## 이 고지의 적용 대상 (데이터셋 기반 산출물)

아래 산출물은 위 데이터셋으로부터 파생된 것으로, **CC BY-SA 4.0** 조건을 따릅니다:

| 산출물 | 위치 |
|---|---|
| 분석 노트북의 통계·그림 | `notebooks/*.ipynb` 출력 셀 · `notebooks/figures/` |
| 학습된 모델 가중치·계수 (예정) | `public/model/` (구현 후) |
| 팀·선수 능력 프로파일 집계 통계 (예정) | `src/data/*.json`의 profile 필드 (구현 후) |

## 적용 제외 (별도 라이선스)

- 소스 코드(노트북의 코드 셀 포함 로직) · 문서(`docs/`) · UI 에셋 — 저장소 코드 라이선스를 따름
- 리플레이 경기 팩트(스코어·이벤트 분): 공개 사실 정보로서 별도 교차 검증 출처 사용 (기획서 9절)

## 참고

- 화면·클라이언트에 노출되는 선수 표기는 위 데이터셋의 실명이 아닌 **완전 가공명**입니다
  (퍼블리시티권 보호 — 기획서 13절). 실명 데이터는 학습 파이프라인 내부에서만 사용됩니다.
