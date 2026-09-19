"""Standalone Executable Builder for SIGIL Reader on Windows.

Builds a single-file portable SigilReader.exe using PyInstaller.
Embeds:
- Windows Anti-Screen-Capture DRM (SetWindowDisplayAffinity)
- Automatic background daemon sidecar management
- Clean standalone Edge/Chromium App-Mode viewer window
"""

import os
import sys
import subprocess
import shutil

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_DIR = os.path.join(REPO_ROOT, "desktop", "dist")


def build_sigil_reader():
    print("=" * 60)
    print("[*] Building SIGIL Reader Portable Windows Executable...")
    print("=" * 60)

    # 1. Ensure viewer frontend is built
    viewer_dist = os.path.join(REPO_ROOT, "recipient_client", "viewer", "dist")
    if not os.path.exists(viewer_dist):
        print("[*] Building React viewer frontend first...")
        subprocess.run(["npm", "run", "build"], cwd=os.path.join(REPO_ROOT, "recipient_client", "viewer"), check=True, shell=True)

    # 2. Run PyInstaller
    launcher_script = os.path.join(REPO_ROOT, "desktop", "sigil_reader.py")
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name", "SigilReader",
        "--distpath", OUTPUT_DIR,
        "--workpath", os.path.join(REPO_ROOT, "desktop", "build"),
        "--specpath", os.path.join(REPO_ROOT, "desktop"),
        launcher_script
    ]

    print(f"[*] Executing PyInstaller: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=REPO_ROOT, check=True)

    exe_path = os.path.join(OUTPUT_DIR, "SigilReader", "SigilReader.exe")
    if os.path.exists(exe_path):
        print("\n" + "=" * 60)
        print(f"[SUCCESS] Standalone Windows executable built successfully!")
        print(f"[+] Output: {exe_path}")
        print("=" * 60)
        return exe_path
    else:
        raise RuntimeError(f"Build completed but {exe_path} not found.")


if __name__ == "__main__":
    build_sigil_reader()
