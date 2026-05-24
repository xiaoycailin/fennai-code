#!/usr/bin/env python3
"""Build standalone web-ui-v2 bundle for fcode packaging."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_UI_ROOT = REPO_ROOT / "codex-rs" / "web-ui-v2"
DIST_ROOT = WEB_UI_ROOT / ".dist-fcode-web-ui-v2"
STANDALONE_ROOT = WEB_UI_ROOT / ".next-v2" / "standalone"
STATIC_ROOT = WEB_UI_ROOT / ".next-v2" / "static"
PUBLIC_ROOT = WEB_UI_ROOT / "public"


def main() -> int:
    run(["pnpm", "install", "--frozen-lockfile"], cwd=WEB_UI_ROOT)
    run(["pnpm", "run", "build"], cwd=WEB_UI_ROOT)

    if not STANDALONE_ROOT.is_dir():
        raise RuntimeError(f"standalone output not found: {STANDALONE_ROOT}")

    if DIST_ROOT.exists():
        shutil.rmtree(DIST_ROOT)
    DIST_ROOT.mkdir(parents=True, exist_ok=True)

    copy_tree(STANDALONE_ROOT, DIST_ROOT)
    copy_tree(STATIC_ROOT, DIST_ROOT / ".next-v2" / "static")
    copy_tree(PUBLIC_ROOT, DIST_ROOT / "public")

    print(f"Built fcode web-ui-v2 bundle: {DIST_ROOT}")
    return 0


def run(cmd: list[str], *, cwd: Path) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


if __name__ == "__main__":
    raise SystemExit(main())
