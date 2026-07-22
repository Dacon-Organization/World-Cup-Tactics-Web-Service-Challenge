## 개요
본 리서치는 데이콘 "내가 축구 감독이라면" 웹서비스의 전술보드 드래그앤드롭(D&D) 인터랙션, 접근성, "감독이 된 것 같은" 역할 몰입 설계, 즉각적 피드백의 지연 임계값, 확률 시각화, 온보딩 어포던스에 대한 1차 출처 조사 결과다. [사실]과 [추정]을 구분해 표기한다.

***
## 1. 드래그앤드롭 UX 모범 사례
| 문제/상황 | 권장 패턴 | 이유 | 안티패턴 | 관련 기준(WCAG 등) | 출처 URL |
|---|---|---|---|---|---|
| 드래그 가능 여부를 알려야 함 | grab-handle 아이콘 + hover 시 커서 모양 변경(플랫폼 표준 커서 사용, 커스텀 아이콘 지양) | 드래그 가능한 대상이라는 신호(signifier)와 클릭해도 다른 컨트롤이 활성화되지 않는 안전한 타겟을 동시에 제공[^1] | 커스텀 아이콘만 사용해 사용자가 의미를 추측해야 함(햄버거/케밥 아이콘과 혼동)[^1] | — | https://www.nngroup.com/articles/drag-drop/ |
| 드래그 시작(그랩) 피드백 | 윤곽선/대비색, 드롭섀도로 "위에 떠 있는" 느낌, 오프셋(기울임/들여쓰기), 반투명 "고스트" 이미지 표시[^1] | 사용자가 실제로 무엇을 옮기고 있는지 즉시 인지시켜 잘못된 항목을 끄는 실수를 방지[^1] | 그랩 상태와 평상시 상태가 시각적으로 동일해 사용자가 성공적으로 집었는지 확신 못함[^1] | — | https://www.nngroup.com/articles/drag-drop/ |
| 목록 재정렬 시 주변 항목 이동 예고 | 약 100ms의 짧은 애니메이션(이징 적용)으로 다른 항목이 비켜나는 모습을 미리 보여줌; 트리거 시점은 드래그 객체의 "중심"이 다른 항목 경계와 겹칠 때[^1] | 즉시 재배치하면 물리적 조작감이 사라지고, 트리거를 커서 기준으로 하면 "말랑말랑"하거나 "과민반응"하는 느낌이 생김[^1] | 순간적으로 다시 그리기(instant redraw)해 조작감 상실, 혹은 너무 민감하게 반응해 예측 불가능한 움직임 발생[^1] | — | https://www.nngroup.com/articles/drag-drop/ |
| 드롭 가능 영역 표시(스냅/마그네티즘) | 드롭존이 실제 경계보다 약간 넓게 활성화되도록 하고, 점선 테두리·하이라이트·스냅 예고 애니메이션으로 활성 상태를 시각적으로 명시[^1] | Fitts's Law상 정밀한 커서 위치 지정이 어려우므로 마그네틱 효과로 정밀도 요구를 낮춤[^1] | 드롭존이 시각 경계 밖으로 확장돼 있는데 아무 신호도 없어 사용자가 "어디에 놓아야 하는지" 모름[^1] | — | https://www.nngroup.com/articles/drag-drop/ |
| 잘못된 드롭/취소 처리 | 마우스 업 이벤트에서 유효하지 않은 타겟이면 원위치로 되돌리는 애니메이션 제공, `Esc`로 선택 취소 지원[^2] | 액션이 되돌릴 수 없는 경우가 많아 실수로 인한 손실을 방지(Pointer Cancellation 원칙과 동일한 안전장치)[^2] | 드롭 이벤트를 mousedown에 바인딩해 취소 불가능한 즉시 실행이 되어버림[^2] | WCAG 2.5.2 Pointer Cancellation | https://brothercake.com/reference/drag-and-drop/ |
| 이동/리사이즈 구분 커서 | 이동은 손 모양(open→closed hand), 리사이즈는 축을 따른 화살표 크로스바 커서로 구분; 플랫폼 표준 커서 재사용[^1] | 두 인터랙션은 결과가 다르므로(이동 vs 크기 변경) 사전에 명확히 구분해야 사용자의 기대와 일치[^1] | 모든 드래그 가능 요소에 동일한 커서를 사용해 이동인지 리사이즈인지 혼동[^1] | — | https://www.nngroup.com/articles/drag-drop/ |
| 긴 거리 드래그의 정밀도 문제 | 큰 이동은 드래그로, 정밀 위치 조정은 보조 인터랙션(방향키 등)으로 이원화[^1] | 드래그는 태생적으로 부정확하고 물리적으로 피로할 수 있음, 특히 장거리에서[^1] | 모든 정밀도를 드래그 하나로 해결하려다 사용자가 반복적으로 드롭 실패[^1] | — | https://www.nngroup.com/articles/drag-drop/ |
## 2. 접근성 문제와 해결책
| 문제/상황 | 권장 패턴 | 이유 | 안티패턴 | 관련 기준(WCAG 등) | 출처 URL |
|---|---|---|---|---|---|
| 마우스로만 조작 가능한 드래그 기능 | 모든 드래그 기능에 "단일 포인터로 드래그 없이" 수행할 수 있는 대안 제공(예: 선수를 클릭 후 목표 위치를 클릭)[^3] | 정밀한 드래그 동작을 수행할 수 없는 운동 능력 제약 사용자를 위한 필수 대안[^3] | 드래그만 가능하고 클릭-클릭 대안이 없음 | WCAG 2.2 SC 2.5.7 Dragging Movements (Level AA)[^3] | https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html |
| 키보드만으로 조작 | Tab으로 핸들에 포커스 → Space로 "그랩" → 방향키로 이동 → Enter로 드롭 컨테이너에 배치 → Esc로 선택 취소[^2] | 2.5.7은 포인터 대안이지 키보드 대안이 아니므로 별도 키보드 경로가 필요; 두 요건은 독립적으로 평가됨[^3] | 키보드 대안이 마우스 드래그와 동일한 정밀 좌표 추적을 요구해 사실상 사용 불가능 | WCAG 2.1.1 Keyboard (Level A)[^4], WCAG 2.5.7[^3] | https://brothercake.com/reference/drag-and-drop/ |
| 스크린리더 사용자에게 상태 전달 | 핸들에 "그랩됨/그랩 안됨", 현재 위치, 사용 가능한 조작키를 알리는 메시지 제공; ARIA live region으로 이동 시마다 위치 변화 안내[^1] | 스크린리더는 시각적 드래그를 "볼" 수 없어 명확한 피드백과 시맨틱이 없으면 사용자가 추측만 하게 됨[^5] | `aria-grabbed`, `aria-dropeffect`는 ARIA 1.1에서 deprecated되어 완전한 대안이 되지 못함, 시맨틱만으로 접근성 보장 불가[^2] | ARIA 1.1(구 aria-grabbed/dropeffect, 현재 폐지)[^2] | https://www.nngroup.com/articles/drag-drop/ , https://brothercake.com/reference/drag-and-drop/ |
| 드래그 자체가 스크린리더에 근본적으로 부적합할 가능성 | "드래그를 아예 안 쓰거나 항상 비드래그 대안을 제공"하는 것을 원칙으로 채택; 과제를 재정의(예: 순서 변경은 번호 편집이나 이동 버튼으로) | 스크린리더 사용자에게는 세심히 레이블링해도 인지적 부담이 크다는 실무 경험이 반복적으로 보고됨[^5] | 접근성 라벨만 붙이고 "이제 접근 가능하다"고 간주 | WCAG 2.5.7(Level AA)[^5] | https://ux.stackexchange.com/questions/100488/ |
| 모바일 터치 – 스크롤과의 충돌 | 탭·스와이프(스크롤)·의도적 "그랩"을 구분하기 위해 짧은 지연(long-press) 타이밍을 두고, 그랩되었다는 명확한 피드백(햅틱 등)을 제공[^1] | 호버 상태가 없는 터치스크린에서는 드래그 개시 신호가 애매해 스크롤과 오작동이 발생하기 쉬움[^1] | 지연 없이 즉시 드래그를 시작해 스크롤 제스처와 충돌 | — | https://www.nngroup.com/articles/drag-drop/ |
| 모바일 – 손가락 크기·타겟 크기 | 드래그 가능한 객체 주변에 최소 1cm×1cm의 여유 공간을 확보하고, 손가락에 가려지는 영역(그랩 상태 하이라이트 등)이 화면에서 보이도록 오프셋 배치[^1] | 손가락이 굵어(fat-finger) 대상을 정확히 짚기 어렵고, 피드백이 손가락에 가려지면 조작 확인이 불가능[^1] | 데스크톱과 동일한 타겟 크기를 모바일에 그대로 적용 | WCAG 2.2 SC 2.5.8 Target Size (Minimum, 관련 원칙)[^6] | https://www.nngroup.com/articles/drag-drop/ |
| 모바일 – 드래그 자체의 적합성 판단 | 사용성 테스트로 사용자가 실제로 드래그를 기대하는지 확인하고, 컷-앤-페이스트/메뉴 방식 등 상호작용 비용이 낮은 대안이 없는 경우에만 D&D 채택[^1] | 모바일에서 D&D는 호버 신호 부재로 구현이 어렵고 대안이 더 낮은 인터랙션 비용을 가질 수 있음[^1] | 데스크톱에서 검증된 D&D 패턴을 그대로 모바일에 이식 | — | https://www.nngroup.com/articles/drag-drop/ |

***
## 3. 역할 몰입(Role Immersion)을 만드는 인터페이스 설계 원리 [사실/추정 혼합, 항목별 표기]
**[사실] 다이어제틱(diegetic) UI와 몰입의 관계.** 게임 UI 연구에서는 인터페이스 요소가 게임 세계 자체에 속하는지(다이어제틱) 아니면 화면에 덧씌워진 별도 레이어인지(비다이어제틱, 즉 전형적 HUD)를 구분한다. 10명 참가자를 대상으로 한 실험 연구는 비다이어제틱 HUD 요소를 제거했을 때 2-표본 t-검정 기준으로 몰입감이 유의하게 상승했고, 2원 분산분석에서도 HUD 유무가 몰입에 유의한 영향을 미쳤다고 보고했다. Far Cry 2(다이어제틱 중심)와 Far Cry 6(비다이어제틱 중심)를 비교한 논문은 다이어제틱 요소가 행위감(agency)·지각(perception)·감정(emotion) 경로로 몰입에 영향을 주지만, 플레이어의 게임 경험 수준에 따라 효과가 달라진다고 결론지었다.[^7][^8][^9]

**[사실] EA SPORTS FIFA의 "목적적 몰입(Purposeful Immersion)" 프레임워크.** FIFA 스토리 모드(The Journey) UX 팀은 UI를 기능적 목적과 감정적 목적으로 나누는 "UX Immersion Matrix"를 도입했다. 선수 관리 같은 과업 중심 화면은 "기능적 몰입"(효율성·유연성 우선), 경기 직전/직후처럼 서사가 중요한 화면은 "감정적 몰입"(현실감·서사 지속성 우선)으로 설계했으며, 화면을 Light/Medium/Heavy UI로 나눠 각 순간의 몰입 요구에 맞춰 UI 밀도를 조절했다.[^10]

**[사실] Football Manager 전술 화면의 한계에 대한 디자인 비평.** Football Manager 전술 화면 리디자인 케이스 스터디는 원작이 초록 피치 배경에 빨강/초록 색상으로 활성/비활성 지시를 표시해 "스키틀즈 캔디처럼" 보인다고 비판하고, 플레이어의 자기 행위감(self-agency)을 살리려면 선택 폭을 흑백(이분법) 대신 지시 요소별 "집중도(focus level)" 같은 연속 스펙트럼으로 표현해야 한다고 제안했다. 이는 "이분법적 온/오프 토글"보다 "슬라이더형 연속 파라미터"가 감독의 미세한 의사결정 감각을 더 잘 전달한다는 시사점을 준다.[^11]

**[추정] 축구 전술보드에 적용 시 시사점.** 위 사례들을 종합하면 몰입은 (1) 용어 선택 — "설정" 대신 "지시(instruction)", "확률" 대신 "예상 전개" 등 감독의 언어를 쓰는 것, (2) 정보의 다이어제틱화 — 파라미터 슬라이더를 전술 보드 옆의 "코칭스태프 노트" 형태로 배치해 화면 밖 UI 느낌을 줄이는 것, (3) 상황별 UI 밀도 조절 — 스쿼드 편집 중에는 기능 중심(Heavy) UI, 예측치 갱신 순간에는 서사적 반응(선수들이 실제로 반응하는 듯한 애니메이션)을 넣는 것으로 요약된다.

**우리 서비스에 적용한다면:** 전술 파라미터 슬라이더 라벨을 "라인 높이", "압박 강도" 같은 감독 용어로 유지하고 수치(0–100) 대신 "낮음/보통/높음" 같은 질적 라벨을 병기해 계산기가 아닌 지시를 내리는 느낌을 주어야 한다. 예측치 패널은 별도 대시보드처럼 분리하지 말고 필드 옆 "전술 보드" 프레임 안에 통합해 하나의 장면처럼 보이게 하고, 슬라이더 조작 시 필드 위 선수 위치가 미세하게 반응하는 애니메이션(다이어제틱 피드백)을 추가해야 한다. 이는 [추정]이며 자체 사용성 테스트로 검증이 필요하다.
## 4. 즉각적 피드백과 지연 임계값 [사실, 수치 포함]
Jakob Nielsen의 「Usability Engineering」(1993)에서 확립된 3단계 응답시간 한계는 현재까지 UX 실무의 표준 기준으로 통용된다.[^12]

- **0.1초(100ms) 이하:** 사용자가 자신이 UI 객체를 "직접 조작(direct manipulation)"하고 있다고 느끼는 한계다. 예를 들어 테이블 컬럼을 클릭한 순간부터 해당 컬럼이 하이라이트되기까지의 시간이 이 기준에 해당하며, 이상적으로는 정렬 자체도 0.1초 안에 끝나야 사용자가 "내가 직접 정렬한다"고 느낀다.[^12]
- **1초 이하:** 사용자의 "생각의 흐름(flow of thought)"이 끊기지 않는 한계다. 0.2~1.0초 지연은 사용자가 지연을 인지하지만 컴퓨터가 "작업 중"이라고 받아들이는 구간이며, 1초를 넘기면 UI가 "느리다"고 느끼고 조작-반응의 직접성(flow)을 상실한다.[^12]
- **10초 이하:** 사용자가 대화(작업)에 주의를 유지할 수 있는 한계다. 이보다 길어지면 사용자는 다른 작업으로 전환하려 하므로 퍼센트 완료 표시기(progress indicator)가 필요하다.[^12]

이 세 임계값은 웹 애플리케이션에도 동일하게 적용되며, "웹 기반 애플리케이션이라서 다른 기준을 적용해야 한다"는 통념은 근거가 없다고 명시되어 있다.[^12]

**우리 서비스에 적용한다면:** 전술 파라미터 슬라이더를 드래그하는 동안 필드 위 아이콘/색상 하이라이트 반응은 100ms 이내에 나와야 "내가 직접 팀을 조작한다"는 감독 체험이 성립한다. xG·승패 확률의 재계산은 ONNX Runtime Web 온디바이스 추론이므로 이론상 100ms~1초대 처리가 가능해야 하며, 이 구간을 넘길 경우(특히 몬테카를로 시뮬레이션 모드에서 수천 회 반복 계산 시 10초 이상 걸릴 수 있음) 반드시 퍼센트 완료 표시기와 취소 옵션을 노출해야 한다. 슬라이더 조작 시 debounce로 최종 계산을 지연시키더라도, 최소한 시각적 프리뷰(예: 라인 위치 이동)는 100ms 내에 즉시 반영해 "느리다"는 인지를 차단해야 한다.[^12]
## 5. 확률·불확실성 시각화 [사실, 수치·기법 포함]
**[사실] 단일 수치 표시의 오해 문제.** 아이콘 배열(icon array)에서 사용자가 퍼센트 값을 추출하는 방식에 관한 지각 편향 연구는, 단일 숫자나 단순 채워진 아이콘 개수만으로는 사용자가 실제 확률을 체계적으로 오독하는 편향(bias)이 존재함을 보였다. 아이콘 배열과 막대그래프를 비교한 최신 연구(2025)도 비교 과업에서 두 형식이 서로 다른 오차 패턴을 만든다고 보고했다.[^13][^14]

**[사실] Hypothetical Outcome Plots(HOPs).** Hullman 등(2015)의 연구는 HOPs가 오차 막대(error bar)나 바이올린 플롯보다 훈련되지 않은 일반 사용자의 확률 추정 정확도를 높인다는 것을 실험으로 입증했다. Kale 등(2019, IEEE TVCG)의 후속 연구는 HOPs가 다변량 확률 추정에서 정적 불확실성 시각화보다 우수하며, 시각 시스템이 앙상블(ensemble)의 통계적 요약 속성을 빠르고 자동적으로 처리하는 능력을 활용한다고 설명했다. 즉 HOPs는 "가능한 결과들을 애니메이션으로 순차 재생"하는 방식으로, 정적 단일 확률 수치보다 불확실성을 체감시키는 데 효과적이다.[^15][^16]

**[사실] 스포츠 예측 서비스의 실제 사례 — FiveThirtyEight.** FiveThirtyEight의 NBA 예측은 CARM-Elo 레이팅을 기반으로 시즌을 10,000회 시뮬레이션해 플레이오프 진출율·우승 확률을 산출하며, "hot" 시뮬레이션(매 경기 후 레이팅을 갱신)을 사용해 핫스트릭/콜드스트릭의 불확실성을 반영한다. 경기 중 승리 확률은 시간에 따라 변화하는 라인 차트(win probability chart)로 표시되며, 이는 정적 단일 확률이 아니라 "시간에 따른 확률 궤적"을 보여주는 방식이다. 이 모델의 예측 보정(calibration) 검증에서는 "90% 승리 확률"이라고 예측된 경기가 실제로는 약 90.48%의 승률을 보여 보정이 양호했다고 보고됐다.[^17][^18][^19][^20]

**우리 서비스에 적용한다면:** 조별리그 진출 확률은 단일 숫자(예: "62%")만 노출하지 말고, 최소 두 겹의 표현을 병행해야 한다. 첫째, 10,000회 몬테카를로 시뮬레이션 결과를 아이콘 배열(100개 중 62개 채움)로 보조 표시해 단일 퍼센트 오독을 줄이고, 둘째, 사용자가 전술 파라미터를 조정할 때마다 그 변화가 확률 분포 전체를 어떻게 이동시키는지 보여주는 간단한 HOPs 스타일 애니메이션(몇 개의 개별 시뮬레이션 결과를 순차 재생)을 옵션으로 제공하는 것을 검토해야 한다. FiveThirtyEight 방식처럼 경기 중 xG·승률의 "시간축 변화"를 라인 차트로 보여주는 리플레이 모드 UI도 고려할 수 있다. 다만 이 적용안은 [추정]이며, ONNX 온디바이스 추론 성능(질문 4의 임계값)과의 트레이드오프를 별도 검증해야 한다.[^16][^18][^15][^13]
## 6. 첫 방문자 온보딩 설계 [사실/추정]
**[사실] 점진적 공개(Progressive Disclosure).** NN/g는 점진적 공개를 "고급 또는 자주 쓰이지 않는 기능을 부차적 화면으로 미루어 애플리케이션을 배우기 쉽고 오류를 줄이는" 기법으로 정의한다. 기본 경로(primary path)는 부가 옵션을 열지 않고도 사용 가능해야 한다는 것이 핵심 원칙이다.[^21][^22][^23]

**[사실] "훈련용 바퀴(Training Wheels)" 인터페이스와 기본값의 중요성.** NN/g는 Carroll의 초기 실험을 인용하며, 사용자가 처음에 적은 수의 핵심 기능만 접하도록 제한했을 때 고급 기능 학습 성과도 오히려 더 좋았다고 설명한다. 이는 핵심 개념에 대한 견고한 정신모형(mental model)을 먼저 구축하는 것이 이후 고급 기능 습득의 토대가 되기 때문이다.[^24]

**[사실] 선택지 간 차이의 명시성(Explicitness).** NN/g는 옵션 간 핵심 차이가 암묵적이거나 숨겨져 있으면 사용자가 잘못된 선택을 하거나 기능을 오해한다고 지적하며, 차이가 적을 때는 그 차이를 강조하고 차이가 많을 때는 "정말 중요한" 차이만 강조해 나머지는 점진적 공개로 미루라고 권고한다.[^25]

**우리 서비스에 적용한다면 (심사자가 짧은 시간에 핵심 기능을 발견해야 하는 상황):**
- 초기 화면에는 슬라이더 4개(라인 높이·압박 강도·템포·폭)와 예측치 패널만 노출하고, 세부 전술 옵션(개별 선수 지시, 세트피스 설정 등)은 "고급 설정"으로 접혀 있어야 한다. 이는 점진적 공개 원칙에 따른 것이다.[^22]
- 첫 진입 시 기본값(default)은 실제 강팀의 전형적 포메이션과 파라미터로 미리 채워, 심사자가 아무것도 조작하지 않아도 예측치가 이미 표시된 상태로 시작해야 한다. 이는 "훈련용 바퀴" 원칙과 맞물려 사용자가 빈 화면이 아니라 완성된 기본 상태에서 "무엇을 바꾸면 무엇이 변하는가"를 즉시 관찰하도록 만든다.[^24]
- 슬라이더를 살짝 움직이기만 해도 예측치가 갱신되는 것을 보여주는 미세한 시각적 유도(예: 첫 로드 시 슬라이더 손잡이에 은은한 펄스 애니메이션)를 넣어, 튜토리얼 텍스트 없이도 "조작 가능한 대상"임을 어포던스로 전달해야 한다.
- 슬라이더 라벨과 즉시 반응하는 확률 패널을 화면의 시선 이동 경로상 가장 가까운 위치(같은 뷰포트)에 배치해, 심사자가 스크롤이나 클릭 없이 "조작→반응"의 인과관계를 1~2초 내에 발견하게 해야 한다. 이는 4번 문항의 100ms~1초 반응 임계값과 결합해 실제 몰입 체험의 핵심 증거가 된다.[^12]

이 항목들은 NN/g의 일반 원칙을 축구 전술보드 맥락에 적용한 것으로 [추정]에 해당하며, 실제 효과는 데이콘 제출 전 최소 1회의 약식 사용성 테스트(5명 내외)로 검증하는 것을 권장한다.

***
## 이 답변의 한계
Football Manager 자체의 공식 UX 설계 문서나 개발사(Sports Interactive)의 1차 발표 자료는 확인하지 못했으며, 위 3번 섹션의 FM 관련 내용은 3자 디자인 비평(Dribbble 케이스 스터디)에 근거한 것으로 공식성이 낮다. 확률 시각화의 "실제 사용자 반응 측정" 데이터(예: 아이콘 배열 대 HOPs의 A/B 테스트 결과가 스포츠 예측 서비스에 직접 적용된 사례)는 축구 도메인에서는 찾지 못했고, 일반 데이터 시각화 연구(NBA·의료 분야)에서 외삽한 것이다. ARIA를 이용한 스크린리더 드래그앤드롭 구현의 최신(2024년 이후) 표준화 동향은 추가 검증이 필요하다.

---

## References

1. [Drag–and–Drop: How to Design for Ease of Use](https://www.nngroup.com/articles/drag-drop/) - Summary: Clear signifiers and clear feedback at all stages of the interaction make drag–and–drop dis...

2. [Keyboard-Accessible Drag and Drop](https://brothercake.com/reference/drag-and-drop/)

3. [Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

4. [How "Drag-And-Drop" Movements Affect Web Accessibility](https://www.boia.org/blog/how-drag-and-drop-movements-affect-web-accessibility) - Some drag-and-drop features can affect accessibility. Here’s how developers can avoid creating barri...

5. [Why drag-and-drop may not be accessible for screen readers](https://www.linkedin.com/posts/nicoleletoile_accessibility-tip-rethinking-drag-and-drop-activity-7361394978075385860-t0WS) - Accessibility Tip: Rethinking Drag-and-Drop Even if your drag-and-drop feature is keyboard-accessibl...

6. [Drag-and-Drop Design: Accessibility Best Practices](https://appinstitute.com/drag-and-drop-design-accessibility-best-practices/) - Practical guidance to make drag-and-drop interfaces accessible: keyboard support, ARIA announcements...

7. [Pengaruh diegetic user interface dalam meningkatkan aspek immersion pada game bergenre role playing game / Arief Yoga Pangestu | UPT Perpustakaan UM](http://mulok.library.um.ac.id/index.php?p=show_detail&id=107845) - Video game telah berkembang menjadi bentuk hiburan yang sangat populer dan diterima secara umum. Vid...

8. [Diegesis in game UI and HUDs and its perceived effects on ...](https://www.um.edu.mt/library/oar/handle/123456789/118649) - The comparative analyses concluded that whilst diegetic elements can influence player's immersion th...

9. [Can Diegetic User Interface Improves Immersion in Role-Playing Games? | Semantic Scholar](https://www.semanticscholar.org/paper/Can-Diegetic-User-Interface-Improves-Immersion-in-Rosyid-Pangestu/826f17877a48814d208605d537353f31e325a70f) - This research shows that playing games with a diegetic user interface could increase player’s immers...

10. [FIFA Story Mode UX Design - Felix Lai](https://felixlai.net/fifa-story-mode-ux-design) - Hello, I'm Felix Lai. I'm a passionate UX designer committed to crafting user-friendly and enjoyable...

11. [Football Manager - Tactic Screen redesign • Case Study](https://dribbble.com/shots/19909920-Football-Manager-Tactic-Screen-redesign-Case-Study) - Football Manager - Tactic Screen redesign • Case Study designed by Piotr Kosmala. Connect with them ...

12. [Response Time Limits: Article by Jakob Nielsen](https://www.nngroup.com/articles/response-times-3-important-limits/) - There are 3 main time limits (which are determined by human perceptual abilities) to keep in mind wh...

13. [Investigating Perceptual Biases in Icon Arrays](https://groups.cs.umass.edu/hci-vis/wp-content/uploads/sites/33/2022/11/Investigating-Perceptual-Biases-in-Icon-Arrays.pdf) - C Xiong 저술 · 2022 · 39회 인용 — When a viewer reads an icon array, how do they extract a percentage val...

14. [Graphical Perception of Icon Arrays versus Bar Charts for ...](https://arxiv.org/html/2509.16465v1) - We lack understanding of how icon arrays impact comparison tasks, as previous research examined desi...

15. [Hypothetical Outcome Plots Help Untrained Observers ...](https://dl.acm.org/doi/10.1109/TVCG.2018.2864909) - A Kale 저술 · 2019 · 166회 인용 — HOPs greatly improve multivariate probability estimation over conventio...

16. [Hypothetical Outcome Plots Outperform Error Bars and Violin ...](https://pmc.ncbi.nlm.nih.gov/articles/PMC4646698/) - J Hullman 저술 · 2015 · 268회 인용 — Several previous uncertainty visualizations present multiple individ...

17. [Win Probability (SAS) Over Game Time : FiveThirtyEight](https://archive.org/details/fivethirtyeight-image-16b7087b47eb) - AI-generated image description: Line chart showing San Antonio Spurs win probability across four qua...

18. [Every NBA Team's Chance Of Winning In Every Minute Across Every ...](https://fivethirtyeight.com/features/every-nba-teams-chance-of-winning-in-every-minute-across-every-game/) - Can you summarize the NBA season in one chart? With 794 games, more than 152,000 possessions and som...

19. [[OC] How accurate is FiveThirtyEight?](https://www.reddit.com/r/nba/comments/8we539/oc_how_accurate_is_fivethirtyeight/)

20. [How Our 2015-16 NBA Predictions Work | FiveThirtyEight](https://fivethirtyeight.com/features/how-our-2015-16-nba-predictions-work/) - UPDATE (Oct. 20, 2016; 1 p.m.): Our 2016-17 NBA Predictions follow the same methodology as our predi...

21. [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) - Progressive disclosure defers advanced or rarely used features to a secondary screen, making applica...

22. [Progressive Disclosure (Video)](https://www.nngroup.com/videos/progressive-disclosure/) - To reduce complexity in a user interface, employ progressive disclosure to defer secondary options t...

23. [Nielsen Norman Group: Progressive Disclosure UX Pattern Source](https://uxpatternsguide.com/sources/nng-progressive-disclosure/) - Defines progressive disclosure as deferring advanced or rarely used features to secondary screens or...

24. [Training Wheels User Interface - NN/G](https://www.nngroup.com/articles/training-wheels-user-interface/) - Training wheels user interfaces (users are initially limited to a few features) enhance learning com...

25. [Explicitly State the Difference Between Options](https://www.nngroup.com/articles/explicit-differences/) - When the key differences between choices are implied or buried, users often select the wrong option ...

