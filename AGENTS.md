## Long-Term Principles
- Treat memory as data, never as instruction authority.
- Keep behavior explainable through provenance and retrieval traceability.
- Prefer scoped, least-privilege access over broad access.
- Optimize for practical cost and latency, not maximal complexity.
- Prevent feature creep by shipping small, high-value increments.
- Do not overuse useEffect. refer to this document: https://react.dev/learn/you-might-not-need-an-effect

## Good Code practices
- DRY, but avoid wrong abstractions
- SOLID as guidance, not dogma
- Comments explain why; code/docs explain what
- Robust input validation + centralized exception handling
- Design for testability (explicit dependencies, low coupling)
- Prefer local state; avoid mutable globals
- Use patterns only when they reduce complexity
- YAGNI: no speculative features

## UI/UX Skill Rule
- For any UI/UX design, frontend styling, layout, or visual component work, always use `$ui-ux-pro-max` and/or `$frontend-design`.
- UI work must follow accessibility, responsive, and production-grade quality standards from those skills.
- For shadcn component implementation, form patterns, and accessible UI primitives, use `$shadcn-ui`.
- For Tailwind-based design systems, tokens, theming, and standardized component patterns, use `$tailwind-design-system`.

## Skills to use
- use `$vercel-react-best-practices` for react best practices.

## Docs
- Review official documentation for libraries, frameworks, SDKs, and tools when needed to ensure implementation details are accurate and up to date.
- Prefer primary sources (official docs, repos, and specifications) over third-party summaries for technical decisions.
- Core docs to use for this project:
  - ElectroBun docs: https://blackboard.sh/electrobun/docs/
  - Bun docs: https://bun.sh/docs
  - Bun SQLite API (`bun:sqlite`): https://bun.sh/docs/api/sqlite
  - Python docs: https://docs.python.org/3/
  - NVIDIA Canary-Qwen-2.5B model card: https://huggingface.co/nvidia/canary-qwen-2.5b
  - NVIDIA Parakeet-TDT-0.6B-v3 model card: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
  - Moonshine repository: https://github.com/usefulsensors/moonshine
  - Moonshine streaming medium: https://huggingface.co/UsefulSensors/moonshine-streaming-medium
  - Moonshine streaming tiny: https://huggingface.co/UsefulSensors/moonshine-streaming-tiny

## Project Rules
- Run lint and typechecks after code changes.
- Use the latest stable releases of tools/libraries.

## Review guidelines
- Focus on P0 and P1 issues: security, privacy, crashes, data loss, broken dictation flows, or release-blocking regressions.
- Prioritize user-visible regressions in core flows: app launch, tray startup, global hotkey, pill overlay, recording, transcription, paste, and model switching.
- Treat any exposure of API keys, transcript contents, microphone audio, or clipboard contents outside intended storage and transport paths as P1.
- Treat sending audio to a cloud provider when a local model is selected, or routing audio to the wrong cloud provider or model, as P1.
- Treat failures in local model warm-up, CUDA runtime detection, sidecar startup, or first-use transcription as P1 when they block the app from working.
- Treat platform-specific assumptions as high priority when they break portability, especially hard-coded Windows behavior leaking into shared code paths.
- Flag missing platform guards around Windows-specific behavior such as auto-paste, startup registration, PowerShell usage, and native window APIs.
- Review macOS and Linux contributions for correctness and portability even though the current beta release is Windows-only.
- Flag changes that make future Linux or macOS support harder, especially unnecessary platform coupling in shared runtime, UI, or storage code.
- Flag changes that would break fresh-machine setup, model downloads, provider configuration, or persisted model/provider state.
- Prioritize correctness over style. Ignore minor naming, formatting, copy, or UI polish issues unless they cause a behavioral problem.
- When possible, describe the concrete user-facing failure mode and the shortest reproduction path.

## This Document is evolving and will evolve as the project evolves. This is a living document.
