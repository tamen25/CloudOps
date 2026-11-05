"""Inventory's logs on the EKS runs had no severity and no trace context
(Argus LOG-002, ARG-LOG-001): uvicorn's access lines, plain text. Each
request now logs one JSON line with its level and its span's IDs, which the
otel-agent parses."""

import io
import json
import logging

from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

from inventory.app import create_app
from inventory.logs import JSONFormatter


def _capture(logger_name: str) -> io.StringIO:
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(JSONFormatter())
    logger = logging.getLogger(logger_name)
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return buf


def _lines(buf: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in buf.getvalue().splitlines() if line.strip()]


def test_a_record_inside_a_span_carries_its_ids():
    tracer = TracerProvider().get_tracer("test")
    buf = _capture("inventory.test")
    with tracer.start_as_current_span("op") as span:
        logging.getLogger("inventory.test").warning("short stock", extra={"fields": {"sku": "A"}})
        ctx = span.get_span_context()
    line = _lines(buf)[0]
    assert line["level"] == "WARNING"
    assert line["msg"] == "short stock"
    assert line["sku"] == "A"
    assert line["trace_id"] == format(ctx.trace_id, "032x")
    assert line["span_id"] == format(ctx.span_id, "016x")


def test_a_record_outside_a_span_has_no_ids():
    buf = _capture("inventory.test2")
    logging.getLogger("inventory.test2").info("startup")
    line = _lines(buf)[0]
    assert "trace_id" not in line
    assert line["level"] == "INFO"


def test_each_request_logs_one_line_at_a_level_that_follows_the_status():
    buf = _capture("inventory.access")
    client = TestClient(create_app())

    client.post("/reserve", json={"items": [{"sku": "A", "qty": 1}]})
    client.post("/reserve", json={"items": "not-a-list"})
    client.get("/healthz")
    client.get("/metrics")

    lines = _lines(buf)
    assert [(l["path"], l["status"], l["level"]) for l in lines] == [
        ("/reserve", 200, "INFO"),
        ("/reserve", 400, "WARNING"),
    ], "probes and scrapes must not be logged"
    assert all(isinstance(l["duration_ms"], int) for l in lines)


def test_a_request_that_raises_is_logged_with_its_error():
    buf = _capture("inventory.access")
    app = create_app()

    @app.get("/boom")
    def boom():
        raise RuntimeError("kaput")

    TestClient(app, raise_server_exceptions=False).get("/boom")
    line = _lines(buf)[0]
    assert line["level"] == "ERROR"
    assert line["path"] == "/boom"
    assert "kaput" in line["error"]


def test_server_errors_log_at_error():
    from inventory.logs import level_for

    assert level_for(503) == logging.ERROR
    assert level_for(404) == logging.WARNING
    assert level_for(200) == logging.INFO


def test_configure_sends_json_to_stdout(capsys):
    from inventory.logs import configure

    configure()
    logging.getLogger("inventory.configured").info("hello")
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["msg"] == "hello" and line["level"] == "INFO"
