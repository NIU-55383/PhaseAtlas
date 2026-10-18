@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:8768/ in Edge or Chrome.
echo If the recorder is already running, use that existing page.
python recorder.py --port 8768
pause
