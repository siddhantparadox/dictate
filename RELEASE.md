# Release Process

## Scope

Dictate currently ships as a Windows-only release.

- Product messaging may say `beta`
- Build and GitHub release channels must stay on `canary`
- The user-facing Windows installer is the Inno Setup `.exe`
- Electrobun canary artifacts remain the underlying app and update payload

## Release Artifacts

GitHub CI publishes these files from the canary workflow:

- `dictate-app/artifacts/canary-win-x64-dictate-Setup-canary.exe`
- `dictate-app/artifacts/canary-win-x64-dictate-canary.tar.zst`
- `dictate-app/artifacts/canary-win-x64-update.json`

What each file is for:

- `canary-win-x64-dictate-Setup-canary.exe`
  - User-facing Windows installer
  - Built with Inno Setup
  - Installs per-user under `%LocalAppData%\Programs\Dictate`
- `canary-win-x64-dictate-canary.tar.zst`
  - Electrobun packaged app payload
  - Keep this in the release for updater and release metadata purposes
- `canary-win-x64-update.json`
  - Electrobun update metadata for the matching payload

## Versioning

The current app version comes from:

- `dictate-app/package.json`

Before releasing:

1. Update the version in `dictate-app/package.json` if needed
2. Commit the version change
3. Create a canary tag such as `v0.1.0-canary.1`

## GitHub CI Release

The release workflow is:

- `.github/workflows/release-canary.yml`

It can run in two ways:

1. Push a matching tag like `v0.1.0-canary.1`
2. Run the workflow manually with `workflow_dispatch` and provide the tag

What the workflow does:

1. Checks out the repo on `windows-latest`
2. Installs Bun dependencies
3. Installs Inno Setup
4. Builds the Electrobun canary payload
5. Wraps that payload with Inno Setup
6. Publishes a GitHub prerelease with the canary artifacts

## Recommended Release Steps

1. Run local verification:
   - `bun run typecheck`
   - `bun run lint`
2. Optionally build locally:
   - `bun run build:canary`
   - `bun run build:canary:installer`
3. Push the release commit
4. Create and push a tag like `v0.1.0-canary.1`
5. Wait for GitHub Actions to publish the prerelease
6. Download and smoke-test the uploaded installer on a clean Windows machine

## Local Build Notes

Useful local commands from the repo root:

```bash
bun run build:canary
bun run build:canary:installer
```

Local installer output:

- `dictate-app/artifacts/canary-win-x64-dictate-Setup-canary.exe`

## Installer Notes

- The final user-facing installer is built with Inno Setup
- Installer identity is defined in `dictate-app/installer/windows/Dictate.iss`
- It should create a proper Windows installed app entry and uninstall path
- Electrobun's raw setup wrapper is not the intended user-facing installer UX

## Release Messaging

Use these conventions consistently:

- Public copy: `beta`
- Build channel: `canary`
- GitHub prerelease: `true`
- Platform copy: Windows-only for now, Linux planned shortly, macOS later
