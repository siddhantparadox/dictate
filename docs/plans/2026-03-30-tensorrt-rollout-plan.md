# TensorRT Rollout Plan

Date: 2026-03-30

## Goal
Add TensorRT as an optional acceleration path for supported NVIDIA local models without making Dictate less reliable for users who only have CPU or standard CUDA PyTorch available.

## Current State
- Dictate supports local CPU and CUDA PyTorch inference paths today.
- TensorRT is represented in local model metadata, but there is no TensorRT install, engine build, cache, or runtime execution path in the app yet.
- NVIDIA local models currently run through the NeMo/PyTorch sidecar path.

## Product Principles
- Keep `PyTorch CUDA` as the stable baseline for NVIDIA models.
- Make TensorRT additive, never required.
- Prefer `Auto` behavior over forcing users to understand backend details.
- Do not show broken or unavailable TensorRT controls on unsupported hardware.
- Always fall back safely to PyTorch CUDA when TensorRT is unavailable or fails.

## Expected User Value
- Lower steady-state transcription latency on supported NVIDIA GPUs.
- Better throughput for repeated local dictation sessions after engine build.
- Clearer advanced runtime status for users who care about GPU optimization.

## Expected Tradeoffs
- First-time engine build can take several minutes.
- Engine files consume additional disk space under `.dictateapp`.
- Engine compatibility is narrower than PyTorch:
  - same OS family
  - compatible GPU family / compute capability
  - compatible TensorRT version
- Build-time GPU and memory pressure will increase.

## Scope

### In Scope
- TensorRT capability detection in the Bun main process and sidecar
- TensorRT install status surfaced in the app
- Engine build and cache management for supported NVIDIA local models
- Runtime selection with `Auto`, `PyTorch CUDA`, and `TensorRT`
- Automatic fallback to PyTorch CUDA when TensorRT is not usable
- UI messaging for engine build, reuse, and fallback

### Out of Scope
- TensorRT for CPU models
- TensorRT for cloud providers
- Multi-engine profile management in v1
- Canary support before Parakeet proves out

## Recommended v1 Target
- Prototype and ship TensorRT for `nvidia/parakeet-tdt-0.6b-v3` first.
- Keep `nvidia/canary-qwen-2.5b` on PyTorch CUDA until export, accuracy, and runtime stability are proven.

## Implementation Phases

### Phase 1: Detection and Status
- Detect whether TensorRT Python/runtime packages are installed in the CUDA sidecar environment.
- Capture TensorRT version, CUDA runtime state, and compatible NVIDIA GPU presence.
- Surface a real status in the snapshot:
  - `unsupported`
  - `not_installed`
  - `installed_no_engine`
  - `ready`
  - `error`
- Update UI copy so it reflects real status instead of generic `not available`.

### Phase 2: Engine Build Pipeline
- Add a sidecar task to build a TensorRT engine for a supported model.
- Cache built engines under a deterministic path, for example:
  - `.dictateapp/tensorrt/<model-id>/<gpu-key>/<tensorrt-version>/engine.plan`
- Include engine metadata alongside the plan file:
  - model id
  - TensorRT version
  - CUDA version
  - GPU name / compute capability key
  - build timestamp
- Rebuild when compatibility inputs change.

### Phase 3: Runtime Execution
- Add a TensorRT inference path in the sidecar for models with a valid cached engine.
- Keep the current PyTorch CUDA path intact as fallback.
- If TensorRT engine load or execution fails:
  - log the exact error
  - mark TensorRT status degraded
  - fall back to PyTorch CUDA automatically

### Phase 4: UX and Controls
- Add an advanced engine selector for supported NVIDIA models:
  - `Auto`
  - `PyTorch CUDA`
  - `TensorRT`
- Default to `Auto`.
- In `Auto` mode:
  - use TensorRT when a valid engine exists
  - otherwise use PyTorch CUDA
- Show a `Build TensorRT engine` action only when:
  - CUDA runtime is active
  - TensorRT is installed
  - the selected model supports TensorRT
- Show build progress and cache reuse status in the local model row.

### Phase 5: Validation
- Compare first-token / full-transcript latency between PyTorch CUDA and TensorRT.
- Compare transcription quality on a small internal benchmark set before enabling by default.
- Verify behavior across:
  - cold start
  - warm start
  - engine rebuild
  - driver/runtime mismatch
  - engine corruption

## UX Notes
- TensorRT should live in an advanced subsection of supported NVIDIA model rows, not as a global top-level app toggle.
- Users without NVIDIA GPUs should not see actionable TensorRT controls.
- Users with NVIDIA GPUs but no TensorRT installed should see a neutral status such as `TensorRT not installed`.
- Users should not lose dictation capability because TensorRT is missing or broken.

## Fallback Rules
- No NVIDIA GPU: stay on CPU-compatible models only.
- NVIDIA GPU + CUDA active + no TensorRT: use PyTorch CUDA.
- NVIDIA GPU + TensorRT installed + no engine: use PyTorch CUDA until engine is built.
- NVIDIA GPU + TensorRT engine load failure: fall back to PyTorch CUDA and surface a warning.

## Open Questions
- What is the cleanest export/build path for Parakeet in this sidecar architecture?
- Does Canary have a practical TensorRT path worth shipping, or should it remain PyTorch-only?
- Should TensorRT engine building happen on explicit user action only, or also opportunistically after model install?

## Recommended Next Steps
1. Add TensorRT install detection and snapshot status.
2. Update the UI to surface `Not installed` / `Ready` / `Build required` states.
3. Prototype Parakeet-only engine build and execution behind an experimental flag.
4. Benchmark latency and transcript quality against the current PyTorch CUDA path.

## Reference Docs
- NVIDIA TensorRT Installation Guide
- NVIDIA TensorRT Support Matrix
- NVIDIA TensorRT: How TensorRT Works
- NVIDIA NIM Riva ASR Getting Started
