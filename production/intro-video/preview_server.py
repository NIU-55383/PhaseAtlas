"""Serve the local video preview with byte ranges for seeking. Never serves voices."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,unquote
import mimetypes,re
ROOT=Path(__file__).resolve().parent/'output'
ALLOWED={p.name:p for p in ROOT.iterdir()if p.is_file()and p.suffix.lower()in {'.html','.mp4','.jpg','.txt','.srt','.json'}}
class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):self.serve(False)
    def do_GET(self):self.serve(True)
    def serve(self,body):
        name=unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        target=ALLOWED.get(name)
        if target is None:self.send_error(404);return
        size=target.stat().st_size;start=0;end=size-1;partial=False
        value=self.headers.get('Range')
        if value:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',value)
            if not match:self.send_error(416);return
            a,b=match.groups()
            if a:start=int(a);end=min(int(b),end)if b else end
            elif b:start=max(0,size-int(b))
            else:self.send_error(416);return
            if not 0<=start<=end<size:self.send_error(416);return
            partial=True
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type',mimetypes.guess_type(target.name)[0]or'application/octet-stream')
        self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes');self.send_header('Cache-Control','no-store')
        if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if body:
            try:
                with target.open('rb')as source:
                    source.seek(start);remaining=end-start+1
                    while remaining:
                        chunk=source.read(min(65536,remaining))
                        if not chunk:break
                        self.wfile.write(chunk);remaining-=len(chunk)
            except(ConnectionResetError,BrokenPipeError,ConnectionAbortedError):pass
if __name__=='__main__':
    print('PhaseAtlas private video preview: http://127.0.0.1:8770/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8770),Handler).serve_forever()
