"""Pretendard 서브셋 woff2 생성기 — 자체 호스팅용 (DESIGN.md §2)

왜 서브셋인가
    Pretendard 원본 OTF는 웨이트당 1MB를 넘습니다. 전체를 그대로 실으면 초기 로딩
    예산(3초)을 폰트 하나가 다 씁니다. 화면에 실제로 쓰이는 글자만 남깁니다.

왜 CDN이 아닌가
    외부 요청 0건 원칙(C1)과 "심사자가 별도 키 없이 확인"(요강) 정합. 폰트 CDN은
    네트워크 탭에 요청을 남기고, CDN 장애가 곧 화면 깨짐이 됩니다.

서브셋 범위
    KS X 1001 완성형 한글 2,350자 + Latin(ASCII) + 라틴 확장 일부 + 숫자·기호.
    한자는 넣지 않습니다 — Pretendard에 한자 글리프가 없어 tofu가 됩니다
    (DESIGN.md §2). UI 문자열에 한자를 쓰지 않는 규칙과 짝을 이룹니다.

왜 폰트 이름을 바꾸는가 (중요 — 라이선스 준수)
    SIL OFL 1.1 §3과 공식 OFL FAQ 2.6은 **"웹폰트 서브셋은 수정본(Modified Version)"**
    이며, 수정본에는 **예약 폰트 이름(RFN, 여기서는 'Pretendard') 사용이 통상
    허용되지 않는다**고 명시합니다. FAQ 2.7~2.8의 예외(기능적 동등성)는 "동일한 전체
    문자 인벤토리 유지"를 요구하므로, 글리프를 덜어낸 이 서브셋은 예외에 해당하지
    않습니다.

    따라서 서브셋 산출물의 name 테이블 패밀리명을 ``RF Sans``로 변경합니다.
    글자 모양(아웃라인)은 원본과 동일하므로 기획서 PDF와 화면의 시각 일관성은
    유지되고, RFN 조항은 위반하지 않습니다. 저작권 표기(nameID 0)와 라이선스
    표기(nameID 13·14)는 OFL §1 요구대로 **그대로 보존**합니다.

실행
    python dev/fonts/subset_pretendard.py
    (fontTools + brotli 필요 — requirements.txt)
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# 원본 OTF 탐색 경로 — 시스템 설치본을 우선 사용한다.
SOURCE_DIRS = [
    Path("C:/Windows/Fonts"),
    Path.home() / "AppData/Local/Microsoft/Windows/Fonts",
]

# 생성할 웨이트 — DESIGN.md §2 타이포 표가 쓰는 굵기만 (400/600/700)
WEIGHTS = {
    "Regular": 400,
    "SemiBold": 600,
    "Bold": 700,
}

OUT_DIR = Path(__file__).resolve().parents[2] / "public" / "fonts"

# 서브셋 산출물의 패밀리명 — RFN('Pretendard') 회피용 (모듈 docstring 참조)
SUBSET_FAMILY = "RF Sans"


def ks_x_1001_hangul() -> str:
    """KS X 1001 완성형 한글 2,350자.

    주의: Python의 ``euc_kr`` 코덱은 CP949(확장 완성형, 11,172자)까지 인코딩합니다.
    그대로 쓰면 서브셋이 5배로 불어나므로, **EUC-KR 한글 영역의 선행 바이트
    0xB0~0xC8** 범위만 남겨 KS X 1001 본래의 2,350자로 좁힙니다.
    """
    syllables = []
    for code in range(0xAC00, 0xD7A4):
        ch = chr(code)
        try:
            encoded = ch.encode("euc_kr")
        except UnicodeEncodeError:
            continue
        if len(encoded) == 2 and 0xB0 <= encoded[0] <= 0xC8:
            syllables.append(ch)
    return "".join(syllables)


def subset_text() -> str:
    """서브셋에 남길 문자 집합."""
    parts = [
        ks_x_1001_hangul(),
        "".join(chr(c) for c in range(0x0020, 0x007F)),  # ASCII 출력 가능 문자
        "".join(chr(c) for c in range(0x00A0, 0x0100)),  # Latin-1 보충 (°, ±, ×)
        "─│┌┐└┘·…‘’“”—–※→←↑↓△▽○●■□★☆",  # 본문·표에서 쓰는 기호
        "₩€£¥",
    ]
    return "".join(parts)


def find_source(weight_name: str) -> Path:
    filename = f"Pretendard-{weight_name}.otf"
    for directory in SOURCE_DIRS:
        candidate = directory / filename
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"{filename}을 찾지 못했습니다. Pretendard(SIL OFL 1.1)를 설치한 뒤 재실행하세요: "
        "https://github.com/orioncactus/pretendard"
    )


def rename_family(font: TTFont, weight_name: str) -> None:
    """name 테이블의 패밀리·풀네임·PostScript명을 RFN이 아닌 이름으로 교체한다.

    nameID 0(저작권)·13(라이선스)·14(라이선스 URL)은 건드리지 않는다 — OFL §1이
    저작권·라이선스 고지 보존을 요구하기 때문이다.
    """
    full_name = f"{SUBSET_FAMILY} {weight_name}"
    ps_name = f"{SUBSET_FAMILY.replace(' ', '')}-{weight_name}"
    replacements = {
        1: SUBSET_FAMILY,   # Font Family
        2: weight_name,     # Font Subfamily
        3: f"{full_name}; subset of Pretendard (SIL OFL 1.1)",  # Unique ID
        4: full_name,       # Full name
        6: ps_name,         # PostScript name
        16: SUBSET_FAMILY,  # Typographic Family
        17: weight_name,    # Typographic Subfamily
    }

    name_table = font["name"]
    for record in list(name_table.names):
        value = replacements.get(record.nameID)
        if value is not None:
            name_table.setName(
                value, record.nameID, record.platformID, record.platEncID, record.langID
            )


def build(weight_name: str, weight_value: int, text: str) -> None:
    src = find_source(weight_name)
    # 파일명에도 RFN을 쓰지 않는다 — 수정본이 예약 이름을 표방하지 않게 한다.
    out = OUT_DIR / f"RFSans-{weight_value}.subset.woff2"

    font = TTFont(str(src))
    options = subset.Options()
    options.flavor = "woff2"
    options.desubroutinize = True
    options.layout_features = ["kern", "liga", "calt"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    rename_family(font, weight_name)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(str(out))
    font.close()

    size_kb = out.stat().st_size / 1024
    print(f"  {out.name:<32} {size_kb:7.1f} KB  <- {src.name}")


def main() -> int:
    # Windows 콘솔 기본 코덱(cp949)이 em dash 등을 못 찍어 죽는 것을 막는다.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    text = subset_text()
    print(f"서브셋 문자 수: {len(set(text)):,}자")
    for name, value in WEIGHTS.items():
        build(name, value, text)
    print(f"\n패밀리명: '{SUBSET_FAMILY}' (RFN 'Pretendard' 회피 — OFL FAQ 2.6)")
    print("라이선스: SIL Open Font License 1.1 — public/fonts/OFL.txt 동봉 필수")
    return 0


if __name__ == "__main__":
    sys.exit(main())
