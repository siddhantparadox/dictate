# Dictate App Package

This directory contains the desktop application package for Dictate.

For product overview, usage, and repository-level setup, see the root README:

- [../README.md](../README.md)

## Local Commands

Run these from `dictate-app/`:

```bash
bun install
bun run dev
bun run dev:hmr
bun run typecheck
bun run lint
bun run build:canary
bun run build:canary:installer
```

`build:canary` produces the Electrobun canary payload and updater artifacts. `build:canary:installer` wraps that payload in the per-user Inno Setup installer used for Windows releases.

## Sidecar Setup

Create the CPU runtime:

```bash
pwsh -File sidecar/bootstrap.ps1
```

Create the CUDA runtime:

```bash
pwsh -File sidecar/bootstrap.ps1 -Runtime cuda
```

Create both runtimes:

```bash
pwsh -File sidecar/bootstrap.ps1 -Runtime both
```

## Package Layout

```text
src/
  bun/         Main process, hotkey handling, tray, runtime orchestration
  mainview/    React UI
  shared/      Shared model catalog and RPC types
sidecar/       Python worker, model loading, runtime bootstrap
```

## Notes

- Global hotkey default: `Ctrl+Shift`
- Default model: `Moonshine Medium Streaming`
- Default acceleration mode: `Auto`
- Model storage root defaults to `%USERPROFILE%\\.dictateapp`
