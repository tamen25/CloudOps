"""JSON log lines for the inventory service.

The cluster's otel-agent reads this service's stdout and turns each line's
`level`, `trace_id` and `span_id` into the log record's severity and trace
context, so a line can be filtered by level and joined to its trace. Lines
logged inside a request carry that request's span."""

from __future__ import annotations

import json
import logging
import time

# Records may carry structured fields as `extra={"fields": {...}}`.
FIELDS = "fields"


def _span_ids() -> dict[str, str]:
    try:
        from opentelemetry import trace
    except ImportError:  # minimal test environments without the OTel extras
        return {}
    ctx = trace.get_current_span().get_span_context()
    if not ctx.is_valid:
        return {}
    return {"trace_id": format(ctx.trace_id, "032x"), "span_id": format(ctx.span_id, "016x")}


class JSONFormatter(logging.Formatter):
    """One JSON object per record: time, level, logger, msg, any `fields`,
    the current span's IDs, and the exception when there is one."""

    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, object] = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        out.update(getattr(record, FIELDS, None) or {})
        out.update(_span_ids())
        if record.exc_info:
            out["error"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


# uvicorn's own loggers (startup, errors) use the same format; its access log
# is off because the access middleware logs requests with their span.
LOG_CONFIG: dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": JSONFormatter}},
    "handlers": {"stdout": {"class": "logging.StreamHandler", "formatter": "json", "stream": "ext://sys.stdout"}},
    "root": {"handlers": ["stdout"], "level": "INFO"},
    "loggers": {
        "uvicorn": {"handlers": ["stdout"], "level": "INFO", "propagate": False},
        "uvicorn.error": {"handlers": ["stdout"], "level": "INFO", "propagate": False},
        "uvicorn.access": {"handlers": [], "level": "WARNING", "propagate": False},
    },
}


def configure() -> None:
    """Apply LOG_CONFIG to this process (used when not started by uvicorn)."""
    import logging.config

    logging.config.dictConfig(LOG_CONFIG)


def level_for(status: int) -> int:
    if status >= 500:
        return logging.ERROR
    if status >= 400:
        return logging.WARNING
    return logging.INFO
