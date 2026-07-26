# 기획서 조판 파이프라인

원고 16절 마크다운(`docs/planning/proposal/version2.0/`)을 단일 PDF로 조판한다.
**도구: Pandoc + XeLaTeX + Pretendard + mermaid-cli + matplotlib.**

## 산출물

- `pdf/기획서_REFORMATION_v2.0.pdf` — 제출용 (저장소 추적, 21p)
- `figures/*.png` — 분석 실측·디자인 자산 14종 (저장소 추적, `make_figures.py` 산출)
- `build/` — 중간 산출물(`combined.md`, mermaid PNG). `.gitignore` 처리, 재생성 가능

## 실행

```bash
python dev/typeset/make_figures.py && python dev/typeset/build.py
```

워크트리 루트에서 실행한다. `make_figures.py`는 약 40초(A매치 49,520경기 Elo 산출 포함),
`build.py`는 약 1분(mermaid 9종 렌더 + XeLaTeX 2패스). 그림을 바꾸지 않았다면
`build.py`만 다시 돌려도 된다.

## 의존성

| 도구 | 용도 | 확인 |
|---|---|---|
| pandoc | md → LaTeX → PDF | `pandoc --version` |
| xelatex | PDF 엔진(한글·유니코드) | MiKTeX/TeX Live. `l3kernel`·`l3packages` 최신 필요(xeCJK) |
| mmdc | mermaid → PNG | `npm i -g @mermaid-js/mermaid-cli` |
| Pretendard | 본문·그림 폰트 (OFL, P7 채택) | 시스템 설치 |
| Python 3 | 전처리·그림 생성 | pandas · numpy · matplotlib · pillow |

## make_figures.py — 그림 14종

분석 노트북의 그림은 과정 기록용이라 스타일이 제각각이다. 이 스크립트는 **같은
데이터·같은 수치**를 지면 폭과 팔레트에 맞춰 다시 렌더한다.

| 그룹 | 그림 | 입력 |
|---|---|---|
| 분석 실측 | 진출선 도해 · 세 경기 지표 · Elo 입력 확장 · Elo 궤적 · 캘리브레이션 · 득점 분포/기저율 · RPS 방어선 | `data/raw/` (jfjelstul CC BY-SA + martj42 CC0, 커밋 핀 고정 다운로드) |
| 산식 | 몬테카를로 표본오차 · 지연 예산 | 상수·수식 |
| 디자인 자산 | 표지 키 비주얼 · 와이어프레임 2종 · 확률 3중 표기 · 공유 카드 | 코드로 그린 목업 (실명·공식 상징 0) |

캡션은 **그림 안에 넣지 않는다.** 원고 마크다운의 `![캡션](경로)`가 조판 시 그림 아래
캡션으로 들어가며, 그림 내부 텍스트와 겹치지 않게 하기 위해서다.

## build.py 파이프라인

1. **에셋 복사**: `figures/*.png` → `build/figures/`
2. **로드**: `01_`~`16_*.md` 16개 (인덱스·검수기록 제외)
3. **전처리**
   - `한글(漢字)` 보조 병기 제거 — Pretendard 한자 subset tofu 방지
   - 이미지 경로 정규화: `../../../../dev/typeset/figures/` → `./figures/`
     (원고는 저장소 상대 경로를 써서 GitHub에서도 그림이 보인다)
   - mermaid 코드블록 → `mmdc` PNG(배율 3배) → **흰 여백 트림** → 이미지 참조로 치환
   - 큰따옴표 → 한국어 낫표 「 」 (아래 "한글 조판 이슈" 참조)
   - 한글 인라인 코드 백틱 해제 (monofont tofu 방지)
4. **결합** → `build/combined.md` (표지 뒤 `\newpage`)
5. **pandoc** → XeLaTeX → PDF (`preamble.tex` 주입, Pretendard, A4, 10pt)

## 한글 조판 이슈와 대응

xeCJK는 일부 문자를 CJK 구두점으로 분류해 **인접 공백을 삼킨다.** 대응은 두 가지다.

| 문자 | 증상 | 대응 |
|---|---|---|
| `"` → `“ ”` | `…이다."그런데`처럼 붙음 | `build.py`가 낫표 「 」로 변환 — 자체 여백을 가진 CJK 구두점 |
| `—` `–` | `…강도—로 조정`처럼 붙음 | `preamble.tex`에서 비CJK(Default) 클래스로 재분류 |

`\xeCJKsetup{CJKspace=true}`와 `PunctStyle=plain`은 둘 다 효과가 없었다(실측 확인).

## 표 열 폭

pandoc 파이프 표는 **구분선의 상대 길이**로 열 폭을 잡는다. 구분선 총 길이가
`--columns` 기본값(72)보다 짧으면 자동 폭이 되어 긴 셀이 다음 열로 넘칠 수 있으므로,
원고의 구분선은 총 108자 기준으로 비율을 인코딩해 두었다(`|:-----|:---------|` 형태).

## 알려진 이슈

- `한글(漢字)` 병기는 조판에서 제거된다(원고 원문은 보존). 한자 표시가 필요하면
  preamble에 `ucharclasses` 기반 한자 fallback 폰트를 추가한다.
- 넓은 mermaid(`graph LR`)는 본문 폭에 맞춰 축소되어 글씨가 작아진다. 노드가 5개를
  넘으면 `graph TB` + subgraph 내부 `direction LR`로 쪼개는 편이 낫다(9절 사례).
- gantt의 태스크 이름에 콜론(`:`)이 들어가면 파싱이 깨진다 — 시각 표기는 이름에서 뺀다.
- LaTeX 릴리스 경고(`requested release 2026/06/01`)는 무해(pandoc 템플릿이 최신 요구).
