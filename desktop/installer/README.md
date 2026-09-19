# SIGIL Secure DRM Reader - Enterprise Windows Deployment Guide

This guide documents silent, automated, and interactive installation procedures for deploying **SIGIL Secure DRM Reader** across enterprise and defense workstations.

---

## 1. Distribution Artifacts

The packaging pipeline produces the following enterprise delivery formats:

| File | Type | Target Audience | Deployment Method |
| :--- | :--- | :--- | :--- |
| `SigilReader-v1.0.0-Windows-x64.zip` | Enterprise Archive | SysAdmins / IT Teams | Unzip & execute `Deploy-SigilReader.ps1` |
| `Deploy-SigilReader.ps1` | PowerShell Script | Intune / SCCM / GPO | Silent automated deployment script |
| `SigilReaderSetup.iss` | Inno Setup Script | Build Servers / CI-CD | Compiles into `SigilReaderSetup.exe` wizard |
| `SigilReader.wxs` | WiX Toolset Schema | Windows Installer | Compiles into `SigilReader.msi` |
| `register_file_association.bat` | Batch Script | Individual Users | Double-click registry registration |

---

## 2. Microsoft Intune & SCCM Silent Fleet Deployment

### Installation Command
To deploy silently across thousands of workstations via Microsoft Intune or SCCM:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\Deploy-SigilReader.ps1
```

### Detection Rule (Intune)
* **Rule Type**: File
* **Path**: `C:\Program Files\SIGIL\SigilReader`
* **File or folder**: `SigilReader.exe`
* **Property**: String (version)
* **Operator**: Greater than or equal to `1.0.0.0`

### Registry Verification
The script automatically provisions:
* `HKLM:\SOFTWARE\Classes\.sigil` (Default: `SigilDocument`)
* `HKLM:\SOFTWARE\Classes\SigilDocument\shell\open\command` (`"C:\Program Files\SIGIL\SigilReader\SigilReader.exe" "%1"`)
* `HKLM:\SOFTWARE\Classes\SigilDocument\DefaultIcon`

### Silent Uninstallation Command
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\Deploy-SigilReader.ps1 -Uninstall
```

---

## 3. Inno Setup Executable (`SigilReaderSetup.exe`)

Once compiled on a CI/CD build machine with `iscc`:

### Silent Install
```cmd
SigilReaderSetup-v1.0.0-x64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /ALLUSERS
```

### Interactive Install
Double-click `SigilReaderSetup-v1.0.0-x64.exe` to follow the standard modern installation wizard.

---

## 4. Native Hardware DRM & Security Notes

* **Screen Capture Shield**: The reader invokes `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE = 0x11)` via Windows `user32.dll`. Screen recording tools (OBS Studio, Snipping Tool, Zoom, Microsoft Teams screen share) capture an opaque black window.
* **Passphrase Protection**: Recipient private keys are encrypted on disk with PBKDF2-HMAC-SHA256 (100,000 rounds) + AES-256-GCM.
* **Double-Click Experience**: Once installed, double-clicking any `.sigil` encrypted file in Windows Explorer immediately launches `SigilReader` and prompts for the officer's passphrase to decrypt and render the watermarked document.
