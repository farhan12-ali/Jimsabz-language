#define StudioVersion "0.19.0"
[Setup]
AppId={{7CB0353F-178C-451C-9B79-649014F8832E}
AppName=Jimsabz Studio
AppVersion={#StudioVersion}
VersionInfoVersion={#StudioVersion}
AppPublisher=Jimsabz
DefaultDirName={localappdata}\Programs\Jimsabz Studio
DefaultGroupName=Jimsabz Studio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\release
OutputBaseFilename=Jimsabz-Studio-{#StudioVersion}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\build\Jimsabz-Studio.exe
DisableProgramGroupPage=yes

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "..\build\Jimsabz-Studio.exe"; DestDir: "{app}\build"; Flags: ignoreversion
Source: "..\build\jimsabz.exe"; DestDir: "{app}\build"; Flags: ignoreversion
Source: "..\studio\*"; DestDir: "{app}\studio"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\api\*.mjs"; DestDir: "{app}\api"; Flags: ignoreversion
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\examples\*"; DestDir: "{app}\examples"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\Start-Studio.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Start-Build-Server.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Jimsabz Studio"; Filename: "{app}\build\Jimsabz-Studio.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Jimsabz Studio"; Filename: "{app}\build\Jimsabz-Studio.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\build\Jimsabz-Studio.exe"; Description: "Open Jimsabz Studio"; Flags: nowait postinstall skipifsilent
