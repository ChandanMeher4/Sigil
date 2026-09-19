//! Windows DRM Anti-Screen-Capture Module
//! Uses SetWindowDisplayAffinity to exclude the window from screen recording tools.

#[cfg(target_os = "windows")]
pub fn enable_capture_protection(window: &tauri::Window) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    if let Ok(hwnd) = window.hwnd() {
        let win_hwnd = HWND(hwnd.0 as isize);
        unsafe {
            let _ = SetWindowDisplayAffinity(win_hwnd, WDA_EXCLUDEFROMCAPTURE);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn enable_capture_protection(_window: &tauri::Window) {
    // Non-Windows stub
}
