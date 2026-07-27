# 폰트 고지 — `public/fonts/`

## 수록 파일

| 파일 | 내용 |
|---|---|
| `RFSans-400.subset.woff2` | 본문·라벨 (Regular) |
| `RFSans-600.subset.woff2` | 섹션 라벨 (SemiBold) |
| `RFSans-700.subset.woff2` | 확률 수치·제목 (Bold) |
| `OFL.txt` | SIL Open Font License 1.1 원문 사본 |

## 출처와 파생 관계

원본은 **Pretendard** (Copyright © Kil Hyung-jin, <https://github.com/orioncactus/pretendard>)
이며 **SIL Open Font License 1.1**로 배포됩니다. 위 `woff2` 3종은 그 원본을
KS X 1001 완성형 한글 2,350자 + Latin + 기호 범위로 **서브셋한 파생본**입니다.

생성 절차는 [`dev/fonts/subset_pretendard.py`](../../dev/fonts/subset_pretendard.py)에
전부 들어 있고, 같은 명령으로 재현됩니다.

```bash
python dev/fonts/subset_pretendard.py
```

## 왜 이름이 "RF Sans"인가

공식 [OFL FAQ 2.6](https://openfontlicense.org/ofl-faq/)은 **웹폰트 서브셋을 수정본
(Modified Version)으로 규정**하고, OFL 1.1 §3에 따라 수정본은 **예약 폰트 이름(RFN)인
"Pretendard"를 사용할 수 없습니다.** FAQ 2.7~2.8의 예외("기능적 동등성")는 *동일한 전체
문자 인벤토리 유지*를 요구하므로, 글리프를 덜어낸 이 서브셋은 예외에 해당하지 않습니다.

따라서 name 테이블의 패밀리명·풀네임·PostScript명과 파일명에서 RFN을 제거하고
`RF Sans`로 바꿨습니다. **글자 아웃라인은 원본과 동일**하므로 제출한 기획서 PDF와
배포 화면의 글자 모양은 어긋나지 않습니다.

OFL §1이 요구하는 **저작권 표기(nameID 0)와 라이선스 표기(nameID 13·14)는 폰트 파일
내부에 그대로 보존**되어 있습니다. 확인:

```bash
python -c "from fontTools.ttLib import TTFont; f=TTFont('public/fonts/RFSans-400.subset.woff2'); print(f['name'].getDebugName(0)); print(f['name'].getDebugName(13))"
```

## 재배포 조건 (OFL 1.1 요약 — 원문이 우선)

- 이 폰트는 단독 판매할 수 없으며, 본 저작권·라이선스 고지와 함께 배포되어야 합니다.
- 파생본에도 동일한 OFL 1.1이 적용됩니다.
- 예약 폰트 이름("Pretendard")을 파생본에 사용할 수 없습니다 — 위 조치의 근거.
