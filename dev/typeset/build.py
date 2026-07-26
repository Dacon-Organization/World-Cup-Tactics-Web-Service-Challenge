#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기획서 조판 빌드 — 원고 16절 md → 단일 PDF (pandoc + XeLaTeX + Pretendard).

파이프라인:
  1) 원고 01~16절 로드 (인덱스·검수기록은 제외)
  2) 한자 병기 제거·한글 인라인 코드 백틱 해제 (Pretendard tofu 방지)
  3) mermaid 코드블록 → mmdc 렌더(PNG) → 흰 여백 트림 → 이미지 참조로 치환
  4) 렌더 그림(dev/typeset/figures/*.png)을 빌드 폴더로 복사하고 경로 정규화
  5) 결합 → pandoc → PDF

실행: 워크트리 루트에서  `python dev/typeset/build.py`
      (그림이 없거나 갱신이 필요하면 `python dev/typeset/make_figures.py` 먼저)
필요 도구: pandoc, xelatex(MiKTeX/TeX Live), mmdc(@mermaid-js/mermaid-cli), Pretendard 폰트
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # 워크트리 루트
SRC = ROOT / "docs/planning/proposal/version2.0"
TS = ROOT / "dev/typeset"
ASSETS = TS / "figures"       # make_figures.py 산출 — 저장소 추적
BUILD = TS / "build"          # 중간 산출물 — .gitignore(build/)
FIGS = BUILD / "figures"
OUT = TS / "pdf"              # 최종 PDF — 저장소 추적(제출물)

# 원고가 쓰는 저장소 상대 경로 (GitHub에서도 그림이 보이게 하기 위한 형태)
ASSET_PREFIX = "../../../../dev/typeset/figures/"

MMDC = shutil.which("mmdc") or "mmdc"
PANDOC = shutil.which("pandoc") or "pandoc"


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def strip_hanja_gloss(md: str) -> str:
    """'한글(漢字)' 형태의 보조 한자 병기 제거 — Pretendard 미수록 한자의 tofu 방지."""
    return re.sub(r'([가-힣])\(([一-鿿]{1,6})\)', r'\1', md)


def unwrap_korean_code(md: str) -> str:
    """한글이 든 인라인 코드는 백틱을 벗겨 본문 폰트로 렌더(tofu 방지).
    순수 영문 코드경로(`results.csv` 등)는 monofont 유지."""
    def repl(m):
        inner = m.group(1)
        return inner if re.search(r'[가-힣]', inner) else m.group(0)
    return re.sub(r'`([^`\n]+)`', repl, md)


def korean_quotes(md: str) -> str:
    """짝지은 큰따옴표를 한국어 낫표(「 」)로 변환.

    xeCJK는 “ ”를 CJK 구두점으로 분류해 인접 공백을 삼키므로, 서양식 따옴표를 그대로
    쓰면 '…이다."그런데'처럼 붙어 버린다. 낫표는 자체 좌우 여백을 가진 CJK 구두점이라
    공백 없이도 정상적으로 읽힌다(한국어 조판 관행에도 맞는다).
    mermaid 코드블록이 이미지로 치환된 뒤에 호출해야 한다 — 노드 라벨의 따옴표를
    건드리지 않기 위해서다.
    """
    out, opening = [], True
    for ch in md:
        if ch == '"':
            out.append("「" if opening else "」")
            opening = not opening
        else:
            out.append(ch)
    if not opening:
        print("경고: 짝이 맞지 않는 큰따옴표가 있습니다", file=sys.stderr)
    return "".join(out)


def trim_png(path: Path, pad: int = 12) -> None:
    """흰 여백 트림 — mermaid journey는 실제 그림보다 캔버스를 크게 잡는다."""
    try:
        from PIL import Image, ImageChops
    except ImportError:
        return
    im = Image.open(path).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bbox = ImageChops.difference(im, bg).getbbox()
    if not bbox:
        return
    l, t, r, b = bbox
    box = (max(0, l - pad), max(0, t - pad),
           min(im.width, r + pad), min(im.height, b + pad))
    im.crop(box).save(path)


def mermaid_width(code: str) -> str:
    """다이어그램 종류별 조판 폭 — 가로형은 지면을 다 쓰고 정사각형은 줄인다."""
    head = code.lstrip().split("\n", 1)[0]
    if head.startswith("quadrantChart"):
        return "64%"
    return "100%"


def render_mermaid(code: str, key: str) -> Path:
    FIGS.mkdir(parents=True, exist_ok=True)
    mmd = FIGS / f"{key}.mmd"
    png = FIGS / f"{key}.png"
    mmd.write_text(code, encoding="utf-8")
    sh([MMDC, "-i", str(mmd), "-o", str(png),
        "-p", str(TS / "puppeteer-config.json"),
        "-c", str(TS / "mermaid-config.json"),
        "-b", "white", "-s", "3"])
    trim_png(png)
    return png


def sub_mermaid(md: str, section_key: str) -> str:
    counter = [0]

    def repl(m):
        counter[0] += 1
        code = m.group(1)
        png = render_mermaid(code, f"{section_key}_mmd{counter[0]}")
        rel = os.path.relpath(png, BUILD).replace("\\", "/")
        return f'\n![](./{rel}){{width={mermaid_width(code)}}}\n'

    return re.sub(r'```mermaid\n(.*?)\n```', repl, md, flags=re.S)


def copy_assets() -> None:
    """make_figures.py 산출물을 빌드 폴더로 복사."""
    if not ASSETS.exists():
        sys.exit("figures/ 가 없습니다 — 먼저 `python dev/typeset/make_figures.py` 를 실행하세요.")
    FIGS.mkdir(parents=True, exist_ok=True)
    for p in sorted(ASSETS.glob("*.png")):
        shutil.copy(p, FIGS / p.name)


def fix_asset_paths(md: str) -> str:
    """원고의 저장소 상대 경로 → 빌드 폴더 기준 경로."""
    return md.replace(ASSET_PREFIX, "./figures/")


def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    copy_assets()

    files = sorted(p for p in SRC.glob("[0-1][0-9]_*.md"))
    if len(files) != 16:
        print(f"경고: 원고 파일 {len(files)}개 (16개 기대)", file=sys.stderr)

    parts = []
    for f in files:
        key = f.stem.split("_")[0]           # '01' ..
        md = f.read_text(encoding="utf-8")
        md = strip_hanja_gloss(md)
        md = fix_asset_paths(md)
        md = sub_mermaid(md, key)
        md = korean_quotes(md)
        md = unwrap_korean_code(md)
        parts.append(md.strip())
        if key == "01":                      # 표지·목차 뒤에서 페이지 분리
            parts.append(r"\newpage")

    combined = "\n\n".join(parts) + "\n"
    combined_md = BUILD / "combined.md"
    combined_md.write_text(combined, encoding="utf-8")
    print(f"결합 md: {combined_md}  ({len(combined.splitlines())}행)")

    out_pdf = OUT / "기획서_REFORMATION_v2.0.pdf"
    cmd = [
        PANDOC, str(combined_md), "-o", str(out_pdf),
        "--pdf-engine=xelatex",
        "-H", str(TS / "preamble.tex"),
        "-V", "documentclass=article",
        "-V", "geometry:a4paper",
        "-V", "geometry:margin=2.1cm",
        "-V", "mainfont=Pretendard",
        "-V", "CJKmainfont=Pretendard",
        "-V", "monofont=Consolas",
        "-V", "fontsize=10pt",
        "-V", "linkcolor=accent", "-V", "urlcolor=accent",
        "-V", "lang=ko",
        "--wrap=preserve",
    ]
    print("pandoc 실행 …")
    sh(cmd, cwd=str(BUILD))
    print(f"완료: {out_pdf}  ({out_pdf.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
