# Main Window Redesign

Date: 2026-03-25

## Goal
Redesign the Dictate main window so it feels like a native desktop utility with premium polish rather than a translucent web dashboard.

## Approved Direction
- Native utility with premium polish
- Main window only; pill is out of scope for this pass
- Native-feeling borders and window chrome
- Keep sidebar navigation with `Overview`, `History`, `Models`, and `Settings`
- Use subtle translucency only where it improves depth; avoid loud glassmorphism
- Buttons, toggles, text hierarchy, and animations should feel native and restrained

## UX Principles
- Navigation chrome should stay quiet and structural
- Controls belong where users expect them; avoid putting settings inside the sidebar shell
- Each page should have one dominant content surface instead of many competing cards
- Status should be explicit: model readiness, engine, runtime, warm-up, and download state must be easy to scan
- Layout must prevent text/control overlap at all supported window sizes

## Screen Architecture

### Overview
- Compact status header with runtime readiness and a single primary action
- Active model summary in its own structured block
- Latest successful transcript preview
- Warnings/tips and system summary in a balanced secondary grid

### Models
- Runtime strip at top for acceleration state
- Dense native-style list rows, not marketplace cards
- Left column for model identity and explanatory text
- Right column for support/runtime/status badges and actions
- Download and preparation progress shown inline below the action lane

### History
- Utility log with compact summary strip and chronological entries
- Each row shows status, timestamp, model, and transcript/failure detail

### Settings
- Grouped sections for general behavior, runtime, dictation behavior, and appearance
- Two-column setting rows: label/detail on left, control lane on right
- Theme controls move here from the sidebar

## Implementation Notes
- Replace hidden custom main-window title bar with native window chrome where Electrobun allows it cleanly on Windows
- Keep existing runtime logic and RPC behavior intact
- Prefer structural React refactoring and CSS cleanup over adding libraries
- Validate with `bun run --cwd dictate-app typecheck` and `bun run --cwd dictate-app lint`
