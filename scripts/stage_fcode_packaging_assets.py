#!/usr/bin/env python3
"""Stage web-ui-v2 bundle and tray binary into vendor target directories."""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_WEB_UI_SRC = REPO_ROOT / "codex-rs" / "web-ui-v2"
DEFAULT_WEB_UI_BUILD_SCRIPT = REPO_ROOT / "scripts" / "build_fcode_web_ui_v2_bundle.py"
DEFAULT_TRAY_EXE = (
    REPO_ROOT / "codex-rs" / "web-ui" / "fcode-server" / "bin" / "Release" / "fcode-server.exe"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--vendor-src",
        type=Path,
        required=True,
        help="Vendor root directory that contains per-target directories.",
    )
    parser.add_argument(
        "--web-ui-src",
        type=Path,
        default=Path(os.environ.get("FCODE_WEB_UI_V2_BUNDLE_DIR", DEFAULT_WEB_UI_SRC)),
        help="Built web-ui-v2 directory to stage into each target vendor dir.",
    )
    parser.add_argument(
        "--build-web-ui-if-missing",
        action="store_true",
        help="Build standalone web-ui-v2 bundle automatically when source is not prebuilt.",
    )
    parser.add_argument(
        "--web-ui-build-script",
        type=Path,
        default=DEFAULT_WEB_UI_BUILD_SCRIPT,
        help="Builder script for producing standalone web-ui-v2 bundle.",
    )
    parser.add_argument(
        "--tray-exe",
        type=Path,
        default=Path(os.environ.get("FCODE_TRAY_EXE_PATH", DEFAULT_TRAY_EXE)),
        help="Windows tray executable path.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    vendor_src = args.vendor_src.resolve()
    web_ui_src = args.web_ui_src.resolve()
    tray_exe = args.tray_exe.resolve()

    if not vendor_src.is_dir():
        raise RuntimeError(f"vendor src not found: {vendor_src}")
    if not web_ui_src.is_dir() and args.build_web_ui_if_missing:
        build_script = args.web_ui_build_script.resolve()
        run_command(["python", str(build_script)])
        web_ui_src = Path(
            os.environ.get(
                "FCODE_WEB_UI_V2_BUNDLE_DIR",
                str(REPO_ROOT / "codex-rs" / "web-ui-v2" / ".dist-fcode-web-ui-v2"),
            )
        ).resolve()

    if not web_ui_src.is_dir():
        raise RuntimeError(f"web-ui-v2 source not found: {web_ui_src}")

    for target_dir in sorted(p for p in vendor_src.iterdir() if p.is_dir()):
        stage_web_ui(target_dir, web_ui_src)
        if "windows" in target_dir.name:
            stage_tray(target_dir, tray_exe)

    print(f"Staged web-ui-v2/tray assets into {vendor_src}")
    return 0


def stage_web_ui(target_dir: Path, web_ui_src: Path) -> None:
    web_ui_dest = target_dir / "web-ui-v2"
    if web_ui_dest.exists():
        shutil.rmtree(web_ui_dest)
    shutil.copytree(web_ui_src, web_ui_dest)


def stage_tray(target_dir: Path, tray_exe: Path) -> None:
    tray_dest_dir = target_dir / "fcode-tray"
    existing_tray = tray_dest_dir / "fcode-server.exe"
    if existing_tray.is_file():
        return
    if not tray_exe.is_file():
        print(
            f"Skip tray stage for {target_dir.name}: tray exe missing and no preinstalled tray in vendor",
            flush=True,
        )
        return
    tray_dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tray_exe, existing_tray)


def run_command(cmd: list[str]) -> None:
    import subprocess

    print("+", " ".join(cmd))
    subprocess.run(cmd, cwd=REPO_ROOT, check=True)


if __name__ == "__main__":
    raise SystemExit(main())
