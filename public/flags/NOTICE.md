# 국기 아이콘 고지 (flag-icons · MIT)

이 폴더의 SVG 4종은 [lipis/flag-icons](https://github.com/lipis/flag-icons)의 `flags/4x3/`
파일을 **무수정 복사**한 것입니다. 원본과 바이트 단위로 동일합니다.

| 파일 | 표기 대상 | 원본 경로 | 크기 |
|---|---|---|---|
| `kr.svg` | 대한민국 | `flags/4x3/kr.svg` | 1,061 B |
| `cz.svg` | 체코 | `flags/4x3/cz.svg` | 225 B |
| `mx.svg` | 멕시코 | `flags/4x3/mx.svg` | 84,753 B |
| `za.svg` | 남아프리카공화국 | `flags/4x3/za.svg` | 860 B |

## 왜 npm 패키지를 쓰지 않았는가

`flag-icons@7.5.0`은 unpacked **4.13 MB**(약 260개국 SVG + 전 국기 CSS 클래스)입니다.
우리가 쓰는 국가는 4개뿐이고, 패키지의 CSS는 쓰지 않는 256개국 클래스를 함께 싣습니다.
**필요한 4개 파일만 복사**하는 쪽이 배포물에 들어가는 바이트와 라이선스 표면을 모두
줄입니다. 실측 근거: [리서치 P20](../../docs/research/findings/P20-리플레이UI패턴.md).

`<img src="/flags/…">` 참조이므로 이 파일들은 **JS 번들에 들어가지 않고**, 국기를 쓰는
화면(`/replay`)에서만 요청됩니다. 메인 화면(S1)의 예산에 영향을 주지 않습니다.

## 표기 관련 확인 사항

- **파일을 수정하지 않습니다.** 국기의 색·비율·문양을 바꾸는 것은 「대한민국국기법」
  제11조 제2항의 훼손 금지와 각국 규정에 저촉될 수 있습니다. 확대·축소만 합니다.
- 국기 표시 자체의 적법성은 [리서치 P16](../../docs/research/findings/P16-국기법엠블럼아이콘.md)에서
  확인했습니다 — 국기법 제11조 제1항 "국기 또는 국기문양은 각종 물품과 의식 등에 활용할
  수 있다", 벌칙 조항 없음. 우리는 식별 목적의 정상 표시입니다.
- **팀 엠블럼·협회 로고·FIFA 대회 워드마크는 사용하지 않습니다** (P7 — 상표권).
  국기는 국가 표기이지 팀 상징이 아닙니다.

---

## 원본 라이선스 전문 (MIT)

```
The MIT License (MIT)

Copyright (c) 2013 Panayiotis Lipiridis

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
