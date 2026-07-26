#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기획서 조판 빌드 — 원고 16절 md → 단일 PDF (pandoc + XeLaTeX + Pretendard).

파이프라인:
  1) 원고 01~16절 로드(원고_인덱스는 제외)
  2) 전처리: 검수 메모 섹션·분량 blockquote 제거, 한글 인라인 코드 백틱 해제
  3) mermaid 코드블록 → mmdc 렌더(PNG) → 이미지 참조로 치환
  4) [조판:] 태그 처리 — Elo 궤적 그림은 실제 삽입, mermaid 지시는 제거,
     순수 디자인 그래픽은 회색 '그래픽 자리' 안내로 변환
  5) 결합 → pandoc → PDF

실행: 워크트리 루트에서  `python dev/typeset/build.py`
필요 도구: pandoc, xelatex(MiKTeX/TeX Live), mmdc(@mermaid-js/mermaid-cli), Pretendard 폰트
"""
import os, re, sys, shutil, subprocess, glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # 워크트리 루트
SRC  = ROOT / "docs/planning/proposal/version1.0"
TS   = ROOT / "dev/typeset"
BUILD = TS / "build"          # 중간 산출물(combined.md·mermaid png) — .gitignore(build/)
FIGS  = BUILD / "figures"
OUT   = TS / "pdf"            # 최종 PDF — 저장소 추적(제출물)
ELO_TRAJ = ROOT / "notebooks/figures/02_elo_trajectories.png"

MMDC = shutil.which("mmdc") or "mmdc"
PANDOC = shutil.which("pandoc") or "pandoc"

def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)

def clean_body(md: str) -> str:
    """검수 메모 이후 절단 + 분량 blockquote 제거 + 꼬리 구분선 정리."""
    md = md.split("## 검수 메모")[0]
    # 상단 '> 분량 목표: ...' blockquote 한 줄 제거
    md = re.sub(r'^> *분량 목표:.*\n', '', md, flags=re.M)
    # 절 상단의 첫 '---'(메타와 본문 사이 구분선) 및 꼬리 구분선 제거
    md = re.sub(r'\n---\n', '\n\n', md)
    return md.rstrip() + "\n"

def strip_hanja_gloss(md: str) -> str:
    """'한글(漢字)' 형태의 보조 한자 병기를 제거해 tofu 방지.
    Pretendard는 상용 한자 일부만 포함하므로 병기 한자를 정리한다(의미는 한글로 충분)."""
    return re.sub(r'([가-힣])\(([一-鿿]{1,6})\)', r'\1', md)

def unwrap_korean_code(md: str) -> str:
    """백틱 인라인 코드 중 한글을 포함한 것은 백틱을 벗겨 본문 폰트로 렌더(tofu 방지).
    순수 영문 코드경로(`results.csv` 등)는 monofont 유지."""
    def repl(m):
        inner = m.group(1)
        if re.search(r'[가-힣]', inner):
            return inner            # 한글 태그: 백틱 제거
        return m.group(0)           # 영문 코드: 유지
    return re.sub(r'`([^`\n]+)`', repl, md)

def render_mermaid(code: str, key: str) -> Path:
    """mermaid 코드 → PNG. 반환: build 기준 상대경로 이미지."""
    FIGS.mkdir(parents=True, exist_ok=True)
    mmd = FIGS / f"{key}.mmd"
    png = FIGS / f"{key}.png"
    mmd.write_text(code, encoding="utf-8")
    sh([MMDC, "-i", str(mmd), "-o", str(png),
        "-p", str(TS / "puppeteer-config.json"),
        "-c", str(TS / "mermaid-config.json"),
        "-b", "white", "-s", "3"])
    return png

def sub_mermaid(md: str, section_key: str) -> str:
    """```mermaid ...``` 블록을 렌더 이미지 참조로 치환."""
    counter = [0]
    def repl(m):
        counter[0] += 1
        code = m.group(1)
        key = f"{section_key}_mmd{counter[0]}"
        png = render_mermaid(code, key)
        rel = os.path.relpath(png, BUILD).replace("\\", "/")
        # 넓은 다이어그램은 본문 폭에 맞춤
        return f'\n![](./{rel}){{width=98%}}\n'
    return re.sub(r'```mermaid\n(.*?)\n```', repl, md, flags=re.S)

def sub_typeset_tags(md: str) -> str:
    """`[조판: ...]` 인라인 태그 처리."""
    def repl(m):
        body = m.group(1)
        low = body.replace("\n", " ")
        # 10절 Elo 궤적 — 실제 그림 삽입
        if "02_elo_trajectories" in low:
            dst = FIGS / "02_elo_trajectories.png"
            FIGS.mkdir(parents=True, exist_ok=True)
            shutil.copy(ELO_TRAJ, dst)
            cap = "전체 A매치로 산출한 자체 Elo — 감쇠 보정 없이 궤적이 연속. 체코(회색)만 1990년대 중반 1500에서 신설되어 승계 미연결 한계를 보여준다."
            return f'\n![{cap}](./figures/02_elo_trajectories.png){{width=92%}}\n'
        # mermaid를 가리키는 지시(이미 위에서 이미지 삽입됨) — 캡션만 남기고 지시 제거
        if "mermaid 렌더" in low or "위 mermaid" in low:
            cap = extract_caption(body)
            return f'\n<div class="figcap">{cap}</div>\n' if cap else "\n"
        summary = re.sub(r'^조판:\s*', '', body).strip()
        summary = re.sub(r'\s+', ' ', summary)
        # 그래픽 제작을 요구하는 태그만 자리표시로. 순수 조판 지시(표 배치·각주 변환 등)는 제거
        GRAPHIC_KW = ('그래픽', '다이어그램', '목업', '개념도', '포지셔닝', '맵', '차트',
                      '비주얼', '와이어프레임', '저니', '그리드', '아키텍처', '미니맵', '루프')
        if any(k in summary for k in GRAPHIC_KW):
            return ('\n> **[그래픽 자리]** ' + summary +
                    ' *(디자인 자산 제작 예정 — 본 조판본은 내용·다이어그램 우선)*\n')
        return '\n'   # 순수 조판 지시 → 제거
    # `[조판: ...]` (인라인 코드로 감싸진 다중행 포함)
    return re.sub(r'`\[조판:(.*?)\]`', repl, md, flags=re.S)

def extract_caption(tag_body: str) -> str:
    m = re.search(r'캡션\s*["“]([^"”]+)["”]', tag_body)
    return m.group(1).strip() if m else ""

def main():
    BUILD.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in SRC.glob("[0-1][0-9]_*.md"))
    if len(files) != 16:
        print(f"경고: 원고 파일 {len(files)}개 (16개 기대)", file=sys.stderr)

    parts = []
    for f in files:
        key = f.stem.split("_")[0]           # '01' ..
        md = f.read_text(encoding="utf-8")
        md = clean_body(md)
        md = strip_hanja_gloss(md)
        md = sub_mermaid(md, key)
        md = sub_typeset_tags(md)      # 백틱 있는 상태에서 조판 태그 먼저 처리
        md = unwrap_korean_code(md)    # 남은 한글 인라인 코드 백틱 해제
        parts.append(md.strip())
        # 표지(01) 뒤에서 페이지 분리
        if key == "01":
            parts.append(r"\newpage")

    combined = "\n\n".join(parts) + "\n"
    combined_md = BUILD / "combined.md"
    combined_md.write_text(combined, encoding="utf-8")
    print(f"결합 md: {combined_md}  ({len(combined.splitlines())}행)")

    out_pdf = OUT / "기획서_만약의감독_v1.0.pdf"
    cmd = [
        PANDOC, str(combined_md), "-o", str(out_pdf),
        "--pdf-engine=xelatex",
        "-H", str(TS / "preamble.tex"),
        "-V", "documentclass=article",
        "-V", "geometry:a4paper",
        "-V", "geometry:margin=2.2cm",
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
    size = out_pdf.stat().st_size
    print(f"완료: {out_pdf}  ({size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
