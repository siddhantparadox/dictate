#define MyAppName "Dictate"
#define MyAppPublisher "Siddhant Paradox"
#define MyAppURL "https://github.com/siddhantparadox/dictate"

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

#ifndef SourceAppDir
  #error SourceAppDir is not defined.
#endif

#ifndef OutputDir
  #error OutputDir is not defined.
#endif

#ifndef OutputBaseFilename
  #define OutputBaseFilename "canary-win-x64-dictate-Setup-canary"
#endif

#ifndef RepoRoot
  #define RepoRoot "..\.."
#endif

[Setup]
AppId={{86A951B2-5968-4B4A-9FD0-7E6DDF6467F7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} Beta {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
VersionInfoVersion={#MyAppVersion}
VersionInfoProductName={#MyAppName}
VersionInfoDescription={#MyAppName} Windows Installer
WizardStyle=modern
DefaultDirName={localappdata}\Programs\Dictate
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
Compression=lzma2/max
SolidCompression=yes
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
SetupIconFile={#RepoRoot}\icon.ico
UninstallDisplayIcon={app}\Resources\app.ico
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceAppDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\bin\launcher.exe"; WorkingDir: "{app}\bin"; IconFilename: "{app}\Resources\app.ico"
Name: "{autoprograms}\{#MyAppName}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\bin\launcher.exe"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
