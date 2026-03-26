# Stitch Native Utility Redesign

Date: 2026-03-25

## Goal
Redesign Dictate so the app feels like a premium, platform-neutral desktop utility instead of a cheap web dashboard.

This pass includes:
- Main window shell
- `Overview`
- `Models`
- `History`
- `Settings`
- Compact recording pill overlay states

This supersedes the narrower main-window-only direction documented earlier on the same date.

## Approved Direction
- Platform-neutral native utility
- Minimal, calm, precise, premium
- Compact density suitable for a desktop tool
- Better fonts and hierarchy
- Collapsible sidebar with intentional expanded and collapsed states
- Pill footprint stays close to the current compact size
- Keep the existing product scope; improve composition and clarity rather than adding features

## Visual System
- Warm off-white light theme with graphite text
- Slightly darker sidebar plane
- White primary content surfaces
- Desaturated blue-gray accent for selection, focus, and primary actions
- Matte surfaces, restrained borders, soft elevation
- Minimal glass and minimal animation
- Typography direction: refined grotesk for UI, mono companion for metadata and technical labels

## UX Principles
- Navigation chrome stays quiet and structural
- The app should read like a desktop utility, not a SaaS dashboard
- Use fewer, larger structural surfaces instead of many nested cards
- Keep status explicit and scannable: readiness, runtime, hotkey, model state, progress
- Preserve compactness without feeling crowded
- Maintain consistency between the main window and the recording pill

## Screen Architecture

### Shell
- Two-pane desktop shell
- Sidebar around `240px` expanded and `72px` collapsed
- Expanded state shows icons plus labels
- Collapsed state shows icon-only rail with a clear active indicator
- Bottom sidebar status compresses intelligently in collapsed mode
- No decorative top marketing bar

### Overview
- Compact status workspace instead of a hero layout
- Readiness, selected model, hotkey, active runtime, and latest transcript are primary
- Quick test dictation action remains visible
- Warnings, tips, and system summary are secondary and quieter

### Models
- Dense, ordered model library
- Strong scan order: identity, runtime fit, engine/runtime metadata, support state, actions
- Installed/default/downloading/unsupported states should be immediately legible
- Avoid loud badge clutter and oversized cards

### History
- Dense activity log
- Transcript content first
- Timestamp, model, and status second
- Compact row rhythm with subtle grouping instead of heavy card framing

### Settings
- Grouped preference panels for general behavior, runtime, and appearance
- Predictable rows and compact control lanes
- Segmented runtime control and theme controls should feel desktop-native

### Pill Overlay
- Keep current compact footprint
- Recording state keeps waveform and timer
- Transcribing, success, and failure states stay short and calm
- Visual language matches the main app shell

## Stitch Deliverables
Project:
- `projects/3141279869800803797` (`Dictate Native Utility Redesign`)

Generated screens:
- `Dictate Pro Overview` — `projects/3141279869800803797/screens/2982c1450fa74b86befcd3d903a84e85`
- `Dictate Pro Models` — `projects/3141279869800803797/screens/5437ac07cd4e4957b06fc648ad3afc6b`
- `Dictate Pro History` — `projects/3141279869800803797/screens/e54b36ae9d1349588aa7d56ea411bd55`
- `Dictate Pro Settings` — `projects/3141279869800803797/screens/f42368711cde408a8c61e180f6d50067`
- `Recording States Board` — `projects/3141279869800803797/screens/e4b28f20976842afb9acaf513b545a5e`
- `Dictate Pro Overview (Collapsed Sidebar)` — `projects/3141279869800803797/screens/d66f5f4295dd4381b8a3e5e9a921a18f`

## Implementation Guidance
- Keep the current React + Tailwind + Radix/shadcn-style stack
- Do not add a new visual framework unless a concrete gap appears during implementation
- Rework layout, spacing, typography, surfaces, and shell behavior first
- Restyle the local primitives to match the approved direction
- Preserve current runtime logic and user flows

## Verification Targets For Implementation
- Sidebar collapse works cleanly at desktop sizes
- Light and dark themes both feel restrained and readable
- `Overview`, `Models`, `History`, and `Settings` keep dense but stable alignment
- Pill remains compact during all states
- Run `bun run --cwd dictate-app typecheck`
- Run `bun run --cwd dictate-app lint`
