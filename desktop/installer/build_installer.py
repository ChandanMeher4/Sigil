"""Enterprise Packaging & Installer Automation for SIGIL Secure DRM Reader.

Automates:
1. Binary and runtime packaging into a standalone enterprise distribution ZIP.
2. Inno Setup executable installer compilation (.iss -> SigilReaderSetup.exe) if ISCC is installed.
3. Intune / SCCM silent deployment package preparation.
"""

import os
import sys
import shutil
import zipfile
import subprocess

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIST_DIR = os.path.join(REPO_ROOT, "desktop", "dist")
READER_DIR = os.path.join(DIST_DIR, "SigilReader")
INSTALLER_DIR = os.path.join(REPO_ROOT, "desktop", "installer")


def build_enterprise_packages():
    print("=" * 75)
    print("[*] SIGIL Secure DRM Reader - Enterprise Packaging Automation")
    print("=" * 75)

    exe_path = os.path.join(READER_DIR, "SigilReader.exe")
    if not os.path.exists(exe_path):
        print("[!] SigilReader.exe not found. Building executable first via PyInstaller...")
        build_exe_script = os.path.join(REPO_ROOT, "desktop", "build_exe.py")
        subprocess.run([sys.executable, build_exe_script], cwd=REPO_ROOT, check=True)

    if not os.path.exists(exe_path):
        raise RuntimeError("SigilReader.exe was not created.")

    print(f"[+] Verified standalone binary: {exe_path} ({(os.path.getsize(exe_path)/1024/1024):.2f} MB)")

    # 1. Build Enterprise ZIP Distribution Archive
    version = "1.0.0"
    zip_filename = f"SigilReader-v{version}-Windows-x64.zip"
    zip_path = os.path.join(DIST_DIR, zip_filename)
    print(f"\n[*] Creating Enterprise Distribution Archive: {zip_path}")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Include SigilReader directory
        for root, _, files in os.walk(READER_DIR):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.join("SigilReader", os.path.relpath(full_path, READER_DIR))
                zf.write(full_path, rel_path)

        # Include Enterprise Silent Deployment Script
        ps1_script = os.path.join(INSTALLER_DIR, "Deploy-SigilReader.ps1")
        if os.path.exists(ps1_script):
            zf.write(ps1_script, "Deploy-SigilReader.ps1")

        # Include Standalone File Association Script
        bat_script = os.path.join(REPO_ROOT, "desktop", "register_file_association.bat")
        if os.path.exists(bat_script):
            zf.write(bat_script, "register_file_association.bat")

    print(f"[SUCCESS] Enterprise ZIP created: {zip_path} ({(os.path.getsize(zip_path)/1024/1024):.2f} MB)")

    # 2. Check for Inno Setup Compiler (ISCC)
    iscc_candidates = [
        shutil.which("iscc"),
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        r"C:\Program Files\Inno Setup 6\ISCC.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe")
    ]
    iscc_exe = next((c for c in iscc_candidates if c and os.path.exists(c)), None)

    iss_file = os.path.join(INSTALLER_DIR, "SigilReaderSetup.iss")
    if iscc_exe:
        print(f"\n[*] Compiling Inno Setup GUI/Silent Installer with {iscc_exe}...")
        try:
            subprocess.run([iscc_exe, iss_file], check=True)
            setup_exe = os.path.join(DIST_DIR, f"SigilReaderSetup-v{version}-x64.exe")
            if os.path.exists(setup_exe):
                print(f"[SUCCESS] Compiled Windows Installer: {setup_exe}")
        except Exception as e:
            print(f"[!] Warning during Inno Setup compilation: {e}")
    else:
        print("\n[i] Inno Setup 6 Compiler (ISCC.exe) not detected on local PATH.")
        print(f"    Inno Setup script ready at: {iss_file}")
        print("    Sysadmins can compile SigilReaderSetup.exe by running ISCC.exe on build servers.")

    # 3. Print Enterprise Deployment Guide
    print("\n" + "=" * 75)
    print("ENTERPRISE DEPLOYMENT COMMANDS (Intune / SCCM / GPO)")
    print("=" * 75)
    print("1. Silent PowerShell Fleet Deployment:")
    print('   powershell.exe -ExecutionPolicy Bypass -File .\\Deploy-SigilReader.ps1')
    print("\n2. Silent Uninstallation:")
    print('   powershell.exe -ExecutionPolicy Bypass -File .\\Deploy-SigilReader.ps1 -Uninstall')
    print("\n3. Inno Setup Silent Switch (once compiled):")
    print(f'   SigilReaderSetup-v{version}-x64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-')
    print("\n4. WiX Toolset MSI Silent Switch (once built):")
    print('   msiexec /i SigilReader.msi /qn ALLUSERS=1')
    print("=" * 75)


if __name__ == "__main__":
    build_enterprise_packages()
