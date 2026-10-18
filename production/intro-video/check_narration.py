"""Offline ASR quality check of generated audio; no audio leaves this machine."""
from pathlib import Path
import argparse, json, time
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

HERE = Path(__file__).resolve().parent
out = HERE / 'output' / 'ai-narration'
parser=argparse.ArgumentParser();parser.add_argument('--model',default='base.en');parser.add_argument('--scenes',nargs='*');args=parser.parse_args()
model = WhisperModel(args.model, device='cpu', compute_type='int8', cpu_threads=4,
                     download_root=str(HERE.parent / 'phaseatlas-asr-models'))
report = []
for metadata in sorted(out.glob('[0-9][0-9]-*.json')):
    if metadata.name.endswith(('.asr.json','.review.json')):continue
    data = json.loads(metadata.read_text(encoding='utf-8'))
    if args.scenes and data['scene'] not in args.scenes:continue
    target = metadata.with_suffix('.asr.json' if args.model=='base.en' else '.review.json')
    result = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    if result.get('sourceSha256')!=data['sha256']:
        start = time.perf_counter()
        samples, rate = sf.read(metadata.with_suffix('.wav'), dtype='float32')
        # ASR only: pass a 16-kHz array to avoid PyAV decoder version differences.
        audio = np.interp(np.arange(round(len(samples)*16000/rate))*rate/16000,
                          np.arange(len(samples)), samples).astype('float32')
        segments, info = model.transcribe(audio,
            language='en', beam_size=5, word_timestamps=True, vad_filter=False,
            condition_on_previous_text=False)
        words = []
        for segment in segments:
            words.extend({'word': w.word.strip(), 'start': w.start, 'end': w.end,
                          'probability': w.probability} for w in segment.words)
        result = {'scene': data['scene'], 'words': words,
                  'transcript': ' '.join(w['word'] for w in words),
                  'sourceSha256': data['sha256'], 'model': 'faster-whisper '+args.model,
                  'seconds': time.perf_counter() - start}
        target.write_text(json.dumps(result, indent=2), encoding='utf-8')
    report.append(result)
    print(json.dumps({'scene': result['scene'], 'transcript': result['transcript']}), flush=True)
(out / ('asr-report.json' if args.model=='base.en' else 'asr-review-report.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')
