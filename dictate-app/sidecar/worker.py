from __future__ import annotations

import json
import os
import sys
import tempfile
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

_moonshine_cache: ModelCache = {}
_nemo_cache: ModelCache = {}


def write_response(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def response_ok(request_id: str, text: str, latency_ms: int) -> None:
    write_response(
        {
            "request_id": request_id,
            "ok": True,
            "result": {
                "text": text,
                "latency_ms": max(latency_ms, 1),
            },
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


def _extract_text(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, list) and result:
        return _extract_text(result[0])
    if isinstance(result, dict):
        if "text" in result:
            return str(result["text"]).strip()
    text_attr = getattr(result, "text", None)
    if text_attr is not None:
        return str(text_attr).strip()
    return str(result).strip()


def _record_microphone(duration_seconds: float, sample_rate: int = 16000):
    try:
        import numpy as np
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


def handle_transcribe(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    input_text = str(params.get("input_text", "")).strip()
    if not input_text:
        input_text = "Dictate sidecar default transcript."
    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(request_id, input_text, latency_ms)


def handle_transcribe_microphone(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    model_id = str(params.get("model_id", "")).strip()
    if not model_id:
        raise RuntimeError("model_id is required.")

    duration_seconds = float(params.get("duration_seconds", 7.0))
    audio, sample_rate = _record_microphone(duration_seconds=duration_seconds)
    text = _transcribe_audio(model_id, audio, sample_rate)

    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(request_id, text, latency_ms)


def handle_prepare_model(request_id: str, params: dict[str, Any]) -> None:
    start = time.perf_counter()
    model_id = str(params.get("model_id", "")).strip()
    if not model_id:
        raise RuntimeError("model_id is required.")

    _prepare_model(model_id)
    latency_ms = int((time.perf_counter() - start) * 1000)
    response_ok(request_id, "Model is installed and ready.", latency_ms)


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
            elif method == "prepare_model":
                handle_prepare_model(request_id, payload_params)
            else:
                response_error(request_id, f"Unsupported method: {method}")
        except Exception as exc:  # noqa: BLE001
            response_error(request_id, str(exc))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
