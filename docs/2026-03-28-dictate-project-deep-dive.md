# Dictate Project Deep Dive

Date: 2026-03-28

Audience: project deep-dive, architecture review, technical handoff

Scope: this document reflects the current repository in `D:\projects\dictate` plus primary-source vendor docs reviewed on 2026-03-28 for NVIDIA, NeMo, and Groq.

## 1. Executive Summary

Dictate is a Windows-first desktop dictation utility built around one narrow workflow:

1. Focus any text field.
2. Hold `Ctrl+Shift`.
3. Speak.
4. Release the hotkey.
5. Dictate transcribes and pastes the result.

That narrow scope is the product strategy. The app is not trying to be a meeting recorder, agent, or speech platform. It is trying to be a fast utility for voice typing. Most of the engineering decisions follow from that:

- keep desktop interactions simple
- keep first-use latency low
- support local inference first
- add cloud inference as optional BYOK paths
- expose model/runtime state clearly

Current shipped scope:

- local transcription with Moonshine and NVIDIA models
- optional cloud transcription with Groq, Deepgram, AssemblyAI, and OpenRouter
- CPU and CUDA runtime selection
- a compact recording pill overlay
- persistent settings and recent job history
- tray-based Windows utility behavior

## 2. What We Built

The app has four major pieces:

1. Electrobun main process in `dictate-app/src/bun/`
   This owns startup, tray, hotkey handling, model orchestration, storage, and cloud requests.

2. React renderer in `dictate-app/src/mainview/`
   This renders the main window and the pill overlay.

3. Shared model and RPC contracts in `dictate-app/src/shared/`
   This keeps the UI and main process aligned on model metadata and state shape.

4. Python sidecar in `dictate-app/sidecar/`
   This handles microphone capture and local model inference.

The UI is split into two surfaces:

- a main window with `Overview`, `History`, `Models`, and `Settings`
- a separate non-activating pill window shown during capture and transcription

That split is important. The main window is for control and inspection. The pill is for low-friction in-flow feedback while dictating into another app.

## 3. Project Evolution

The recent commit history shows a fast progression from MVP plumbing to a more reviewable desktop product:

| Date | Commit | Meaning |
| --- | --- | --- |
| 2026-03-27 | `4a525a5` | Added AssemblyAI and OpenRouter BYOK support |
| 2026-03-26 | `e8ce776` | Added Deepgram BYOK integration |
| 2026-03-26 | `e9e7c15` | Added Groq cloud editor and WAV microphone RPCs |
| 2026-03-26 | `59a8503` | Added Windows DPI awareness and UI tuning |
| 2026-03-26 | `2b22851` | Added native Windows icon handling |
| 2026-03-25 | `82c0eea` | Modularized the dashboard and hardened layout |
| 2026-03-25 | `ef729c4` | Added launch-on-startup with tray-first autostart |

Two design docs in `docs/plans/` explain the visual direction:

- `2026-03-25-main-window-redesign-design.md`
- `2026-03-25-stitch-native-utility-redesign-design.md`

They show a deliberate move away from “web dashboard in a desktop shell” toward “quiet native utility.”

## 4. System Design

The runtime architecture is straightforward:

- the user interacts with the keyboard and microphone
- the Electrobun main process coordinates the workflow
- the React UI receives pushed snapshots of current state
- the Python sidecar handles local speech work
- SQLite persists settings and jobs
- provider JSON persists cloud configuration
- cloud requests are sent only when a cloud model is selected

This split fits the problem well:

- desktop integration stays in the main process
- the UI stays thin
- model-runtime complexity stays in Python
- local and cloud inference share one product flow

The key architectural decisions are:

- Electrobun instead of Electron to keep the desktop shell lighter while still giving native windows, tray, shortcuts, and FFI access
- a Python sidecar because Moonshine and NeMo have mature Python inference paths
- the main process as the source of truth through a full `AppSnapshot`
- explicit model warm-up because first-use latency is a product concern, not just an implementation detail

## 6. End-to-End Dictation Flow

### Startup

On boot, the app resolves the view URL, creates the tray and pill, creates the main window unless started via autostart, applies startup preference, registers the hotkey, checks the selected runtime, pushes the initial snapshot, and triggers model warm-up.

### Hotkey Handling

The default hotkey is `Ctrl+Shift`, which is harder to implement than a normal accelerator because it is modifier-only.

The app handles this in two ways:

- standard accelerators use Electrobun `GlobalShortcut`
- modifier-only `Ctrl+Shift` uses a Windows polling loop over `GetAsyncKeyState`

That gives the app a true hold-to-talk flow:

- key down starts microphone capture
- key up ends capture and triggers transcription

### Local Path

For local models:

1. The main process verifies the model is installed and warm.
2. The sidecar captures microphone audio.
3. The sidecar runs inference.
4. The main process stores the job result.
5. The transcript is copied to the clipboard and optionally pasted.
6. The pill shows success or failure.

### Cloud Path

For cloud models:

1. The sidecar records microphone audio locally.
2. It writes a temporary WAV file.
3. The main process uploads that WAV to the active provider.
4. The temp file is deleted.
5. The result is pasted the same way as local transcription.

Important privacy behavior: capture always begins locally, and audio leaves the machine only when a cloud model is selected.

## 7. Main Process Design

`dictate-app/src/bun/index.ts` is the orchestrator. It manages:

- startup
- window creation
- tray behavior
- hotkeys
- runtime selection
- model warm-up
- cloud provider setup
- model install/delete
- job lifecycle
- pill lifecycle
- notifications
- settings updates

That file is large, but the responsibility set is coherent. Three design choices stand out:

1. Snapshot-driven UI
   The renderer gets one serializable truth object instead of polling scattered state.

2. Sequential settings mutations
   Settings updates are queued so hotkey re-registration, acceleration switching, and launch-on-startup changes do not race.

3. Explicit runtime states
   The app exposes warm-up, model progress, sidecar status, installer status, and toasts instead of collapsing everything into “loading.”

## 8. Renderer Design

The renderer is React-based and intentionally thin. It does three things:

- load the initial snapshot
- subscribe to pushed snapshots and toasts
- keep only local presentation state in React

The pill overlay is also React, but in a separate window. That matters because it can stay:

- always on top
- near the active display
- non-activating
- independent from the main dashboard window

This keeps the dictation experience lightweight even when the main window is minimized or hidden.

## 9. Persistence And On-Disk Layout

The app persists three categories of data:

### App State

`bun:sqlite` stores:

- settings
- local model install state
- recent jobs and transcripts

### Cloud Provider Config

Cloud provider configuration is stored in `%USERPROFILE%\.dictateapp\providers.json`, including API key, selected model, and last verification time.

### Model Caches

Model assets live under `%USERPROFILE%\.dictateapp`, including Hugging Face, Moonshine, and Torch caches.

Main tradeoff: the storage layout is simple and easy to debug, but API keys are not yet in a platform secret store.

## 10. Python Sidecar Design

The sidecar bridges microphone capture and local inference.

It communicates with the main process over stdio using newline-delimited JSON RPC. That is a good choice here because it is:

- simple
- explicit
- easy to debug
- tightly tied to process lifecycle

### Runtime Provisioning

`sidecar/bootstrap.ps1` provisions separate CPU and CUDA Python environments with:

- NumPy and SciPy
- sounddevice
- moonshine-voice
- `nemo_toolkit[asr]`
- `huggingface_hub[hf_xet]`
- CPU or CUDA PyTorch wheels

This avoids a single mixed environment that is hard to reason about and easy to break.

### Runtime Modes

The app supports:

- `auto`
- `cpu`
- `cuda`

`auto` prefers a working CUDA runtime. `cpu` forces the CPU environment. `cuda` requests CUDA and warns if the selected interpreter is not actually CUDA-capable.

## 11. Local Inference Stack

## 11.1 Moonshine

Moonshine is the local CPU path and the low-friction fallback:

- smaller footprint
- no NVIDIA dependency
- good fit for fast local dictation

The app uses Moonshine in a capture-then-transcribe flow rather than true streaming output, which fits the current short-utterance voice-typing product.

## 11.2 NVIDIA, NeMo, And Why They Matter

The NVIDIA path is the most important technical differentiator in the local stack.

The app currently uses NVIDIA models through open-source NeMo and PyTorch CUDA, not through TensorRT, Riva, Triton, or NIM. That is visible in the repo:

- `nemo_toolkit[asr]` is a sidecar dependency
- Parakeet is loaded through NeMo ASR
- Canary-Qwen is loaded through NeMo SpeechLM2 SALM
- the app’s runtime metadata explicitly says TensorRT is not configured yet

### Why NeMo Is A Good Fit

NVIDIA’s current NeMo docs position NeMo as a modular Speech AI framework that provides:

- Parakeet-family ASR models
- Canary speech models
- GPU-accelerated decoding
- SpeechLM2 components such as SALM

That aligns well with Dictate’s goals: local checkpoint loading, practical Python inference, and direct access to NVIDIA-native speech models without adding a serving layer.

### Parakeet-TDT-0.6B-v3

According to the current NVIDIA model card, Parakeet-TDT-0.6B-v3 is:

- a 600M parameter multilingual ASR model
- built on FastConformer-TDT
- expanded to 25 European languages
- capable of punctuation, capitalization, and timestamps

In Dictate it is used as a local short-WAV transcription backend. The app does not expose timestamps or streaming inference because the product is centered on voice typing, not transcript analytics.

Important caveat: the current model card is Linux-first while Dictate is Windows-first, so the NVIDIA Windows path should still be treated as a higher-risk operational surface than the CPU path.

### Canary-Qwen-2.5B

Canary-Qwen-2.5B is a different class of NVIDIA model. It is not just a standard ASR checkpoint; it is a speech-augmented language model path using NeMo SpeechLM2 SALM.

Current vendor facts:

- English-only support in the released checkpoint
- prompt-plus-audio input structure
- trained with NVIDIA NeMo on 32 A100 80GB GPUs
- tied to SALM and NeMo 2.5+ style usage

Why this matters: Parakeet represents the specialized ASR path, while Canary-Qwen represents the speech-aware LLM path. That gives Dictate two distinct NVIDIA inference approaches in one app.

### Why PyTorch Instead of TensorRT Today

The repo clearly shows that NVIDIA models currently run on the PyTorch CUDA path. That is the right tradeoff for this stage: fastest path to a working local GPU MVP and simplest integration with NeMo checkpoints. The cost is that Dictate is not yet taking advantage of TensorRT-level deployment optimization.

## 12. Cloud Inference Stack

The cloud architecture is pragmatic. The app records locally, writes a WAV, and then hands that artifact to the selected provider. That keeps microphone handling consistent across all providers.

### Groq

Groq is the most strategically interesting cloud option in the app because it aligns tightly with Dictate’s latency-sensitive use case.

Dictate’s Groq integration:

- validates credentials by listing models
- uploads a WAV file to the speech transcription endpoint
- supports `whisper-large-v3-turbo` and `whisper-large-v3`

Current Groq docs position those models as:

- `whisper-large-v3-turbo` for fastest lower-cost speech recognition
- `whisper-large-v3` for higher accuracy

Current Groq pricing docs list:

- `$0.04` per audio hour for `whisper-large-v3-turbo`
- `$0.111` per audio hour for `whisper-large-v3`

Current Groq rate-limit docs list both Whisper models at:

- `20 RPM`
- `2K RPD`
- `7.2K ASH`
- `28.8K ASD`

### Groq Hardware Context

Dictate uses GroqCloud, not on-prem Groq hardware. But the chip story matters because it explains why Groq is a good cloud fit.

Across current Groq docs, the recurring themes are inference-first design, deterministic execution, Tensor Streaming Processor architecture, high on-die bandwidth, and low-latency model serving.

Current public Groq material describes:

- a 14nm GroqChip generation
- deterministic Tensor Streaming Processor design
- GroqCard with 230 MB on-die SRAM and up to 80 TB/s on-die bandwidth
- GroqNode with 8 cards, 1.76 GB on-die SRAM, and up to 640 TB/s on-die bandwidth

For Dictate, the practical implication is simple: Groq is attractive when the product needs very fast turnaround on short speech clips without building custom backend infrastructure.

### Deepgram, AssemblyAI, OpenRouter

The other cloud integrations broaden user choice:

- Deepgram is the clean prerecorded-STT path with smart formatting and language detection
- AssemblyAI uses an upload-and-poll workflow and is likely the slowest-feeling provider in UI terms
- OpenRouter is the most experimental path because it uses Gemini audio input through a chat-completions style API rather than a dedicated STT endpoint

The important architectural point is that all of them fit under the same Dictate workflow.

## 13. Desktop Utility Decisions

Three choices are especially important:

### Separate Pill Window

The pill is its own always-on-top utility window. That keeps dictation feedback visible without disturbing the main dashboard.

### Non-Activating Overlay

The pill does not take focus. That matters because a dictation tool must preserve the user’s target input field in another app.

### Clipboard-Based Paste

Autopaste is implemented through clipboard write plus `Ctrl+V`. It is pragmatic and cross-app friendly, but it is also Windows-only and dependent on focus and clipboard behavior.

## 14. Results

The current repo already delivers a coherent product slice:

- hold-to-talk dictation works
- local and cloud paths share one flow
- model install/select/delete works
- CPU and CUDA runtime switching works
- tray, autostart, icons, and pill behaviors are implemented
- settings and history are persisted

The architecture is also coherent: main process owns truth, renderer stays thin, sidecar isolates ML dependencies, and the model catalog drives both UI and runtime behavior. This is no longer just a demo.

## 15. Risks And Gaps

The main current gaps are:

- TensorRT is not configured yet
- provider API keys are not stored in an OS secret store
- the project does not yet have a real automated test layer
- cloud dictation is not live-streaming
- OpenRouter speech is less direct than dedicated STT APIs
- Windows is the primary supported platform

NVIDIA-specific gaps:

- Parakeet is not yet used for timestamps or streaming in the product
- the app does not yet exploit TensorRT, NIM, or Riva paths
- the Windows-first app and Linux-first Parakeet model guidance create some deployment risk

## 16. Recommended Next Steps

If this app is being prepared for a formal deep-dive review or the next implementation cycle, the highest-value next steps are:

1. Add benchmark instrumentation across Moonshine, Parakeet, Canary, Groq, Deepgram, and AssemblyAI.
2. Move provider key storage to a platform secret store.
3. Add regression tests for settings persistence, provider configuration, and job history.
4. Decide whether the NVIDIA path remains PyTorch-first or begins a TensorRT/NIM migration.
5. Expose richer capabilities only where they materially help the product, especially Parakeet timestamps and better diagnostics.

## 17. Key Files

The most important internal files are:

- `dictate-app/src/bun/index.ts`
- `dictate-app/src/bun/sidecar.ts`
- `dictate-app/src/bun/storage.ts`
- `dictate-app/src/bun/provider-store.ts`
- `dictate-app/src/shared/models.ts`
- `dictate-app/src/shared/rpc.ts`
- `dictate-app/sidecar/worker.py`
- `dictate-app/sidecar/bootstrap.ps1`
- `dictate-app/src/mainview/state/useDictateRuntime.ts`
- `dictate-app/src/mainview/components/dashboard/view-model.ts`

## 18. Sources Reviewed

NVIDIA:

- NVIDIA NeMo Speech docs: https://docs.nvidia.com/nemo/speech/nightly/starthere/best-practices.html
- NVIDIA NeMo Framework Speech AI docs: https://docs.nvidia.com/nemo-framework/user-guide/latest/speech_ai/index.html
- NVIDIA Parakeet-TDT-0.6B-v3 model card: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3
- NVIDIA Canary-Qwen-2.5B model card: https://huggingface.co/nvidia/canary-qwen-2.5b

Groq:

- GroqCloud: https://groq.com/groqcloud
- Groq Whisper Large v3 Turbo docs: https://console.groq.com/docs/model/whisper-large-v3-turbo
- Groq Whisper Large v3 docs: https://console.groq.com/docs/model/whisper-large-v3
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Groq speculative decoding/chip post: https://groq.com/blog/groq-first-generation-14nm-chip-just-got-a-6x-speed-boost-introducing-llama-3-1-70b-speculative-decoding-on-groqcloud
- Groq TSP paper page: https://groq.com/isca-2020-conference/
- Groq TruePoint tech doc: https://groq.com/GroqDocs/TechDoc_Accuracy.pdf

Project:

- root `README.md`
- `docs/plans/2026-03-25-main-window-redesign-design.md`
- `docs/plans/2026-03-25-stitch-native-utility-redesign-design.md`

## 19. Final Assessment

Dictate is a good example of a product that kept the scope small and the engineering aligned with that scope.

The core technical story is not just that it uses speech models. It is that it uses the right inference path for each layer:

- Moonshine for practical CPU-local dictation
- NVIDIA NeMo plus CUDA for higher-end local GPU inference
- Groq for fast cloud speech transcription
- other cloud providers for optional tradeoff-based BYOK usage

That makes the app credible both as a usable utility and as a technical case study.
