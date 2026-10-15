"""Tiny stdlib HTTP server exposing /healthz, /readyz, /metrics for the
projection worker. Runs in a daemon thread alongside the Kinesis poll loop —
the worker has no request API of its own, but k8s still needs probes + a scrape
target."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from projection.readmodel import ReadModel


def make_handler(model: ReadModel):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):  # silence default access logging
            pass

        def do_GET(self):
            if self.path == "/healthz":
                self._json(200, b'{"status":"ok"}')
            elif self.path == "/readyz":
                self._json(200, b'{"status":"ready"}')
            elif self.path == "/metrics":
                self._text(200, self._metrics())
            else:
                self._json(404, b'{"error":"not_found"}')

        def _metrics(self) -> bytes:
            lines = [
                "# TYPE projection_events_processed_total counter",
                f"projection_events_processed_total {model.processed}",
                "# TYPE projection_events_skipped_total counter",
                f"projection_events_skipped_total {model.skipped}",
                "# TYPE projection_tenant_orders gauge",
            ]
            for tenant, proj in model.by_tenant.items():
                safe = tenant.replace('"', "")
                lines.append(f'projection_tenant_orders{{tenant="{safe}"}} {proj.orders}')
            return ("\n".join(lines) + "\n").encode()

        def _json(self, code: int, body: bytes):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def _text(self, code: int, body: bytes):
            self.send_response(code)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.end_headers()
            self.wfile.write(body)

    return Handler


def serve(model: ReadModel, port: int) -> HTTPServer:
    httpd = HTTPServer(("0.0.0.0", port), make_handler(model))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd
