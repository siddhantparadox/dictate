# Dictate

Minimal voice typing for desktop.

Hold `Ctrl+Shift`, speak, release, and Dictate transcribes locally into the active text field. The project is intentionally narrow: fast hold-to-talk dictation with clean model management, low-friction setup, and no extra workflow.

## What It Is

Dictate is a Windows-first desktop app built with:

- Electrobun for the desktop shell
- React for the app UI
- A Python sidecar for speech recognition
- Local ASR models from Moonshine and NVIDIA
- Optional cloud transcription through Groq, Deepgram, AssemblyAI, and OpenRouter with bring-your-own API key flows

The app is designed around one primary interaction:

1. Focus any text box in any app.
2. Hold `Ctrl+Shift`.
3. Speak while the pill is visible.
4. Release the hotkey.
5. Dictate transcribes and auto-pastes the result.

## Current Scope

- Local, on-device transcription
- Optional Groq, Deepgram, AssemblyAI, and OpenRouter cloud transcription with saved local API key configuration
- Global hotkey: `Ctrl+Shift`
- Live pill overlay while recording
- Model download, warm-up, selection, and deletion
- Local and cloud model selection from the `Models` page
- CPU and NVIDIA CUDA runtime modes
- Recent transcription history
- Light and dark glassmorphism UI

## Usage

### First Run

1. Open Dictate.
2. Go to `Models`.
3. Choose `Local` or `Cloud`.
4. For `Local`, download the model you want to use.
5. For `Cloud`, connect Groq, Deepgram, AssemblyAI, or OpenRouter with your API key and select a cloud model.
6. Keep `ASR Acceleration` on `Auto` unless you specifically want to force `CPU` or `CUDA`.
7. Select the model you want as default.

Groq setup:

- Get an API key from [Groq API Keys](https://console.groq.com/keys/)
- Groq docs overview: [Groq Docs](https://console.groq.com/docs/overview)

Deepgram setup:

- Create a key in [Deepgram Console](https://console.deepgram.com/)
- Deepgram docs home: [Deepgram Docs](https://developers.deepgram.com/home)
- New Deepgram accounts currently include `$200` of free credit: [Deepgram Pricing](https://deepgram.com/pricing)

AssemblyAI setup:

- Create a key in [AssemblyAI Dashboard](https://www.assemblyai.com/dashboard)
- AssemblyAI docs home: [AssemblyAI Docs](https://www.assemblyai.com/docs)
- AssemblyAI trial accounts currently include `$50` in free credits: [AssemblyAI Support](https://support.assemblyai.com/articles/5370767329-can-i-sign-up-for-free)

OpenRouter setup:

- Create a key in [OpenRouter Keys](https://openrouter.ai/settings/keys)
- OpenRouter docs home: [OpenRouter Docs](https://openrouter.ai/docs/overview)
- Dictate currently exposes one fixed OpenRouter speech model: `google/gemini-3.1-flash-lite-preview:nitro`

### Dictation Flow

1. Put the cursor in a text field.
2. Hold `Ctrl+Shift`.
3. Speak.
4. Release `Ctrl+Shift`.
5. Dictate transcribes and sends the text into the active field.

### What the UI Shows

- `Overview`: current model, runtime state, latest transcript, warnings, and readiness
- `History`: recent transcription jobs and outcomes
- `Models`: local vs cloud model source, install state, Groq, Deepgram, AssemblyAI, and OpenRouter connection state, and select/delete actions
- `Settings`: acceleration mode, appearance, paste behavior, and debug flags

## Models

### Local Models

| Model | Runtime | Size | Notes |
| --- | --- | --- | --- |
| `Moonshine Tiny Streaming` | CPU | `176 MB` | Fast fallback model for lower-end hardware |
| `Moonshine Medium Streaming` | CPU | `1.06 GB` | Balanced default for local CPU dictation |
| `NVIDIA Parakeet-TDT-0.6B-v3` | NVIDIA GPU | `2.51 GB` | Multilingual model with strong GPU accuracy |
| `NVIDIA Canary-Qwen-2.5B` | NVIDIA GPU | `5.12 GB` | Larger English model for stronger NVIDIA GPUs |

### Cloud Models

Cloud transcription is optional and uses your own provider API key.

| Provider | Model | Notes |
| --- | --- | --- |
| `Groq` | `whisper-large-v3-turbo` | Recommended default for cloud dictation: faster and lower cost |
| `Groq` | `whisper-large-v3` | Higher accuracy option with translation support |
| `Deepgram` | `nova-3` | Recommended Deepgram default for prerecorded BYOK dictation |
| `Deepgram` | `nova-2` | Deepgram compatibility fallback |
| `AssemblyAI` | `universal-3-pro` | Recommended AssemblyAI default for BYOK dictation with automatic `universal-2` fallback |
| `AssemblyAI` | `universal-2` | Standalone AssemblyAI fallback for broad language coverage |
| `OpenRouter` | `google/gemini-3.1-flash-lite-preview:nitro` | Fixed Gemini audio-input path through OpenRouter's Nitro routing |

## Runtime Modes

- `Auto`: prefers CUDA when a working CUDA sidecar runtime is available, otherwise falls back to CPU
- `CPU`: forces the CPU sidecar runtime
- `CUDA`: requests the CUDA sidecar runtime and warns if it is unavailable

Important:

- GPU models require compatible NVIDIA hardware.
- TensorRT is not configured in the current build. NVIDIA models currently run on the PyTorch CUDA path.
- The first transcription after launch can be slower because the selected model has to warm up.

## Development Setup

### Prerequisites

- Bun
- Python 3 available on `PATH`
- PowerShell 7 on Windows
- Optional: NVIDIA GPU for CUDA acceleration

### Install

From the repository root:

```bash
bun install
pwsh -File dictate-app/sidecar/bootstrap.ps1
```

Optional CUDA runtime setup:

```bash
pwsh -File dictate-app/sidecar/bootstrap.ps1 -Runtime cuda
```

Optional setup for both CPU and CUDA runtimes:

```bash
pwsh -File dictate-app/sidecar/bootstrap.ps1 -Runtime both
```

### Run

Recommended development mode:

```bash
bun run dev:hmr
```

This starts:

- the Vite dev server for the React UI
- the Electrobun desktop process

## Quality Gates

From the repository root:

```bash
bun run typecheck
bun run lint
bun run --cwd dictate-app build:canary
```

## Data and Model Storage

By default, Dictate stores model assets under:

```text
%USERPROFILE%\.dictateapp
```

Key locations:

- Hugging Face cache: `%USERPROFILE%\.dictateapp\models\huggingface\hub`
- Moonshine cache: `%USERPROFILE%\.dictateapp\models\moonshine`
- Torch cache: `%USERPROFILE%\.dictateapp\torch`
- Cloud provider config: `%USERPROFILE%\.dictateapp\providers.json`

You can override the root with:

```text
DICTATE_HOME
```

App settings and transcription history are stored in the app user data directory in a local SQLite database. Groq, Deepgram, AssemblyAI, and OpenRouter BYO-key configuration is stored separately under `.dictateapp\providers.json`.

## Repository Layout

```text
dictate-app/
  src/
    bun/         Main process, hotkey handling, runtime orchestration
    mainview/    React UI
    shared/      Shared model catalog and RPC types
  sidecar/       Python transcription worker and runtime bootstrap
```

## Known Limitations

- Windows is the primary supported platform today.
- Auto-paste is currently Windows-only and uses clipboard + `Ctrl+V`.
- `Launch on startup` is implemented on Windows via the current user's `Run` registry entry and opens tray-first on login.
- GPU acceleration depends on the installed sidecar runtime, CUDA availability, and compatible hardware.

## Contributing

The project is still being hardened for public collaboration. If you open issues or pull requests, include:

- Windows version
- CPU and GPU details
- selected model
- acceleration mode
- reproduction steps

## License

See [LICENSE](./LICENSE).
