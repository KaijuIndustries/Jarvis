#!/usr/bin/env python3
"""LAN-only openWakeWord service for the Jarvis /orb prototype."""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np

PHRASE = "Hey Friday"
FRAME_SAMPLES = 1280
MAX_BODY_BYTES = 32 * 1024
SESSION_IDLE_SECONDS = 60.0
DEFAULT_THRESHOLD = 0.5
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 10400


def repo_model_path() -> Path:
    here = Path(__file__).resolve().parent
    return Path(
        os.environ.get(
            "WAKEWORD_MODEL",
            here.parent / "models" / "hey_friday.onnx",
        )
    )


def load_detector():
    model_path = repo_model_path()
    if not model_path.is_file():
        raise FileNotFoundError(
            f"Hey Friday model not found at {model_path}. "
            "Place hey_friday.onnx in models/ or set WAKEWORD_MODEL."
        )

    import openwakeword
    from openwakeword.model import Model

    openwakeword.utils.download_models()
    return Model(
        wakeword_models=[str(model_path)],
        inference_framework="onnx",
    )


class WakeRuntime:
    def __init__(self, model, threshold: float, cooldown_seconds: float) -> None:
        self.model = model
        self.threshold = threshold
        self.cooldown_seconds = cooldown_seconds
        self.lock = threading.Lock()
        self.session_id = ""
        self.pending = np.zeros(0, dtype=np.int16)
        self.last_seen = time.monotonic()
        self.last_wake = 0.0

    def reset_session(self, session_id: str) -> None:
        self.session_id = session_id
        self.pending = np.zeros(0, dtype=np.int16)
        self.model.reset()
        self.last_seen = time.monotonic()

    def feed(self, session_id: str, pcm: bytes) -> dict[str, Any]:
        if not session_id:
            return {"type": "error", "error": "Missing wake session."}
        if len(pcm) % 2 != 0:
            pcm = pcm[:-1]
        if not pcm:
            return {"type": "ok"}

        samples = np.frombuffer(pcm, dtype=np.int16).copy()
        now = time.monotonic()
        with self.lock:
            if session_id != self.session_id:
                self.reset_session(session_id)
            elif now - self.last_seen > SESSION_IDLE_SECONDS:
                self.reset_session(session_id)
            self.last_seen = now
            self.pending = np.concatenate([self.pending, samples])

            best = 0.0
            detected = False
            while self.pending.size >= FRAME_SAMPLES:
                frame = self.pending[:FRAME_SAMPLES]
                self.pending = self.pending[FRAME_SAMPLES:]
                scores = self.model.predict(frame)
                score = friday_score(scores)
                if score > best:
                    best = score
                if score >= self.threshold:
                    detected = True

            if detected and now - self.last_wake >= self.cooldown_seconds:
                self.last_wake = now
                return {"type": "wake", "phrase": PHRASE, "score": round(best, 4)}
            return {"type": "ok"}


def friday_score(scores: dict[str, Any]) -> float:
    best = 0.0
    for name, value in scores.items():
        if "friday" not in str(name).lower():
            continue
        try:
            score = float(np.max(value) if hasattr(value, "__len__") else value)
        except (TypeError, ValueError):
            continue
        if score > best:
            best = score
    return best


class WakeHandler(BaseHTTPRequestHandler):
    runtime: WakeRuntime

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/health":
            self._json(404, {"error": "Not found."})
            return
        model_path = repo_model_path()
        self._json(
            200,
            {
                "ok": True,
                "phrase": PHRASE,
                "model": model_path.name,
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/audio":
            self._json(404, {"error": "Not found."})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length < 0 or length > MAX_BODY_BYTES:
            self._json(413, {"type": "error", "error": "Audio chunk is too large."})
            return
        pcm = self.rfile.read(length) if length else b""
        session_id = (self.headers.get("X-Jarvis-Wake-Session") or "").strip()
        try:
            result = self.runtime.feed(session_id, pcm)
        except Exception as error:  # noqa: BLE001
            sys.stderr.write(f"wake predict failed: {error}\n")
            self._json(500, {"type": "error", "error": "Wake detection failed."})
            return
        status = 400 if result.get("type") == "error" else 200
        self._json(status, result)


def serve(runtime: WakeRuntime) -> None:
    host = os.environ.get("WAKEWORD_HOST", DEFAULT_HOST)
    port = int(os.environ.get("WAKEWORD_PORT", str(DEFAULT_PORT)))
    WakeHandler.runtime = runtime
    server = ThreadingHTTPServer((host, port), WakeHandler)
    sys.stderr.write(
        f"jarvis-wake listening on {host}:{port} for {PHRASE} ({repo_model_path()})\n"
    )
    server.serve_forever()


def main() -> int:
    threshold = float(os.environ.get("WAKEWORD_THRESHOLD", str(DEFAULT_THRESHOLD)))
    cooldown = float(os.environ.get("WAKEWORD_COOLDOWN", "3"))
    try:
        model = load_detector()
    except Exception as error:  # noqa: BLE001
        sys.stderr.write(f"jarvis-wake failed to start: {error}\n")
        return 1
    runtime = WakeRuntime(model, threshold=threshold, cooldown_seconds=cooldown)
    if "--check" in sys.argv:
        print("ok")
        return 0
    serve(runtime)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
