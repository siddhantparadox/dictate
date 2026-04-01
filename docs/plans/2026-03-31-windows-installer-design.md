# Windows Installer Design

Date: 2026-03-31

## Goals

- Replace Electrobun's Windows setup wrapper as the user-facing install experience.
- Ship a proper Windows installer with icon support, Start Menu entries, uninstall support, and an Installed Apps entry.
- Keep Electrobun canary artifacts as the underlying packaged app and updater payload.
- Eliminate the packaged black-screen startup path before shipping the installer.

## Recommended Approach

- Use Electrobun to build the canary app payload and updater artifacts.
- Use Inno Setup as a per-user Windows installer wrapper.
- Install Dictate under `%LocalAppData%\Programs\Dictate`.
- Register uninstall information through Inno Setup so the app appears in Installed Apps.
- Keep product messaging as beta while retaining canary channel naming for packaged artifacts.

## Why Inno Setup

- Proper installer UX with a familiar Windows wizard flow.
- Built-in uninstall registration and cleanup.
- Straightforward shortcut creation and icon configuration.
- Simpler for this app than NSIS or WiX.

## Black Screen Root Causes

The packaged blank window had two main causes:

1. Packaged view URLs used query strings on flat bundled files, which broke resource loading in release mode.
2. The packaged app did not bundle the sidecar files, so installed builds could not resolve the Python worker layout correctly.

## Runtime Fixes

- Use hash-based view selection for bundled `views://` URLs while still supporting query parameters in development.
- Bundle the sidecar files into the packaged app payload.
- Materialize the sidecar workspace into `%USERPROFILE%\.dictateapp\sidecar` instead of expecting writable files inside the install directory.

## Installer Design

- Per-user install.
- Default install path: `%LocalAppData%\Programs\Dictate`.
- Start Menu shortcut.
- Optional or deferred desktop shortcut support if needed later.
- Uninstall entry in Installed Apps.
- Installer icon from the repository `icon.ico`.
- Installed shortcut icon from the packaged app resources.

## Build Flow

1. `bun run build:canary`
2. `bun run build:canary:installer`
3. Upload:
   - `canary-win-x64-dictate-Setup-canary.exe`
   - `canary-win-x64-dictate-canary.tar.zst`
   - `canary-win-x64-update.json`

## Notes

- Electrobun's default setup wrapper is no longer the intended user-facing installer.
- If a future upgrade to Electrobun improves Windows packaging, re-evaluate whether any custom packaging steps can be removed.
