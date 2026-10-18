PHASEATLAS / INTRODUCTION VIDEO / REVISED EDITION

Final deliverable
  output/PhaseAtlas-introduction-v2.mp4
  227 seconds (3:47), 1920 x 1080, 24 fps, H.264 video and AAC narration.
  English captions are burned in and also supplied as SRT.
  Generic synthetic male voice, aiming for a young researcher style.
  This is not a clone of Niu Te's voice. No personal recording is used.

Production files
  storyboard.json          Nine scenes and the full English narration.
  narration-en.txt         Readable English script.
  captions-en.srt          Final synchronized English subtitles.
  captions-aligned.json    Caption intervals used by the renderer.
  render_video.py          Scientific animation renderer.
  generate_ai_narration.py  Local Kokoro am_puck narration generator.
  check_narration.py       Offline speech-recognition check.
  assemble_narration.py    Audio placement and caption alignment.
  master_audio.py          Two-pass loudness normalization.
  assets/                 Actual website screenshots.
  output/                 Ignored renders, clips and verification records.
  private/voice/          Ignored original recordings, unused in this version.

Reproduce
Rendering: Python, numpy, Pillow, fonttools, imageio-ffmpeg; Windows Segoe UI and Cambria Math fonts.
Voice: a separate Python environment with kokoro-onnx==0.6.1, soundfile,
onnxruntime, and faster-whisper for offline transcription checks.
Use Kokoro v1.0 full-precision ONNX and voices-v1.0.bin from the official
model-files-v1.1 release. Exact hashes are recorded in voice-manifest.json.
On Windows, --espeak-data can point to an ASCII-only eSpeak data directory.

  python generate_ai_narration.py --models PATH_TO_MODELS
  python check_narration.py --model small.en
  python assemble_narration.py
  python master_audio.py
  python render_video.py --audio output/PhaseAtlas-narration.wav

Quality records
  output/audio-check.json        Loudness, peak and clipping measurements.
  output/timeline-manifest.json  Nine clip placements and source hashes.
  output/render-manifest.json    Video properties and solver-data hashes.
  output/video-check.json        Final decode and stream verification.
Captions use the original script, aligned to locally recognized speech.
ASR may hallucinate words in pauses; suspect passages are checked with a
second model. Names retain their original spelling in the captions.
The MP4 is fully decoded and encoded scene previews are checked visually.
Automatic speech checks are not a human listening review; perceived age,
accent and voice preference remain subjective.

Scientific evidence
Dynamic plots use existing data in dist/data/submission-2026/:
cooling.json, cooling-scan.json, mae03-front.json and summary.json.
Playback linearly interpolates saved fields. No numerical data are invented.
The examples belong to the 18 Oct 2026 pre-event baseline.
Cooling is dimensionless, not a calibrated material prediction.
The three-grid refinement estimate is not a rigorous error bound.
The finite-time response map is not a bifurcation diagram.
Front data come from the model-specific MAE03 front laboratory.
The disturbance is w / 0.001, with a fixed scale across all frames.
No animation or norm history is proof of nonlinear stability.

Privacy and distribution
No paid voice service, subscription, API key or audio upload is required.
The personal recording remains private and unused. Audio synthesis and
speech recognition run locally. Production output is ignored by Git and
is not deployed with the website. No automatic submission or publication.

Credits and model sources
Kokoro 82M (Apache-2.0): https://huggingface.co/hexgrad/Kokoro-82M
kokoro-onnx (MIT): https://github.com/thewh1teagle/kokoro-onnx
Models: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1
Faster Whisper: https://github.com/SYSTRAN/faster-whisper
Model and runtime binaries are downloaded separately, not bundled here.

Revision 2
Narration regenerated at native speed 1.0, with shorter sentence and clause
pauses. Scene lengths follow the audio; no padding to four minutes. Removed
the requested development/baseline sentence and the latter half of the local
computation sentence. Mathematical symbols use verified glyph coverage and
Cambria Math fallback. Final captions were realigned to the regenerated audio.


One-minute platform walkthrough
The 2:32-3:32 section is an actual browser recording of the local Studio.
It enters nu*Dx(u,2), uses Robin boundaries, runs the solver, inspects the
animation, performs time/grid comparisons and downloads a 61-frame JSON.
assets/studio-walkthrough.mp4 is the normalized 60-second source clip.
record_walkthrough.mjs records the browser; prepare_walkthrough.py trims the
synchronization marker. pace_walkthrough.py inserts action pauses between
narrated chapters without stretching the speech. Run speech recognition again
after pacing, then assemble, master and render. The exported numerical data
and event timestamps are in output/demo-experiment.json and
output/demo-recording-manifest.json.

