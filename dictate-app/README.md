# React + Tailwind + Vite Electrobun Template

A fast Electrobun desktop app template with React, Tailwind CSS, and Vite for hot module replacement (HMR).

## Getting Started

```bash
# Install dependencies
bun install

# Recommended: create isolated CPU sidecar env
pwsh -File sidecar/bootstrap.ps1

# Optional: create CUDA sidecar env (NVIDIA acceleration)
pwsh -File sidecar/bootstrap.ps1 -Runtime cuda

# Optional: create both CPU + CUDA envs
pwsh -File sidecar/bootstrap.ps1 -Runtime both

# Development without HMR (uses bundled assets)
bun run dev

# Development with HMR (recommended)
bun run dev:hmr

# Build for production
bun run build

# Build for production release
bun run build:prod
```

## How HMR Works

When you run `bun run dev:hmr`:

1. **Vite dev server** starts on `http://localhost:5173` with HMR enabled
2. **Electrobun** starts and detects the running Vite server
3. The app loads from the Vite dev server instead of bundled assets
4. Changes to React components update instantly without full page reload

When you run `bun run dev` (without HMR):

1. Electrobun starts and loads from `views://mainview/index.html`
2. You need to rebuild (`bun run build`) to see changes

## Project Structure

```
├── src/
│   ├── bun/
│   │   └── index.ts        # Main process (Electrobun/Bun)
│   └── mainview/
│       ├── App.tsx         # React app component
│       ├── main.tsx        # React entry point
│       ├── index.html      # HTML template
│       └── index.css       # Tailwind CSS
├── electrobun.config.ts    # Electrobun configuration
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind configuration
└── package.json
```

## Customizing

- **React components**: Edit files in `src/mainview/`
- **Tailwind theme**: Edit `tailwind.config.js`
- **Vite settings**: Edit `vite.config.ts`
- **Window settings**: Edit `src/bun/index.ts`
- **App metadata**: Edit `electrobun.config.ts`

## Dictation MVP Notes

- Global hotkey and tray action run microphone dictation.
- Sidecar runtime selection is controlled from `Settings -> ASR Acceleration`.
- If CUDA is selected and not installed, use the in-app button:
  - `Settings -> ASR Acceleration -> Install NVIDIA Acceleration`
- Runtime detection order:
  - `PYTHON_BIN` (global override)
  - CPU mode: `sidecar/.venv-cpu/Scripts/python.exe`, then `sidecar/.venv/Scripts/python.exe`
  - CUDA mode: `sidecar/.venv-cuda/Scripts/python.exe`
- Python sidecar model backends:
  - `UsefulSensors/moonshine-streaming-medium`
  - `UsefulSensors/moonshine-streaming-tiny`
  - `nvidia/parakeet-tdt-0.6b-v3`
  - `nvidia/canary-qwen-2.5b`
- App runtime auto-heals `hf_xet` in sidecar envs on startup/runtime switch for faster HF downloads.
- Model/cache storage location:
  - Default: `%USERPROFILE%\\.dictateapp\\models\\huggingface\\hub`
  - Override root with env var: `DICTATE_HOME`
