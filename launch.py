"""Launch the local PhaseAtlas app using only the Python standard library."""
import argparse
import functools
import http.server
from pathlib import Path
import threading
import webbrowser
import io
import zipfile
from urllib.parse import urlparse

ROOT=Path(__file__).parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self,path):
        resolved=super().translate_path(path)
        # Portable source archives omit duplicate download assets. Serve the
        # corresponding documentation from the same local project when needed.
        requested=urlparse(path).path
        if requested.startswith('/downloads/') and not Path(resolved).exists():
            name=requested.removeprefix('/downloads/')
            if '/' not in name and '\\' not in name and (ROOT/'docs'/name).is_file():
                return str(ROOT/'docs'/name)
        return resolved

    def do_GET(self):
        requested=urlparse(self.path).path
        if requested=='/downloads/phaseatlas-research.zip' and not (ROOT/'dist/downloads/phaseatlas-research.zip').exists():
            stream=io.BytesIO()
            allowed={'.html','.css','.js','.mjs','.py','.txt','.md','.json','.pdf','.png','.svg','.webm'}
            files=[ROOT/name for name in ['README.md','package.json','launch.py','START_PhaseAtlas.cmd']]
            for directory in ['dist','research','tests','docs']:
                for p in (ROOT/directory).rglob('*'):
                    if p.is_file() and p.suffix.lower() in allowed and not any(part in ('__pycache__','downloads','screenshots') for part in p.relative_to(ROOT).parts):
                        files.append(p)
            with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as archive:
                for p in files:
                    if p.exists():archive.write(p,Path('PhaseAtlas')/p.relative_to(ROOT))
            payload=stream.getvalue()
            self.send_response(200)
            self.send_header('Content-Type','application/zip')
            self.send_header('Content-Disposition','attachment; filename="phaseatlas-research.zip"')
            self.send_header('Content-Length',str(len(payload)))
            self.end_headers();self.wfile.write(payload)
            return
        super().do_GET()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    handler=functools.partial(Handler,directory=str(ROOT/'dist'))
    server=None
    for port in range(args.port,args.port+20):
        try:
            server=http.server.ThreadingHTTPServer(('127.0.0.1',port),handler);break
        except OSError: continue
    if server is None: raise SystemExit('No available local port. Try --port 9000.')
    url=f'http://127.0.0.1:{server.server_port}/'
    print(f'PhaseAtlas: {url}\nPress Ctrl+C to stop.',flush=True)
    if not args.no_browser:
        threading.Timer(.7,lambda:webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__=='__main__':main()
