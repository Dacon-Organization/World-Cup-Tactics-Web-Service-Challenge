# 기획서 조판 파이프라인

원고 16절 마크다운(`docs/planning/proposal/version1.0/`)을 단일 PDF로 조판한다.
**도구: Pandoc + XeLaTeX + Pretendard + mermaid-cli** (사용자 결정 2026-07-26).

## 산출물

- `pdf/기획서_만약의감독_v1.0.pdf` — 제출용(저장소 추적)
- `build/` — 중간 산출물(`combined.md`, mermaid PNG). `.gitignore` 처리, 재생성 가능

## 실행

```bash
python dev/typeset/build.py
```

워크트리 루트에서 실행한다. 약 1분(mermaid 5개 렌더 + XeLaTeX 2패스).

## 의존성

| 도구 | 용도 | 확인 |
|---|---|---|
| pandoc | md → LaTeX → PDF | `pandoc --version` |
| xelatex | PDF 엔진(한글·유니코드) | MiKTeX/TeX Live. `l3kernel`·`l3packages` 최신 필요(xeCJK) |
| mmdc | mermaid → PNG | `npm i -g @mermaid-js/mermaid-cli` |
| Pretendard | 본문 폰트(OFL, P7 채택) | 시스템 설치 |
| Python 3 | 전처리 스크립트 | 표준 라이브러리만 |

## 파이프라인 (build.py)

1. **로드**: `01_`~`16_*.md` 16개(원고_인덱스 제외)
2. **전처리**:
   - `## 검수 메모` 이하 절단(조판 제외 메타)
   - `> 분량 목표:` blockquote·구분선 정리
   - `한글(漢字)` 보조 병기 제거 — Pretendard 한자 subset tofu 방지
   - mermaid 코드블록 → `mmdc` PNG 렌더(배율 3배) → 이미지 참조로 치환
   - `` `[조판: …]` `` 태그 처리:
     - `02_elo_trajectories` → 실제 그림 삽입(캡션 포함)
     - "위 mermaid 렌더" → 캡션만 유지(이미지는 위에서 삽입됨)
     - 그래픽 제작 태그 → **[그래픽 자리]** 안내 blockquote
     - 순수 조판 지시(표 배치·각주 변환 등) → 제거
   - 한글 인라인 코드 백틱 해제(`[설계 결정]` 등, monofont tofu 방지)
3. **결합** → `build/combined.md`(표지 뒤 `\newpage`)
4. **pandoc** → XeLaTeX → PDF (`preamble.tex` 주입, Pretendard, A4, 10pt)

## 조판 범위 (2026-07-26 현재)

**포함**: 16절 본문 전문 · mermaid 5종(7·8·9·10·12절) 렌더 · Elo 궤적 그림(10절) ·
모든 근거 표 · 원형숫자·특수문자·각주.

**미포함(별도 디자인 자산 필요)**: 표지 키 비주얼, 포지셔닝 맵, 와이어프레임 목업,
유저 저니 맵, 간트 차트, 카드 목업 등 순수 디자인 그래픽 10건 → PDF에 **[그래픽 자리]**로
위치·명세만 표시. 본 조판본은 **내용·다이어그램 우선의 조판 초안**이다.

## 알려진 이슈

- `한글(漢字)` 병기는 조판에서 제거된다(원고 원문은 보존). 한자 표시가 필요하면
  preamble에 `ucharclasses` 기반 한자 fallback 폰트를 추가한다.
- 넓은 mermaid(graph LR)는 본문 폭에 맞춰 축소되어 글씨가 작아진다. 필요 시
  해당 다이어그램을 세로 방향(TD)으로 재작성하거나 landscape 페이지를 쓴다.
- LaTeX 릴리스 경고(`requested release 2026/06/01`)는 무해(pandoc 템플릿이 최신 요구).
