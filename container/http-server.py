"""Serve a demo directory without resolving the container's long hostname."""
import sys
from http.server import SimpleHTTPRequestHandler
from socketserver import ThreadingTCPServer

ThreadingTCPServer.allow_reuse_address = True
with ThreadingTCPServer(('0.0.0.0', int(sys.argv[1])), SimpleHTTPRequestHandler) as server:
    server.serve_forever()
