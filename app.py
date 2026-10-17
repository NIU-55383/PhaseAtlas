"""PhaseAtlas WSGI application, served by Gunicorn on Render.

The browser still performs the scientific computation. This server delivers
the web assets and provides an application health check for deployment.
"""
from pathlib import Path
import mimetypes

from flask import Flask, jsonify


def create_app(static_dir=None):
    web_root = Path(static_dir) if static_dir is not None else Path(__file__).resolve().parent / "dist"
    # Module workers require a JavaScript MIME type on every host platform.
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("text/javascript", ".mjs")
    mimetypes.add_type("video/webm", ".webm")
    application = Flask(__name__, static_folder=str(web_root.resolve()), static_url_path="")

    @application.get("/")
    def index():
        return application.send_static_file("index.html")

    @application.get("/healthz")
    def health():
        ready = (Path(application.static_folder) / "index.html").is_file()
        response = jsonify(service="PhaseAtlas", status="ok" if ready else "unavailable")
        response.headers["Cache-Control"] = "no-store"
        return response, 200 if ready else 503

    @application.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    return application


app = create_app()
