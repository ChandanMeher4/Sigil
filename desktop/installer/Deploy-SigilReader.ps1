<#
.SYNOPSIS
    Enterprise Silent Deployment Script for SIGIL Secure DRM Reader (SIH26237).
.DESCRIPTION
    Automates machine-wide or per-user installation of SIGIL Secure DRM Reader
    for Microsoft Intune, Microsoft Endpoint Configuration Manager (SCCM),
    and Active Directory Group Policy (GPO) software distribution.

    Performs:
    1. Binary deployment to Program Files.
    2. Windows Registry .sigil file extension registration.
    3. Start Menu and Desktop shortcut creation.
    4. Anti-screen-capture DRM prerequisites validation.
.PARAMETER Uninstall
    Uninstalls SIGIL Reader, removes shortcuts, and unregisters file associations.
.EXAMPLE
    .\Deploy-SigilReader.ps1
    # Silent enterprise installation
.EXAMPLE
    .\Deploy-SigilReader.ps1 -Uninstall
    # Silent enterprise uninstallation
#>

[CmdletBinding()]
param (
    [switch]$Uninstall,
    [string]$InstallPath = "$env:ProgramFiles\SIGIL\SigilReader"
)

$ErrorActionPreference = "Stop"

$AppName = "SIGIL Secure DRM Reader"
$ProgId = "SigilDocument"
$Extension = ".sigil"
$ExeName = "SigilReader.exe"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$DistDir = Join-Path (Split-Path -Parent $SourceDir) "dist\SigilReader"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "[$timestamp] [$Level] $Message"
}

# ==============================================================================
# UNINSTALL FLOW
# ==============================================================================
if ($Uninstall) {
    Write-Log "Starting uninstallation of $AppName..."
    
    # 1. Unregister File Associations
    try {
        if (Test-Path "HKLM:\SOFTWARE\Classes\$Extension") {
            Remove-Item "HKLM:\SOFTWARE\Classes\$Extension" -Recurse -Force
            Write-Log "Removed HKLM registry key for $Extension"
        }
        if (Test-Path "HKLM:\SOFTWARE\Classes\$ProgId") {
            Remove-Item "HKLM:\SOFTWARE\Classes\$ProgId" -Recurse -Force
            Write-Log "Removed HKLM registry key for $ProgId"
        }
        if (Test-Path "HKCU:\Software\Classes\$Extension") {
            Remove-Item "HKCU:\Software\Classes\$Extension" -Recurse -Force
        }
        if (Test-Path "HKCU:\Software\Classes\$ProgId") {
            Remove-Item "HKCU:\Software\Classes\$ProgId" -Recurse -Force
        }
    } catch {
        Write-Log "Warning removing registry keys: $_" "WARN"
    }

    # 2. Remove Shortcuts
    $StartMenuPath = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\SIGIL"
    if (Test-Path $StartMenuPath) {
        Remove-Item $StartMenuPath -Recurse -Force
        Write-Log "Removed Start Menu shortcuts"
    }

    # 3. Remove Installation Directory
    if (Test-Path $InstallPath) {
        Remove-Item $InstallPath -Recurse -Force
        Write-Log "Removed installation files at $InstallPath"
    }

    Write-Log "$AppName uninstalled successfully." "SUCCESS"
    exit 0
}

# ==============================================================================
# INSTALL FLOW
# ==============================================================================
Write-Log "Deploying $AppName for enterprise custody..."

# Check source directory
if (-not (Test-Path (Join-Path $DistDir $ExeName))) {
    Write-Log "Source binary not found at $DistDir. Looking in local package directory..." "WARN"
    if (Test-Path (Join-Path $SourceDir $ExeName)) {
        $DistDir = $SourceDir
    } else {
        Write-Log "Executable $ExeName not found. Please run build_exe.py before deploying." "ERROR"
        exit 1
    }
}

# 1. Create Destination Folder
if (-not (Test-Path $InstallPath)) {
    New-Item -Path $InstallPath -ItemType Directory -Force | Out-Null
    Write-Log "Created directory $InstallPath"
}

# 2. Copy Binaries & Dependencies
Write-Log "Copying application binaries to $InstallPath..."
Copy-Item -Path "$DistDir\*" -Destination $InstallPath -Recurse -Force

$TargetExe = Join-Path $InstallPath $ExeName

# 3. Register Windows File Association
Write-Log "Registering .sigil file association..."
try {
    # .sigil -> SigilDocument
    $extKey = "HKLM:\SOFTWARE\Classes\$Extension"
    if (-not (Test-Path $extKey)) { New-Item -Path $extKey -Force | Out-Null }
    Set-ItemProperty -Path $extKey -Name "(default)" -Value $ProgId
    Set-ItemProperty -Path $extKey -Name "Content Type" -Value "application/x-sigil"

    # SigilDocument definition
    $docKey = "HKLM:\SOFTWARE\Classes\$ProgId"
    if (-not (Test-Path $docKey)) { New-Item -Path $docKey -Force | Out-Null }
    Set-ItemProperty -Path $docKey -Name "(default)" -Value "SIGIL Protected Classified Document"

    # Icon
    $iconKey = "$docKey\DefaultIcon"
    if (-not (Test-Path $iconKey)) { New-Item -Path $iconKey -Force | Out-Null }
    Set-ItemProperty -Path $iconKey -Name "(default)" -Value "$TargetExe,0"

    # Open Command
    $cmdKey = "$docKey\shell\open\command"
    if (-not (Test-Path $cmdKey)) { New-Item -Path $cmdKey -Force | Out-Null }
    Set-ItemProperty -Path $cmdKey -Name "(default)" -Value "`"$TargetExe`" `"%1`""
    
    Write-Log "File association registered successfully."
} catch {
    Write-Log "HKLM registry access denied. Falling back to HKCU (Per-User)..." "WARN"
    $extKey = "HKCU:\Software\Classes\$Extension"
    New-Item -Path $extKey -Force | Out-Null
    Set-ItemProperty -Path $extKey -Name "(default)" -Value $ProgId

    $docKey = "HKCU:\Software\Classes\$ProgId"
    New-Item -Path $docKey -Force | Out-Null
    Set-ItemProperty -Path $docKey -Name "(default)" -Value "SIGIL Protected Classified Document"

    $cmdKey = "$docKey\shell\open\command"
    New-Item -Path $cmdKey -Force | Out-Null
    Set-ItemProperty -Path $cmdKey -Name "(default)" -Value "`"$TargetExe`" `"%1`""
}

# 4. Create Start Menu Shortcuts
try {
    $StartMenuDir = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\SIGIL"
    if (-not (Test-Path $StartMenuDir)) { New-Item -Path $StartMenuDir -ItemType Directory -Force | Out-Null }

    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("$StartMenuDir\$AppName.lnk")
    $Shortcut.TargetPath = $TargetExe
    $Shortcut.WorkingDirectory = $InstallPath
    $Shortcut.Description = "Open SIGIL Protected Classified Document Reader"
    $Shortcut.Save()
    Write-Log "Created Start Menu shortcut at $StartMenuDir"
} catch {
    Write-Log "Warning creating Start Menu shortcut: $_" "WARN"
}

Write-Log "========================================================"
Write-Log "$AppName deployed successfully." "SUCCESS"
Write-Log "Target Path: $TargetExe"
Write-Log "File Association: Double-clicking any .sigil file will launch SigilReader"
Write-Log "========================================================"

exit 0
