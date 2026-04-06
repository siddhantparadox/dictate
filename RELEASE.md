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
- `dictate-app/artifacts/canary-win-x64-dictate-Setup-canary.zip`
- `dictate-app/artifacts/canary-win-x64-dictate-canary.tar.zst`
- `dictate-app/artifacts/canary-win-x64-update.json`

What each file is for:

- `canary-win-x64-dictate-Setup-canary.exe`
  - User-facing Windows installer
  - Built with Inno Setup
  - Installs per-user under `%LocalAppData%\Programs\Dictate`
- `canary-win-x64-dictate-Setup-canary.zip`
  - Convenience archive containing the packaged Electrobun setup wrapper and payload files
  - Useful when a user prefers downloading a zip instead of the direct installer `.exe`
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

Important:

- Normal pushes to `main` do **not** create a release
- A release happens only when you push a matching canary tag or manually dispatch the workflow

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
7. Uploads the same files as GitHub Actions workflow artifacts for debugging

## Recommended Release Steps

1. Push the intended release commit to `main`
2. Run local verification:
   - `bun run typecheck`
   - `bun run lint`
3. Optionally build locally:
   - `bun run build:canary`
   - `bun run build:canary:installer`
4. Create and push a tag like `v0.1.0-canary.1`
5. Wait for GitHub Actions to publish the GitHub release
6. Edit the GitHub release notes/title if needed
7. If you want a public release instead of a prerelease, flip the GitHub release state after publish
8. Download and smoke-test the uploaded installer on a clean Windows machine

## Practical Trigger Flow

Typical release command flow:

```bash
git push origin main
git tag -a v0.1.0-canary.1 -m "Release v0.1.0-canary.1"
git push origin v0.1.0-canary.1
```

That tag push is what triggers GitHub Actions to build and publish the release.

Manual fallback:

```bash
gh workflow run release-canary.yml -f tag=v0.1.0-canary.1
```

Use the manual dispatch path when:

- the tag already exists but the workflow needs to be rerun
- you fixed the workflow after an earlier failed release
- you want to rebuild the same release tag intentionally

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
- GitHub workflow default: publish a normal release and replace existing assets for the same canary tag
- Platform copy: Windows-only for now, Linux planned shortly, macOS later
