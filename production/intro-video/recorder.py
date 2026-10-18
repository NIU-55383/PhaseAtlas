"""Local, user-operated microphone recorder. No third-party requests or uploads."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import io
import json
import secrets
import wave
from datetime import datetime

ROOT = Path(__file__).resolve().parent
TOKEN = secrets.token_urlsafe(32)
MAX_BYTES = 32 * 1024 * 1024

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type="application/json"):
        payload = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/":
            page = (ROOT / "recorder.html").read_text(encoding="utf-8")
            self.respond(200, page.replace("__LOCAL_TOKEN__", TOKEN), "text/html; charset=utf-8")
        elif self.path == "/health":
            self.respond(200, '{"ok":true,"scope":"localhost only"}')
        else:
            self.respond(404, '{"error":"Not found"}')

    def do_POST(self):
        expected_origin = f"http://127.0.0.1:{self.server.server_port}"
        if (self.path != "/save" or self.headers.get("Origin") != expected_origin
                or self.headers.get("X-Recording-Token") != TOKEN):
            self.respond(403, '{"error":"Use the local recording page"}')
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 44 <= size <= MAX_BYTES:
                raise ValueError("Recording size is invalid")
            data = self.rfile.read(size)
            with wave.open(io.BytesIO(data), "rb") as audio:
                duration = audio.getnframes() / audio.getframerate()
                if (audio.getnchannels() != 1 or audio.getsampwidth() != 2
                        or not 8000 <= audio.getframerate() <= 96000
                        or not 1 <= duration <= 151):
                    raise ValueError("Expected a mono 16-bit WAV recording, 1 to 150 seconds long")
                rate = audio.getframerate()
            target_dir = ROOT / "private" / "voice"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"niu-te-sample-{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(2)}.wav"
            with target.open("xb") as output:
                output.write(data)
            self.respond(200, json.dumps({"saved": True, "path": str(target),
                "duration": round(duration, 2), "sampleRate": rate, "bytes": size}))
        except (ValueError, wave.Error, EOFError) as error:
            self.respond(400, json.dumps({"error": str(error)}))

    def log_message(self, format, *args):
        print(f"{self.log_date_time_string()} {format % args}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8768)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"PhaseAtlas private recorder: http://127.0.0.1:{args.port}/", flush=True)
    server.serve_forever()
