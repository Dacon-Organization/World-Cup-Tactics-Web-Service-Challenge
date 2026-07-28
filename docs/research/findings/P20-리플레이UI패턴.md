# P20 — 리플레이 타임라인·승률 라인차트 UI 패턴 + 경기 선택 카드·국기 자산 실측

- **발주일**: 2026-07-28 (D-2b S2a 착수 직전 적재) / **수행일**: 2026-07-28 / **회수일**: 2026-07-28
- **트리거**: T1(근거 공백) + T2(대안 교착) + T4(기술 미검증) + T5(반박 필요) — P5·P12·P8 파생
- **블로킹 대상**: **S2a 구현(F09)** · S2b 설계(F10·F12)의 차트 형태 결정 · 국기 자산 조달 방식
- **조사 방식**: 에이전트 자체 리서치 — 업계 1차 설명서(Opta/Stats Perform · Sofascore) +
  학술 원문(arXiv 1906.05029) + W3C 표준 원문 3종(WCAG 2.2 Understanding 1.4.11 ·
  WAI Complex Images 튜토리얼 · ARIA APG Slider) + **로컬 실측**(GitHub API로 flag-icons
  SVG 4종 내려받아 raw·gzip 바이트 측정).

---

## 왜 이 건이 필요했는가

F09~F16(리플레이 4종 · 공유 4종)은 기획서가 약속한 절반인데 구현 0%입니다. 그런데
`findings/` 전수 검색에서 **리플레이 화면의 시각 형태에 대한 근거는 P5의 "FiveThirtyEight식
시간축 승률" 한 줄이 전부**였습니다. F12 명세는 그 한 줄을 받아 "538식 2라인(실제 실선 ·
시나리오 파선)"으로 적어 뒀는데, 여기에 **축구 고유의 문제가 숨어 있습니다 — 538의 시간축
승률 차트는 NFL·NBA 것이고, 그 종목엔 무승부가 없습니다.**

우리 예측 엔진은 이미 승/무/패 3값을 내고(F05~F07), D-1 재설계에서 확률 배열을 "한 화면에
결과색 하나"로 되돌렸습니다. 리플레이 차트가 "승률" 한 줄만 그리면 **같은 제품 안에서 확률의
부호화가 두 개**가 됩니다. 어느 쪽이 맞는지 업계·학술 관행을 확인하지 않고 정하면, 심사자의
"무승부는 어디 갔나" 질문(T5)에 답할 근거가 없습니다.

동시에 S2a는 **국기 4종을 처음 화면에 올리는 지점**입니다. 라이선스는 P7·P16에서 이미
해소됐지만(flag-icons MIT · 국기법 제11조 활용 허용), **바이트 비용은 아무도 재지 않았습니다**(T4).

## 조사 질문 (프롬프트 대체)

1. 축구의 시간축 승률 차트는 무엇을 그리는가 — 승 단독 1계열인가, 승·무·패 3계열인가?
2. 그 차트에서 이벤트(득점·퇴장)는 어떤 위상인가 — 장식인가, 구조인가?
3. 모멘텀 차트(Sofascore·Opta)는 우리가 따라 할 수 있는 패턴인가?
4. 차트·스크러버의 접근성 계약은 무엇인가 (대비·대체 텍스트·키보드)?
5. 경기 선택 카드는 결과(스코어)를 먼저 보여야 하는가 — 스포일러 회피 관행과 충돌하는가?
6. 국기 4종의 실제 전송 비용은 얼마인가?

---

## 요약 및 판단

### Q1. 축구 승률 차트는 **3계열이 표준이다** — "승률 1선"은 종목이 다른 관행이었다

세 갈래 출처가 전부 승·무·패 3결과를 함께 다룹니다.

| 출처 | 성격 | 원문 근거 |
|---|---|---|
| **Opta Live Win Probability** | 업계 1차(중계 송출본) | LWP는 "the likelihood of each match outcome (**win, draw or loss**)"를 경기 전·중에 예측. 표시 예시가 **17% / 26% / 57%** 3값 동시 |
| **Robberechts et al., arXiv:1906.05029** | 학술 1차 | Figure 1이 맨시티-QPR 경기의 "**minute-by-minute win/tie/loss probabilities**" 3곡선. 논문이 축구 예측의 난점 1번으로 꼽는 것이 "**The frequent occurrence of ties**" |
| **inpredictable 인매치 모델** | 공개 구현체 | "the model provides **win, loss, and draw probabilities** as a function of game time (in minutes), goal differential, and pre-match odds" |

**⚠️ 채택 결정 `[설계 결정]` — F12는 "3계열을 동시에 그리지 않되, 무승부를 숨기지도 않는다".**

3계열 × (실제·시나리오) = **6선**은 375px 폭에서 읽히지 않습니다. 그렇다고 승 1선만 그리면
위 세 출처가 공통으로 말하는 축구의 특성(무승부가 1급 결과)을 지웁니다. 해법은 이미 이
제품 안에 있습니다 — **D-1이 확률 배열에 적용한 "결과 선택 탭 + 한 번에 한 결과" 규약을
차트에 그대로 확장**합니다. 한 시점에 화면에 있는 것은 `실선(실제) + 파선(시나리오)` 2선이고,
탭으로 승/무/패 계열을 갈아 끼웁니다. 부호화가 제품 전체에서 하나로 유지되고, F12-R3
(색+패턴 이중 구분)도 그대로 성립합니다.

**S2a로 내려오는 귀결**: 경기 선택 카드에 **"승률 62%" 같은 단일 수치를 찍지 않습니다.**
카드 단계에서 3값을 다 넣으면 목록이 대시보드가 되고, 1값만 넣으면 방금 기각한 부호화가
됩니다. 카드는 **확정 사실(스코어·개최지·라운드)만** 싣고 확률은 S2b에서 시작합니다.

### Q2. 이벤트는 장식이 아니라 **곡선을 만드는 구조**다

Opta LWP 원문은 확률을 "shift **rapidly**" 시키는 사건을 열거합니다 — "**Goals**",
"**Red cards**", "**Penalties** being **awarded**", "**Missed penalties**", 그리고 추가시간
변동. 실례로 크리스탈 팰리스-맨시티에서 퇴장 하나가 팰리스 승률을 **38% → 59%** 로 옮겼습니다.

**우리 데이터에 대입하면 계단은 득점에서만 생깁니다.** `matches.json`의 이벤트는 `goal`·`sub`
2종뿐이고, 경고는 F10-R3이 **의도적으로 미표시**입니다(P13 확정 전 차단이 데이터 단계에서
걸려 있음). 세 경기 합계 득점 이벤트는 6건 — 즉 **우리 곡선의 변곡점은 최대 6개**입니다.

→ 이것이 F12의 사전계산(빌드 타임) 설계를 정당화합니다. 변곡점이 6개인 곡선을 런타임에
계산할 이유가 없습니다. 또한 마커는 **F11 개입점 선택 UI 그 자체**이므로 터치 타겟 규칙
(≥44px)의 적용 대상입니다.

### Q3. 모멘텀 차트(Sofascore·Opta)는 **따라 할 수 없다** — 입력 데이터가 없다

Sofascore Attack Momentum은 "**a bar graph**, and each bar represents **one minute of play**"
이고, Opta 모멘텀은 "Each minute, match momentum compares the **two most threatening
situations** each team had leading up to that minute"에 스무딩(최근 3~4분 가중)을 겁니다.

**두 방식 모두 분 단위 이벤트 데이터(슈팅·패스·점유)를 전제합니다.** 우리 1차 데이터셋
(joshfjelstul, CC BY-SA)은 **경기 결과·요약 수준**이고, 이벤트 데이터셋(StatsBomb 재업로드)은
P10이 **채택 금지**로 확정했습니다. 즉 모멘텀 차트는 취향 문제가 아니라 **데이터 조달
금지선에 막힌 것**입니다.

→ **기각 사유를 기록해 둡니다(T5 대비).** "왜 소파스코어처럼 모멘텀 바가 없나"라는 질문에
"라이선스가 허용하는 데이터로 만들 수 있는 것과 없는 것을 구분했다"고 답할 수 있어야 합니다.
없는 데이터를 그럴듯하게 그리는 것이 더 큰 감점입니다.

### Q4. 접근성 계약 — 표준 원문 3종이 정하는 것

**(a) WCAG 2.2 SC 1.4.11 Non-text Contrast — 차트 선에 적용된다.** Understanding 원문:
"Parts of graphics required to understand the content"는 인접색 대비 **3:1** 이상.
선 차트 예시가 명시적으로 들어 있습니다 — "In order to understand the graph you need to
discern the lines and shapes for each condition." 계산값은 **반올림 금지**(2.999:1은 미달).

**중요한 면제 조항**: "the information is available in another form, such as **in a table that
follows the graph**"면 그래픽 대비 요건이 완화됩니다.
→ **채택**: 차트 아래(또는 곁)에 **이벤트·확률의 텍스트 목록을 항상 함께** 둡니다. 이건
접근성 보험인 동시에 F10 타임라인 그 자체이므로 **추가 비용이 0**입니다.

**(b) W3C WAI Complex Images — 대체 텍스트는 2부 구성.** "the short description to identify
the image"(짧은 설명) + "a textual representation of the essential information conveyed by
the image"(긴 설명). 권장 기법 중 `<figure role="group">` + `<figcaption>`은 표·제목 같은
구조를 담을 수 있어 우리 사례에 맞습니다. 튜토리얼의 원칙 문장: "**Make long descriptions
available to everyone**".
→ **채택**: 차트를 `<figure>`로 감싸고 `<figcaption>`에 요약 문장을 **눈에 보이게** 둡니다.
`aria-describedby`만 쓰는 안은 원문이 "only works for long descriptions that are text-only"
라고 제한하므로, 표를 포함하는 우리 설명에는 부적합합니다.

**(c) ARIA APG Slider — 스크러버를 슬라이더로 만들면 지켜야 하는 것.** 필수 키:
Right/Up(+1 step), Left/Down(−1), **Home**(최소값), **End**(최대값). 필수 속성:
`aria-valuenow`·`aria-valuemin`·`aria-valuemax`, 그리고 숫자가 불친절할 때 `aria-valuetext`
("Monday" 예시 — 우리는 "63분, 실점"). APG는 **터치 보조기술에서의 한계를 경고**합니다.
→ **S2b 설계 노트**: 타임라인을 연속 슬라이더로 만들면 위 전부를 직접 구현해야 하고 터치
AT 경고까지 안습니다. 우리 변곡점은 6개뿐이므로 **이벤트 버튼 목록(이산 선택)이 슬라이더보다
싸고 안전**합니다. 최종 형태는 S2b 세션에서 결정합니다.

### Q5. 스포일러 회피는 **우리와 목적이 반대인 패턴**이다 — 스코어를 1급 정보로 노출

BBC Sport를 비롯한 스포츠 앱들은 하이라이트 시청자를 위해 점수 숨김·결과 블러 토글을
제공합니다(서드파티 앱 ScoreCover·GameGrader도 "no spoilers"를 전면에 겁니다).

**그러나 그 패턴의 전제는 "아직 결과를 모르는 사용자가 경기를 다시 본다"입니다.** 우리
제품의 전제는 정반대입니다 — **결과를 이미 아는 사용자가 그 결과를 바꿔 본다**(반사실).
스코어를 숨기면 "이 경기, 당신이라면?"이라는 질문 자체가 성립하지 않습니다.

→ **채택**: S2a 카드는 스코어를 숨기지 않고 1급 정보로 싣습니다. 단 **표기는 사실 진술로
한정**합니다(비하 금지 규칙) — 승/패를 감정 어휘로 수식하지 않고, 특정 선택을 "잘못"으로
규정하지 않습니다.

**카드 클릭의 접근성 형태**(Inclusive Components, Heydon Pickering): 카드 전체를 `<a>`로
감싸면 "all elements become part of the link label"이라 스크린리더 낭독이 장황해지고, 블록
요소 중첩도 문제가 됩니다. 권장은 **제목만 링크로 두고 `::after`를 카드 전면에 절대배치**
하는 기법입니다(JS 없이 카드 전체가 클릭됨).
→ **채택**: 제목 링크 + `::after` 오버레이. 다만 원문이 지적한 부작용(오버레이가 텍스트
선택을 막음)은 우리 카드에 **해가 없습니다** — 카드 본문이 3줄짜리 메타데이터라 복사할
동기가 없습니다.

### Q6. 국기 실측 — **멕시코 국기 하나가 나머지 셋의 100배다**

GitHub API로 `lipis/flag-icons`(MIT · ★12.3k · 최종 푸시 2026-07-10) 4x3 SVG 4종을 직접
내려받아 측정했습니다.

| 국가 | 파일 | raw | gzip -9 | 비고 |
|---|---|---|---|---|
| 체코 | `cz.svg` | 225 B | 173 B | 도형 3개 |
| 남아공 | `za.svg` | 860 B | 474 B | 도형 다수 |
| 대한민국 | `kr.svg` | 1,061 B | 503 B | 태극·4괘 |
| **멕시코** | **`mx.svg`** | **84,753 B** | **29,549 B** | **국장(독수리·뱀) 패스** |

- **멕시코가 raw 총합 86.9 KB의 94.6%** 입니다. 1x1 변형도 80,207 B로 대안이 아닙니다.
- npm 패키지 `flag-icons@7.5.0`은 unpacked **4.13 MB**(약 260개국 SVG + 전 국기 CSS 클래스).

**⚠️ 채택 결정 `[설계 결정]`**: npm 의존을 추가하지 않고 **필요한 4개 파일만
`public/flags/`에 복사**합니다. 근거 셋 —
① 4.13 MB 의존성으로 4개 파일을 얻는 교환이 성립하지 않음,
② flag-icons의 CSS는 전 국기 클래스를 담고 있어 우리가 쓰지 않는 256개국이 따라옴,
③ `public/`의 `<img>` 참조는 **JS 번들에 들어가지 않고** `/replay`에서만 요청되므로,
멕시코 29.5 KB가 S1(메인 화면) 예산을 건드리지 않습니다.

MIT 라이선스 고지는 `DATA-LICENSE.md`에 이미 있는 형식으로 추가합니다(P7 고지 대상 목록).
국기 표시 자체의 적법성은 P16이 해소했습니다(「대한민국국기법」 제11조 제1항 "국기 또는
국기문양은 각종 물품과 의식 등에 **활용할 수 있다**", 벌칙 조항 없음 · 훼손·혐오 방식 아님).

**시각 주의 1건**: 체코·남아공 국기는 흰 영역을 포함하므로 라이트 모드의 흰 카드
(`--color-surface: #FFFFFF`) 위에서 경계가 사라집니다. **국기에 1px 테두리**를 둘러 형태를
별도 채널로 보장합니다 — D-2a에서 선수 토큰에 같은 이유로 `box-shadow` 링을 건 것과 동일한
처리입니다(WCAG 1.4.11).

---

## 로컬 자체 검증

| 항목 | 방법 | 결과 |
|---|---|---|
| flag-icons 라이선스·활성도 | `gh api repos/lipis/flag-icons` | MIT · ★12,296 · 최종 푸시 2026-07-10 (유지보수 활성) |
| 국기 SVG 바이트 | `gh api .../contents/flags/4x3/{kr,cz,mx,za}.svg` → base64 디코드 → `stat` + `gzip -9` | 위 표 (mx 84,753 B / gzip 29,549 B) |
| 1x1 대안 여부 | `gh api .../flags/1x1/mx.svg --jq .size` | 80,207 B — 개선 없음 |
| npm 패키지 크기 | `npm view flag-icons dist.unpackedSize` | 4,125,978 B |
| 우리 이벤트 데이터의 변곡점 수 | `src/data/matches.json` 직접 판독 | `goal` 6건 · `sub` 2건 (경고 0건 — F10-R3 준수 확인) |
| 팀 코드 정합 | `src/data/players.json` teams | kor→kr · cze→cz · mex→mx · rsa→za (flag-icons 파일명과 1:1) |

**LLM 요약 신뢰 한계 1건**: Opta·Sofascore 설명서는 차트 이미지로 형태를 보여 주고 본문에는
축·색 규격을 적지 않습니다. 따라서 "3결과를 다룬다"는 **본문 문장으로 확인된 사실**이지만,
"어떤 도형으로 그리는가"는 본문에서 확인되지 않았습니다 — 이 문서는 그 구분을 유지했고,
도형 결정은 우리 제약(모바일 폭·색맹·6선 문제)에서 독립적으로 내렸습니다.

---

## 기존 결론과의 모순 — 1건 (F12 명세 문구)

**모순 사실**: F12 §3은 "실제 라인(실선)과 시나리오 라인(점선+**다른 색**)"으로, DESIGN.md §4는
"`WinProbChart` — **538식 2라인**"으로 적혀 있습니다. Q1의 세 출처는 축구의 시간축 확률이
**3결과 체계**임을 일치해서 보여 주므로, "538식"이라는 명명은 **무승부가 없는 종목의 관행을
지칭**한 것이어서 부정확합니다.

**채택**: 2라인 구성(실선·파선) 자체는 **유지**합니다 — 다만 그 2라인이 "승률"이 아니라
**"선택된 결과의 확률"**이고, 승/무/패 전환은 D-1이 확률 배열에 세운 결과 탭 규약을 씁니다.
`[설계 결정]` 명칭도 "538식"에서 **"결과 선택 + 2라인"**으로 바꿔 적습니다.

**반영 위치**: 본 세션(D-2b)은 S2a 범위이므로 F12 문서 수정은 하지 않고 **vNEXT 변경 노트에
누적**합니다(전역 §7.1 — 작업 중 문서 버전업 금지). S2b 구현 세션에서 이 결정을 적용합니다.

**모순 없음 확인**: P5(538식 시간축 승률 = 서사 장치)의 **의도**는 그대로 성립합니다 —
바뀌는 것은 계열 수 부호화뿐입니다. P12(Wilson 밴드·10×10 배열)와도 충돌하지 않습니다.
P8(공유 5요소)의 "스포일러 프리"는 **공유 카드의 결과 노출 방식**에 대한 항목이지 리플레이
경기 선택 카드에 대한 것이 아니므로, Q5의 결론(스코어 노출)과 충돌하지 않습니다.

---

## 출처

- Opta Analyst, *Explaining Live Win Probability (LWP)* — https://theanalyst.com/articles/live-win-probability
- Opta Analyst, *What is Match Momentum?* — https://theanalyst.com/articles/what-is-match-momentum
- Sofascore, *How Live Attack Momentum Works at the World Cup* — https://www.sofascore.com/news/how-live-attack-momentum-works-at-the-world-cup
- Robberechts, Van Haaren, Davis, *A Bayesian Approach to In-Game Win Probability in Soccer*, arXiv:1906.05029 — https://ar5iv.labs.arxiv.org/html/1906.05029
- inpredictable, *In-Match Soccer Probability* — https://www.inpredictable.com/2014/06/in-match-soccer-probability.html
- W3C, *Understanding SC 1.4.11 Non-text Contrast (WCAG 2.2)* — https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- W3C WAI, *Complex Images* (Web Accessibility Tutorials) — https://www.w3.org/WAI/tutorials/images/complex/
- W3C, *ARIA Authoring Practices — Slider Pattern* — https://www.w3.org/WAI/ARIA/apg/patterns/slider/
- Heydon Pickering, *Inclusive Components — Cards* — https://inclusive-components.design/cards/
- lipis/flag-icons (MIT) — https://github.com/lipis/flag-icons
