"""HTTP contract checks for the deployed PhaseAtlas WSGI application.

Run from the repository root: python -m unittest discover -s tests -p test_server.py
"""
from pathlib import Path
import tempfile
import unittest

from app import create_app


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_homepage_is_english_and_head_works(self):
        with self.client.get("/") as response:
            self.assertEqual(response.status_code, 200)
            self.assertIn(b'<html lang="en">', response.data)
            self.assertIn(b'PhaseAtlas', response.data)
            self.assertEqual(response.mimetype, "text/html")
        with self.client.head("/") as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b"")

    def test_worker_modules_have_javascript_mime(self):
        for url in ("/app.js", "/worker.js", "/science.js", "/refinement.js", "/studio.js", "/studio-worker.js", "/studio-solver.js", "/studio-expression.js", "/studio-presets.js"):
            with self.subTest(url=url), self.client.get(url) as response:
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.mimetype, "text/javascript")
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_health_checks_the_deployable_assets(self):
        with self.client.get("/healthz") as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {"service": "PhaseAtlas", "status": "ok"})
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        with tempfile.TemporaryDirectory() as empty:
            with create_app(empty).test_client().get("/healthz") as response:
                self.assertEqual(response.status_code, 503)

    def test_downloads_and_video_range_requests(self):
        for url in ("/studio.html", "/studio.css", "/downloads/studio_reference.py", "/downloads/phaseatlas-research.zip", "/downloads/PhaseAtlas_Project_Brief.pdf", "/data/verification.json"):
            with self.subTest(url=url), self.client.get(url) as response:
                self.assertEqual(response.status_code, 200)
                self.assertGreater(len(response.data), 100)
        with self.client.get("/downloads/PhaseAtlas_Cubic_Demo.webm", headers={"Range": "bytes=0-15"}) as response:
            self.assertEqual(response.status_code, 206)
            self.assertEqual(response.mimetype, "video/webm")
            self.assertEqual(len(response.data), 16)

    def test_repository_files_and_traversal_are_not_served(self):
        for url in ("/app.py", "/requirements.txt", "/.git/config", "/.openai/hosting.json", "/.archive/migration-manifest.json", "/../README.md", "/%2e%2e/README.md", "/%2e%2e%5cREADME.md", "/missing-file.js"):
            with self.subTest(url=url), self.client.get(url) as response:
                self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
