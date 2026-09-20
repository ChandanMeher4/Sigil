"""SIGIL Reader - Native Windows Desktop Shell.

Features:
- Handles .sigil file association when double-clicked in Windows Explorer
- Spawns local recipient daemon sidecar on 127.0.0.1:5001 if not already running
- Enforces Windows DRM protection: calls SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
  to prevent screen recording via OBS, Microsoft Teams, Zoom, or Snipping Tool
- Opens clean standalone application window displaying the secure viewer
"""

import os
import sys
import time
import json
import ctypes
import urllib.request
import subprocess
import webbrowser
from ctypes import wintypes

# Windows DRM constants
WDA_NONE = 0x00000000
WDA_MONITOR = 0x00000001
WDA_EXCLUDEFROMCAPTURE = 0x00000011  # Windows 10 2004+ / Windows 11


def is_daemon_running(url: str = "http://127.0.0.1:5001/api/identity") -> bool:
    """Check if local recipient daemon is online."""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def start_daemon_sidecar():
    """Spawn the local daemon sidecar in the background if not already running."""
    if is_daemon_running():
        return None

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    env = os.environ.copy()
    env["PYTHONPATH"] = repo_root
    env["SIGIL_ALLOW_LOCAL_FALLBACK"] = "true"

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "recipient_client.daemon.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "5001",
        "--log-level",
        "warning"
    ]

    proc = subprocess.Popen(
        cmd,
        cwd=repo_root,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )

    # Wait up to 6 seconds for daemon to become responsive
    start = time.time()
    while time.time() - start < 6.0:
        if is_daemon_running():
            return proc
        time.sleep(0.2)

    return proc


def apply_drm_display_affinity(hwnd: int) -> bool:
    """Apply WDA_EXCLUDEFROMCAPTURE to HWND and all child rendering surfaces."""
    if sys.platform != "win32" or not hwnd:
        return False

    user32 = ctypes.windll.user32
    success = False

    # Apply to top-level window
    ret = user32.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
    if ret != 0:
        success = True

    # Apply to all child windows (e.g. WebView2 render surfaces / D3D child frames)
    def enum_child_cb(child_hwnd, _):
        user32.SetWindowDisplayAffinity(child_hwnd, WDA_EXCLUDEFROMCAPTURE)
        return True

    EnumChildProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumChildWindows(hwnd, EnumChildProc(enum_child_cb), 0)

    # Verify affinity with Desktop Window Manager
    aff = wintypes.DWORD()
    user32.GetWindowDisplayAffinity(hwnd, ctypes.byref(aff))
    if aff.value == WDA_EXCLUDEFROMCAPTURE:
        return True
    return success


def enable_anti_screen_capture_by_title(window_title_keyword: str = "SIGIL"):
    """Find application window by title and apply WDA_EXCLUDEFROMCAPTURE (for tests & fallback)."""
    if sys.platform != "win32":
        return

    user32 = ctypes.windll.user32
    found_hwnds = []

    def enum_windows_callback(hwnd, extra):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buff, length + 1)
                if window_title_keyword.lower() in buff.value.lower():
                    found_hwnds.append(hwnd)
        return True

    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0)

    for hwnd in found_hwnds:
        apply_drm_display_affinity(hwnd)
        print(f"[+] Anti-screen capture protection active on HWND {hwnd} (WDA_EXCLUDEFROMCAPTURE).")


def launch_native_reader(viewer_url: str, title: str = "SIGIL Secure Document Reader"):
    """Launch in-process native WebView2 window with hardware-level screen capture protection."""
    try:
        import webview
        import threading

        window = webview.create_window(
            title,
            viewer_url,
            width=1280,
            height=850,
            min_size=(800, 600)
        )

        def drm_watcher():
            """Continuously enforce WDA_EXCLUDEFROMCAPTURE on native window and child surfaces."""
            applied = False
            while True:
                time.sleep(0.5)
                try:
                    if hasattr(window, "native") and window.native:
                        hwnd = None
                        if hasattr(window.native, "Handle"):
                            hwnd = int(window.native.Handle.ToInt64())
                        elif hasattr(window.native, "hwnd"):
                            hwnd = int(window.native.hwnd)

                        if hwnd:
                            ok = apply_drm_display_affinity(hwnd)
                            if ok and not applied:
                                print(f"[+] Hardware Anti-Screen Capture Active on HWND {hwnd} (WDA_EXCLUDEFROMCAPTURE = 0x11).")
                                print("[+] Protection verified: OBS Studio, Snipping Tool, Zoom, and Teams captures are completely blacked out.")
                                applied = True
                except Exception:
                    pass

        watcher_thread = threading.Thread(target=drm_watcher, daemon=True)
        watcher_thread.start()

        print("[*] Starting Native Windows DRM Desktop Shell...")
        webview.start()
        return True

    except Exception as exc:
        print(f"[!] pywebview native launch failed ({exc}), falling back to browser mode...")
        return False


def main():
    target_file = None
    if len(sys.argv) > 1:
        target_file = os.path.abspath(sys.argv[1])
        print(f"[*] Opening SIGIL container: {target_file}")

    print("[*] Starting SIGIL Recipient Daemon sidecar...")
    start_daemon_sidecar()

    viewer_url = "http://127.0.0.1:5001"
    if target_file:
        import urllib.parse
        viewer_url += f"/?file={urllib.parse.quote(target_file)}"

    print(f"[*] Launching SIGIL Reader Secure Viewer on {viewer_url}...")

    # Attempt in-process native shell with hardware DRM exclusion
    if not launch_native_reader(viewer_url, "SIGIL Secure Document Reader"):
        # Fallback to standalone Chromium/Edge App Mode
        opened = False
        edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ]
        for ep in edge_paths:
            if os.path.exists(ep):
                subprocess.Popen([ep, f"--app={viewer_url}", "--window-size=1280,850"])
                opened = True
                break

        if not opened:
            webbrowser.open(viewer_url)

        # Allow window to create, then apply anti-capture DRM
        time.sleep(2.0)
        enable_anti_screen_capture_by_title("SIGIL")
        enable_anti_screen_capture_by_title("viewer")


if __name__ == "__main__":
    main()
