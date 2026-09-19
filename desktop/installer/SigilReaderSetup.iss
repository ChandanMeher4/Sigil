; ==============================================================================
; SIGIL Secure DRM Reader - Inno Setup 6 Installer Script
; Problem Statement: SIH26237 (National Cyber Defense Initiative)
; Supports:
; - Standard Interactive GUI Setup Wizard
; - Silent / Unattended Enterprise Deployment (Microsoft Intune, SCCM, GPO)
; - Automatic .sigil Registry File Association
; - Start Menu & Desktop Shortcuts
; - Clean Machine-Wide (All Users) or Per-User Uninstallation
; ==============================================================================

#define MyAppName "SIGIL Secure DRM Reader"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "National Cyber Defense Initiative (SIH26237)"
#define MyAppURL "https://sigil.gov.in"
#define MyAppExeName "SigilReader.exe"

[Setup]
; Unique AppId generated for SIGIL Reader
AppId={{D3F9B1E4-7E2A-4C8B-9D1E-5F0A3B2C1D4E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\SIGIL\SigilReader
DefaultGroupName=SIGIL
DisableProgramGroupPage=yes
LicenseFile=..\..\LICENSE
OutputDir=..\dist
OutputBaseFilename=SigilReaderSetup-v{#MyAppVersion}-x64
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
ChangesAssociations=yes

; Version Information
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Hardware-Shielded Post-Quantum Secure Document Reader
VersionInfoCopyright=Copyright (C) 2026 National Cyber Defense Initiative

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "associate"; Description: "Associate .sigil files with SIGIL Secure DRM Reader"; GroupDescription: "File Associations:"

[Files]
; Main Executable & PyInstaller Internal Runtime
Source: "..\dist\SigilReader\SigilReader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\SigilReader\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs
; Compiled Viewer Frontend Bundle (for offline standalone operation)
Source: "..\..\recipient_client\viewer\dist\*"; DestDir: "{app}\viewer\dist"; Flags: ignoreversion recursesubdirs createallsubdirs optional

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Open SIGIL Secure DRM Reader"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Root .sigil file association
Root: HKA; Subkey: "Software\Classes\.sigil"; ValueType: string; ValueName: ""; ValueData: "SigilDocument"; Flags: uninsdeletevalue; Tasks: associate
Root: HKA; Subkey: "Software\Classes\.sigil"; ValueType: string; ValueName: "Content Type"; ValueData: "application/x-sigil"; Flags: uninsdeletevalue; Tasks: associate

; Document Type Definition
Root: HKA; Subkey: "Software\Classes\SigilDocument"; ValueType: string; ValueName: ""; ValueData: "SIGIL Protected Classified Document"; Flags: uninsdeletekey; Tasks: associate
Root: HKA; Subkey: "Software\Classes\SigilDocument\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"; Flags: uninsdeletekey; Tasks: associate

; Shell Open Command (passes double-clicked file path as %1)
Root: HKA; Subkey: "Software\Classes\SigilDocument\shell\open"; ValueType: string; ValueName: ""; ValueData: "Open in SIGIL Secure DRM Reader"; Flags: uninsdeletekey; Tasks: associate
Root: HKA; Subkey: "Software\Classes\SigilDocument\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey; Tasks: associate

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// Custom Inno Setup Pascal Script for Silent GPO / Intune Logging
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    Log('SIGIL Secure DRM Reader installed successfully.');
  end;
end;
