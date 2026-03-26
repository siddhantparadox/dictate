from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import threading
import time
from typing import Any

ModelCache = dict[str, Any]

MOONSHINE_MODELS = {
    "UsefulSensors/moonshine-streaming-medium",
    "UsefulSensors/moonshine-streaming-tiny",
}
PARAKEET_MODEL = "nvidia/parakeet-tdt-0.6b-v3"
CANARY_MODEL = "nvidia/canary-qwen-2.5b"
SUPPORTED_MODELS = {PARAKEET_MODEL, CANARY_MODEL, *MOONSHINE_MODELS}
MAX_LIVE_CAPTURE_SECONDS = 45.0
PREPARE_PROGRESS_EVENT = "prepare_model_progress"
MICROPHONE_LEVEL_EVENT = "microphone_level"
DOWNLOAD_PROGRESS_POLL_SECONDS = 0.35
PREPARE_LOADING_STALE_POLLS = 4
MIC_LEVEL_EMIT_INTERVAL_SECONDS = 0.025
MIC_LEVEL_NOISE_FLOOR = 0.015
MIC_LEVEL_GAIN = 18.0
MIC_LEVEL_CURVE = 0.65

_moonshine_cache: ModelCache = {}
_nemo_cache: ModelCache = {}
_stdout_lock = threading.Lock()


def write_response(payload: dict[str, Any]) -> None:
    with _stdout_lock:
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()


def response_ok(request_id: str, result: dict[str, Any]) -> None:
    write_response(
        {
            "request_id": request_id,
            "ok": True,
            "result": result,
        }
    )


def response_error(request_id: str, error: str) -> None:
    write_response(
        {
            "request_id": request_id,
            "ok": False,
            "error": error,
        }
    )


def _hf_root_dir() -> str:
    home = os.path.expanduser("~")
    hf_home = os.environ.get("HF_HOME", "").strip()
    if hf_home:
        return hf_home
    return os.path.join(home, ".cache", "huggingface")


def _hf_repo_dir(model_id: str) -> str:
    return os.path.join(
        _hf_root_dir(),
        "hub",
        f"models--{model_id.replace('/', '--')}",
    )


def _directory_size(path: str) -> int:
    if not os.path.exists(path):
        return 0

    total = 0
    for root, _, files in os.walk(path):
        for filename in files:
            file_path = os.path.join(root, filename)
            try:
                total += os.path.getsize(file_path)
            except OSError:
                continue
    return total


def _estimate_hf_model_total_bytes(model_id: str) -> int | None:
    if model_id in MOONSHINE_MODELS:
        return None

    try:
        from huggingface_hub import HfApi
    except Exception:
        return None

    try:
        model_info = HfApi().model_info(model_id, files_metadata=True)
    except Exception:
        return None

    siblings = getattr(model_info, "siblings", None) or []
    total = 0
    found_size = False
    for sibling in siblings:
        size = getattr(sibling, "size", None)
        if isinstance(size, int) and size > 0:
            total += size
            found_size = True

    if not found_size or total <= 0:
        return None
    return total


def _emit_prepare_model_progress(
    model_id: str,
    stage: str,
    message: str,
    downloaded_bytes: int | None = None,
    total_bytes: int | None = None,
) -> None:
    safe_downloaded = (
        max(0, int(downloaded_bytes)) if downloaded_bytes is not None else None
    )
    safe_total = max(0, int(total_bytes)) if total_bytes is not None else None

    progress = None
    if safe_total and safe_total > 0 and safe_downloaded is not None:
        progress = max(0.0, min(1.0, safe_downloaded / safe_total))

    write_response(
        {
            "event": PREPARE_PROGRESS_EVENT,
            "model_id": model_id,
            "stage": stage,
            "message": message,
            "progress": progress,
            "downloaded_bytes": safe_downloaded,
            "total_bytes": safe_total,
        }
    )


def _emit_microphone_level(level: float) -> None:
    safe_level = max(0.0, min(1.0, float(level)))
    write_response(
        {
            "event": MICROPHONE_LEVEL_EVENT,
            "level": safe_level,
            "at_ms": int(time.time() * 1000),
        }
    )


def _extract_text(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, (list, tuple)):
        for item in result:
            text = _extract_text(item)
            if text:
                return text
        return ""
    if isinstance(result, dict):
        for key in ("text", "pred_text", "transcript", "transcripts", "texts"):
            if key not in result:
                continue
            text = _extract_text(result[key])
            if text:
                return text
        return ""

    for attr in ("text", "pred_text", "transcript"):
        text_attr = getattr(result, attr, None)
        if text_attr is None:
            continue
        text = _extract_text(text_attr)
        if text:
            return text

    return str(result).strip()


class MicrophoneCaptureSession:
    def __init__(self, sample_rate: int = 16000, max_duration_seconds: float = 45.0):
        self.sample_rate = sample_rate
        self.max_duration_seconds = min(max(max_duration_seconds, 2.0), 90.0)
        self._stream: Any | None = None
        self._frames: list[Any] = []
        self._frame_limit = int(self.sample_rate * self.max_duration_seconds)
        self._captured_frames = 0
        self._lock = threading.Lock()
        self._started_at = 0.0
        self._latest_level = 0.0
        self._last_level_emit_at = 0.0

    def is_active(self) -> bool:
        return self._stream is not None

    def start(self) -> None:
        if self._stream is not None:
            raise RuntimeError("Microphone capture already in progress.")

        try:
            import sounddevice as sd
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                "Microphone capture dependencies missing. Install sidecar requirements."
            ) from exc
        try:
            import numpy as np
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("NumPy runtime missing. Install sidecar requirements.") from exc

        self._frames = []
        self._captured_frames = 0
        self._started_at = time.perf_counter()
        self._latest_level = 0.0
        self._last_level_emit_at = 0.0
        _emit_microphone_level(0.0)

        def on_audio(indata, frames, _callback_time, status):
            with self._lock:
                if self._captured_frames >= self._frame_limit:
                    return

                remaining = self._frame_limit - self._captured_frames
                chunk = indata[:remaining, :1].copy()
                self._frames.append(chunk)
                self._captured_frames += int(chunk.shape[0])

                chunk_size = int(chunk.shape[0])
                if chunk_size <= 0:
                    return

                rms = float(np.sqrt(np.mean(np.square(chunk[:, 0], dtype=np.float64))))
                linear = max(0.0, min(1.0, rms * MIC_LEVEL_GAIN))
                normalized = linear**MIC_LEVEL_CURVE
                if normalized < MIC_LEVEL_NOISE_FLOOR:
                    normalized = 0.0

                self._latest_level = normalized
                now = time.perf_counter()
                if now - self._last_level_emit_at >= MIC_LEVEL_EMIT_INTERVAL_SECONDS:
                    self._last_level_emit_at = now
                    _emit_microphone_level(self._latest_level)

        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="float32",
            callback=on_audio,
        )
        self._stream.start()

    def stop(self):
        stream = self._stream
        if stream is None:
            raise RuntimeError("Microphone capture is not active.")

        self._stream = None
        try:
            stream.stop()
        finally:
            stream.close()
        _emit_microphone_level(0.0)

        try:
            import numpy as np
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError("NumPy runtime missing. Install sidecar requirements.") from exc

        with self._lock:
            chunks = self._frames
            self._frames = []

        if not chunks:
            raise RuntimeError("No speech detected.")

        audio = np.concatenate(chunks, axis=0).reshape(-1)
        if audio.size == 0:
            raise RuntimeError("No speech detected.")
        peak = float(np.max(np.abs(audio)))
        if peak <= 1e-5:
            raise RuntimeError("No speech detected.")

        capture_ms = int((time.perf_counter() - self._started_at) * 1000)
        return audio, self.sample_rate, max(capture_ms, 1)


_active_microphone_session: MicrophoneCaptureSession | None = None


def _record_microphone(duration_seconds: float, sample_rate: int = 16000):
    try:
        import sounddevice as sd
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Microphone capture dependencies missing. Install sidecar requirements."
        ) from exc

    seconds = min(max(duration_seconds, 1.5), 20.0)
    frame_count = max(int(sample_rate * seconds), sample_rate)
    audio = sd.rec(frame_count, samplerate=sample_rate, channels=1, dtype="float32")
    sd.wait()
    mono = audio.reshape(-1)
    return mono, sample_rate


def _write_temp_wav(audio, sample_rate: int) -> str:
    try:
        import numpy as np
        from scipy.io.wavfile import write as wav_write
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "WAV serialization dependencies missing. Install sidecar requirements."
        ) from exc

    peak = float(np.max(np.abs(audio)))
    if 1e-4 < peak < 0.35:
        gain = min(0.9 / peak, 10.0)
        audio = audio * gain

    clipped = np.clip(audio, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)
    fd, path = tempfile.mkstemp(prefix="dictate-", suffix=".wav")
    os.close(fd)
    wav_write(path, sample_rate, pcm)
    return path


def _moonshine_arch_for_model_id(model_id: str):
    try:
        from moonshine_voice.transcriber import ModelArch
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Moonshine runtime missing. Install 'moonshine-voice'."
        ) from exc

    if model_id == "UsefulSensors/moonshine-streaming-medium":
        return ModelArch.MEDIUM_STREAMING
    if model_id == "UsefulSensors/moonshine-streaming-tiny":
        return ModelArch.TINY_STREAMING
    raise RuntimeError(f"Unsupported Moonshine model_id: {model_id}")


def _extract_moonshine_text(transcript: Any) -> str:
    lines = getattr(transcript, "lines", None)
    if not lines:
        return ""
    text_parts: list[str] = []
    for line in lines:
        line_text = str(getattr(line, "text", "")).strip()
        if line_text:
            text_parts.append(line_text)
    return " ".join(text_parts).strip()


def _load_moonshine_transcriber(model_id: str):
    transcriber = _moonshine_cache.get(model_id)
    if transcriber is not None:
        return transcriber

    try:
        from moonshine_voice import get_model_for_language
        from moonshine_voice.transcriber import Transcriber
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Moonshine runtime missing. Install 'moonshine-voice'."
        ) from exc

    wanted_arch = _moonshine_arch_for_model_id(model_id)
    model_path, resolved_arch = get_model_for_language("en", wanted_arch)
    transcriber = Transcriber(str(model_path), resolved_arch)
    _moonshine_cache[model_id] = transcriber
    return transcriber


def _transcribe_with_moonshine(model_id: str, audio, sample_rate: int) -> str:
    transcriber = _load_moonshine_transcriber(model_id)

    transcript = transcriber.transcribe_without_streaming(
        audio_data=audio.tolist(), sample_rate=sample_rate
    )
    text = _extract_moonshine_text(transcript)
    if not text:
        raise RuntimeError("No speech detected.")
    return text


def _load_parakeet(model_id: str):
    model = _nemo_cache.get(model_id)
    if model is not None:
        return model

    try:
        import nemo.collections.asr as nemo_asr
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "NeMo ASR dependencies missing for Parakeet. Install sidecar requirements."
        ) from exc

    model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_id)
    _nemo_cache[model_id] = model
    return model


def _transcribe_with_parakeet(model_id: str, wav_path: str) -> str:
    model = _load_parakeet(model_id)
    result = model.transcribe([wav_path], batch_size=1)
    text = _extract_text(result)
    if not text:
        result = model.transcribe(
            [wav_path],
            batch_size=1,
            return_hypotheses=True,
        )
        text = _extract_text(result)
    if not text:
        raise RuntimeError("No speech detected.")
    return text


def _load_canary(model_id: str):
    model = _nemo_cache.get(model_id)
    if model is not None:
        return model

    try:
        from nemo.collections.speechlm2.models import SALM
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "NeMo SpeechLM dependencies missing for Canary. Install sidecar requirements."
        ) from exc

    model = SALM.from_pretrained(model_id)
    _nemo_cache[model_id] = model
    return model


def _clean_canary_text(text: str) -> str:
    return (
        text.replace("<|assistant|>", "")
        .replace("<|endoftext|>", "")
        .replace("</s>", "")
        .strip()
    )


def _transcribe_with_canary(model_id: str, wav_path: str) -> str:
    model = _load_canary(model_id)
    audio_tag = getattr(model, "audio_locator_tag", "<audio>")
    prompt = [
        {
            "role": "user",
            "content": f"Transcribe the following audio: {audio_tag}",
            "audio": [wav_path],
        }
    ]
    generated = model.generate(prompts=[prompt], max_new_tokens=256, do_sample=False)
    if not generated:
        raise RuntimeError("No speech detected.")
    raw = model.tokenizer.ids_to_text(generated[0].cpu())
    text = _clean_canary_text(raw)
    if not text:
        raise RuntimeError("No speech detected.")
    return text


def _transcribe_audio(model_id: str, audio, sample_rate: int) -> str:
    if model_id not in SUPPORTED_MODELS:
        raise RuntimeError(f"Unsupported model_id: {model_id}")

    if model_id in MOONSHINE_MODELS:
        return _transcribe_with_moonshine(model_id, audio, sample_rate)

    wav_path = _write_temp_wav(audio, sample_rate)
    try:
        if model_id == PARAKEET_MODEL:
            return _transcribe_with_parakeet(model_id, wav_path)
        if model_id == CANARY_MODEL:
            return _transcribe_with_canary(model_id, wav_path)
    finally:
        try:
            os.remove(wav_path)
        except OSError:
            pass

    raise RuntimeError(f"No transcription backend configured for model_id: {model_id}")


def _prepare_model(model_id: str) -> None:
    if model_id not in SUPPORTED_MODELS:
        raise RuntimeError(f"Unsupported model_id: {model_id}")

    if model_id in MOONSHINE_MODELS:
        _load_moonshine_transcriber(model_id)
        return

    if model_id == PARAKEET_MODEL:
        _load_parakeet(model_id)
        return

    if model_id == CANARY_MODEL:
        _load_canary(model_id)
        return

    raise RuntimeError(f"No prepare pipeline configured for model_id: {model_id}")


def _safe_remove_path(path: str, removed_paths: list[str]) -> None:
    if not os.path.exists(path):
        return
    if os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=False)
    else:
        os.remove(path)
    removed_paths.append(path)


def _delete_model(model_id: str) -> list[str]:
    if model_id not in SUPPORTED_MODELS:
        raise RuntimeError(f"Unsupported model_id: {model_id}")

    _moonshine_cache.pop(model_id, None)
    _nemo_cache.pop(model_id, None)

    removed_paths: list[str] = []
    home = os.path.expanduser("~")
    hf_root = _hf_root_dir()

    hf_repo_dir = os.path.join(
        hf_root,
        "hub",
        f"models--{model_id.replace('/', '--')}",
    )
    _safe_remove_path(hf_repo_dir, removed_paths)

    if model_id in MOONSHINE_MODELS:
        slug = model_id.split("/")[-1].lower()
        moonshine_cache_env = os.environ.get("MOONSHINE_CACHE_DIR", "").strip()
        moonshine_roots = [
            moonshine_cache_env,
            os.path.join(home, ".cache", "moonshine"),
            os.path.join(home, ".cache", "moonshine-voice"),
            os.path.join(hf_root, "hub"),
        ]
        seen: set[str] = set()
        for root in moonshine_roots:
            if not os.path.isdir(root):
                continue
            for entry in os.listdir(root):
                entry_path = os.path.join(root, entry)
                lowered = entry.lower()
                if slug not in lowered:
                    continue
                if entry_path in seen:
                    continue
                seen.add(entry_path)
                _safe_remove_path(entry_path, removed_paths)

    return removed_paths


def handle_transcribe(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    input_text = str(params.get("input_text", "")).strip()
    if not input_text:
        input_text = "Dictate sidecar default transcript."
    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(request_id, {"text": input_text, "latency_ms": max(latency_ms, 1)})


def handle_transcribe_microphone(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    model_id = str(params.get("model_id", "")).strip()
    if not model_id:
        raise RuntimeError("model_id is required.")

    duration_seconds = float(params.get("duration_seconds", 7.0))
    audio, sample_rate = _record_microphone(duration_seconds=duration_seconds)
    text = _transcribe_audio(model_id, audio, sample_rate)

    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(request_id, {"text": text, "latency_ms": max(latency_ms, 1)})


def handle_record_microphone_wav(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    duration_seconds = float(params.get("duration_seconds", 7.0))
    audio, sample_rate = _record_microphone(duration_seconds=duration_seconds)
    wav_path = _write_temp_wav(audio, sample_rate)

    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(
        request_id,
        {
            "wav_path": wav_path,
            "latency_ms": max(latency_ms, 1),
        },
    )


def handle_start_microphone_capture(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    max_duration = float(params.get("max_duration_seconds", MAX_LIVE_CAPTURE_SECONDS))
    global _active_microphone_session

    if _active_microphone_session is not None and _active_microphone_session.is_active():
        raise RuntimeError("Microphone capture already in progress.")

    session = MicrophoneCaptureSession(max_duration_seconds=max_duration)
    session.start()
    _active_microphone_session = session

    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(
        request_id,
        {
            "status": "recording",
            "latency_ms": max(latency_ms, 1),
        },
    )


def handle_finish_microphone_capture(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    model_id = str(params.get("model_id", "")).strip()
    if not model_id:
        raise RuntimeError("model_id is required.")

    global _active_microphone_session
    session = _active_microphone_session
    _active_microphone_session = None

    if session is None or not session.is_active():
        raise RuntimeError("No active microphone capture session.")

    audio, sample_rate, capture_ms = session.stop()
    text = _transcribe_audio(model_id, audio, sample_rate)
    finish_latency_ms = int((time.perf_counter() - start) * 1000)

    response_ok(
        request_id,
        {
            "text": text,
            "latency_ms": max(capture_ms + finish_latency_ms, 1),
        },
    )


def handle_finish_microphone_capture_wav(
    request_id: str, params: dict[str, Any]
) -> None:
    start = time.perf_counter()
    global _active_microphone_session
    session = _active_microphone_session
    _active_microphone_session = None

    if session is None or not session.is_active():
        raise RuntimeError("No active microphone capture session.")

    audio, sample_rate, capture_ms = session.stop()
    wav_path = _write_temp_wav(audio, sample_rate)
    finish_latency_ms = int((time.perf_counter() - start) * 1000)

    response_ok(
        request_id,
        {
            "wav_path": wav_path,
            "latency_ms": max(capture_ms + finish_latency_ms, 1),
        },
    )


def handle_prepare_model(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    model_id = str(params.get("model_id", "")).strip()
    if not model_id:
        raise RuntimeError("model_id is required.")

    total_bytes = _estimate_hf_model_total_bytes(model_id)
    repo_dir = _hf_repo_dir(model_id)
    stop_event = threading.Event()

    _emit_prepare_model_progress(
        model_id,
        "queued",
        "Preparing model download...",
        downloaded_bytes=0,
        total_bytes=total_bytes,
    )

    def monitor_download_progress() -> None:
        last_downloaded = -1
        stale_polls = 0
        loading_announced = False
        while not stop_event.wait(DOWNLOAD_PROGRESS_POLL_SECONDS):
            downloaded = _directory_size(repo_dir)
            if downloaded != last_downloaded:
                last_downloaded = downloaded
                stale_polls = 0
                loading_announced = False
                _emit_prepare_model_progress(
                    model_id,
                    "downloading",
                    "Downloading model files...",
                    downloaded_bytes=downloaded,
                    total_bytes=total_bytes,
                )
                continue

            stale_polls += 1
            if loading_announced or stale_polls < PREPARE_LOADING_STALE_POLLS:
                continue

            loading_announced = True
            _emit_prepare_model_progress(
                model_id,
                "loading",
                "Loading model runtime...",
                downloaded_bytes=downloaded,
                total_bytes=total_bytes,
            )

    monitor_thread = threading.Thread(target=monitor_download_progress, daemon=True)
    monitor_thread.start()

    try:
        _prepare_model(model_id)
    except Exception:
        downloaded = _directory_size(repo_dir)
        _emit_prepare_model_progress(
            model_id,
            "error",
            "Model preparation failed.",
            downloaded_bytes=downloaded,
            total_bytes=total_bytes,
        )
        raise
    finally:
        stop_event.set()
        monitor_thread.join(timeout=1.0)

    downloaded = _directory_size(repo_dir)
    _emit_prepare_model_progress(
        model_id,
        "installed",
        "Model is ready.",
        downloaded_bytes=downloaded,
        total_bytes=total_bytes,
    )
    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(
        request_id,
        {
            "status": "installed",
            "latency_ms": max(latency_ms, 1),
        },
    )


def handle_delete_model(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    model_id = str(params.get("model_id", "")).strip()
    if not model_id:
        raise RuntimeError("model_id is required.")

    removed_paths = _delete_model(model_id)
    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(
        request_id,
        {
            "status": "deleted",
            "latency_ms": max(latency_ms, 1),
            "removed_paths": removed_paths,
        },
    )


def main() -> int:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue

        request_id = str(payload.get("request_id", ""))
        method = str(payload.get("method", ""))
        params = payload.get("params", {})

        if not request_id:
            continue

        payload_params = params if isinstance(params, dict) else {}

        try:
            if method == "transcribe":
                handle_transcribe(request_id, payload_params)
            elif method == "transcribe_microphone":
                handle_transcribe_microphone(request_id, payload_params)
            elif method == "record_microphone_wav":
                handle_record_microphone_wav(request_id, payload_params)
            elif method == "start_microphone_capture":
                handle_start_microphone_capture(request_id, payload_params)
            elif method == "finish_microphone_capture":
                handle_finish_microphone_capture(request_id, payload_params)
            elif method == "finish_microphone_capture_wav":
                handle_finish_microphone_capture_wav(request_id, payload_params)
            elif method == "prepare_model":
                handle_prepare_model(request_id, payload_params)
            elif method == "delete_model":
                handle_delete_model(request_id, payload_params)
            else:
                response_error(request_id, f"Unsupported method: {method}")
        except Exception as exc:  # noqa: BLE001
            response_error(request_id, str(exc))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

