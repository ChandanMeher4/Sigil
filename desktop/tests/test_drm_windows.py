"""Integration test for Windows Native DRM Display Affinity.

Tests:
1. Validates Win32 API SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE).
2. Verifies GetWindowDisplayAffinity confirms 0x11 registration with Desktop Window Manager.
3. Tests enable_anti_screen_capture_by_title discovery and DRM application.
"""

import sys
import pytest

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows DRM tests require Windows OS")


def test_windows_drm_display_affinity():
    import tkinter as tk
    import ctypes
    from ctypes import wintypes
    from desktop.sigil_reader import WDA_EXCLUDEFROMCAPTURE, enable_anti_screen_capture_by_title

    user32 = ctypes.windll.user32

    # 1. Create a native test window
    root = tk.Tk()
    root.title("SIGIL_DRM_AUTOMATED_TEST_WINDOW")
    root.geometry("250x150")
    root.update()

    try:
        hwnd = user32.FindWindowW(None, "SIGIL_DRM_AUTOMATED_TEST_WINDOW")
        assert hwnd != 0, "Failed to create or locate test window HWND"

        # 2. Check initial display affinity (should be 0x0 / WDA_NONE)
        aff_initial = wintypes.DWORD()
        res_get = user32.GetWindowDisplayAffinity(hwnd, ctypes.byref(aff_initial))
        assert res_get != 0, "GetWindowDisplayAffinity failed"
        assert aff_initial.value == 0, f"Expected initial affinity 0x0, got {hex(aff_initial.value)}"

        # 3. Apply DRM protection via sigil_reader helper
        enable_anti_screen_capture_by_title("SIGIL_DRM_AUTOMATED_TEST_WINDOW")

        # 4. Assert that Desktop Window Manager now reports WDA_EXCLUDEFROMCAPTURE (0x11)
        aff_protected = wintypes.DWORD()
        res_check = user32.GetWindowDisplayAffinity(hwnd, ctypes.byref(aff_protected))
        assert res_check != 0, "GetWindowDisplayAffinity failed after protection"
        assert aff_protected.value == WDA_EXCLUDEFROMCAPTURE, (
            f"Expected WDA_EXCLUDEFROMCAPTURE (0x11), got {hex(aff_protected.value)}"
        )

    finally:
        root.destroy()


def test_apply_drm_display_affinity_direct():
    """Verify apply_drm_display_affinity directly protects HWND and children."""
    import tkinter as tk
    import ctypes
    from ctypes import wintypes
    from desktop.sigil_reader import WDA_EXCLUDEFROMCAPTURE, apply_drm_display_affinity

    user32 = ctypes.windll.user32
    root = tk.Tk()
    root.title("SIGIL_DRM_DIRECT_TEST")
    root.geometry("200x100")
    root.update()

    try:
        hwnd = user32.FindWindowW(None, "SIGIL_DRM_DIRECT_TEST")
        assert hwnd != 0
        ok = apply_drm_display_affinity(hwnd)
        assert ok is True

        aff = wintypes.DWORD()
        user32.GetWindowDisplayAffinity(hwnd, ctypes.byref(aff))
        assert aff.value == WDA_EXCLUDEFROMCAPTURE
    finally:
        root.destroy()
