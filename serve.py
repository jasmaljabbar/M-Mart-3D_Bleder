"""Serve this viewer locally: python3 serve.py [port]."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from functools import partial
import sys
root=Path(__file__).resolve().parent
port=int(sys.argv[1]) if len(sys.argv)>1 else 8765
handler=partial(SimpleHTTPRequestHandler,directory=str(root))
print(f'Open http://localhost:{port}',flush=True)
ThreadingHTTPServer(('127.0.0.1',port),handler).serve_forever()
