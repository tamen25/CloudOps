"""OTel setup for the inventory service. A no-op when
OTEL_EXPORTER_OTLP_ENDPOINT is unset, mirroring the Node/Go services, so the
process never starts exporters that retry against an undefined endpoint."""

from __future__ import annotations

import os


def init_tracer(service_name: str) -> bool:
    """Configure the global tracer provider with an OTLP/HTTP exporter.

    Returns True when tracing was started, False when skipped (no endpoint).
    """
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if not endpoint:
        return False

    # Imported lazily so the package imports cleanly even if the OTel extras
    # are not installed in a minimal test environment.
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    headers = {}
    api_key = os.environ.get("OTEL_API_KEY", "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(
        BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces", headers=headers))
    )
    trace.set_tracer_provider(provider)
    return True


def instrument_app(app) -> None:
    """Attach FastAPI auto-instrumentation when tracing is active."""
    if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", ""):
        return
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(app)
