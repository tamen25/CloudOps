from __future__ import annotations

import json
import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

try:
    from opentelemetry import baggage, context as otel_context, propagate, trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.propagators.b3 import B3MultiFormat
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import (
        BatchSpanProcessor,
        ConsoleSpanExporter,
        SimpleSpanProcessor,
    )
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
    from opentelemetry.trace import SpanKind, Status, StatusCode
except ImportError:  # pragma: no cover - exercised only before package deps are installed.
    baggage = None
    otel_context = None
    propagate = None
    trace = None
    OTLPSpanExporter = None
    B3MultiFormat = None
    Resource = None
    TracerProvider = None
    BatchSpanProcessor = None
    ConsoleSpanExporter = None
    SimpleSpanProcessor = None
    ParentBased = None
    TraceIdRatioBased = None
    SpanKind = None
    Status = None
    StatusCode = None

try:  # AWS X-Ray id generator is optional; fall back to the default id generator.
    from opentelemetry.sdk.extension.aws.trace import AwsXRayIdGenerator
except ImportError:  # pragma: no cover - optional dependency.
    AwsXRayIdGenerator = None

DEFAULT_EXPORTERS = ["console"]
DEFAULT_SSM_PARAMETERS_FILE = "/tmp/otelExporterParams.json"


@dataclass
class TracesExporterConfig:
    url: str | None = None
    api_key: str | None = None


@dataclass
class BackendConfig:
    trace: TracesExporterConfig | None = None


@dataclass
class SsmParameters:
    otel: BackendConfig | None = None

    def is_empty(self) -> bool:
        return self.otel is None or self.otel.trace is None or not (self.otel.trace.url or self.otel.trace.api_key)

    def backend(self, name: str) -> BackendConfig | None:
        return self.otel if name == "otel" else None


#Parses string list.
def _parse_string_list(raw: str | None, fallback: list[str]) -> list[str]:
    if not raw:
        return list(fallback)

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            values = [str(item).strip() for item in parsed if str(item).strip()]
            return values or list(fallback)
    except json.JSONDecodeError:
        pass

    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values or list(fallback)


#Parses resource attributes.
def _parse_resource_attributes(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}

    attributes: dict[str, str] = {}
    for item in raw.split(","):
        key, separator, value = item.partition("=")
        if separator and key.strip() and value.strip():
            attributes[key.strip()] = value.strip()

    return attributes


#Normalizes endpoint.
def _normalize_endpoint(endpoint: str | None) -> str | None:
    if not endpoint:
        return None

    normalized = endpoint.rstrip("/")
    return normalized if normalized.endswith("/v1/traces") else f"{normalized}/v1/traces"


def _ssm_parameters_from_json(parsed: Any) -> SsmParameters:
    if not isinstance(parsed, Mapping):
        return SsmParameters()

    otel = parsed.get("otel", {})
    trace_config = otel.get("trace", {}) if isinstance(otel, Mapping) else {}
    trace_config = trace_config if isinstance(trace_config, Mapping) else {}
    return SsmParameters(otel=BackendConfig(trace=TracesExporterConfig(
        url=trace_config.get("url"),
        api_key=trace_config.get("api_key"),
    )))


def _read_ssm_parameters_file(file_path: str | None = None) -> SsmParameters:
    resolved_path = file_path or os.getenv("OTEL_SSM_PARAMETERS_FILE") or DEFAULT_SSM_PARAMETERS_FILE
    try:
        with open(resolved_path, encoding="utf-8") as params_file:
            return _ssm_parameters_from_json(json.load(params_file))
    except FileNotFoundError:
        return SsmParameters()
    except (OSError, json.JSONDecodeError) as error:
        logging.getLogger(__name__).error("Error reading or parsing otelExporterParams.json: %s", error)
        return SsmParameters()


def _read_ssm_parameters() -> SsmParameters:
    configured = os.getenv("OTEL_SSM_PARAMETERS")
    if configured:
        try:
            parameters = _ssm_parameters_from_json(json.loads(configured))
            if not parameters.is_empty():
                return parameters
        except (json.JSONDecodeError, AttributeError):
            pass

    file_parameters = _read_ssm_parameters_file()
    if not file_parameters.is_empty():
        return file_parameters

    trace_url = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") or _normalize_endpoint(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
    api_key = os.getenv("OTEL_API_KEY") or os.getenv("OTEL_EXPORTER_OTLP_HEADERS")
    if trace_url or api_key:
        return SsmParameters(otel=BackendConfig(trace=TracesExporterConfig(url=trace_url, api_key=api_key)))

    return SsmParameters()


#Finds first env.
def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value:
            return value

    return None


def _runtime_resource_attributes() -> dict[str, str]:
    attributes = _parse_resource_attributes(os.getenv("OTEL_RESOURCE_ATTRIBUTES"))
    attributes["service.name"] = (
        os.getenv("OTEL_SERVICE_NAME")
        or attributes.get("service.name")
        or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
        or "unknown_service"
    )
    attributes["cloudops-trace-ver"] = "0.1.0"

    lambda_name = os.getenv("AWS_LAMBDA_FUNCTION_NAME")
    if lambda_name:
        attributes["cloud.platform"] = "aws_lambda"
        attributes["faas.name"] = lambda_name
        return attributes

    if _first_env("ECS_CONTAINER_METADATA_URI_V4", "ECS_CONTAINER_METADATA_URI") or os.getenv("ECS_CONTAINER_METADATA_FILE"):
        attributes["cloud.platform"] = "aws_ecs"

    running_on_kubernetes = bool(os.getenv("KUBERNETES_SERVICE_HOST"))
    k8s_cluster_name = _first_env("K8S_CLUSTER_NAME", "EKS_CLUSTER_NAME")
    k8s_namespace_name = _first_env("K8S_NAMESPACE_NAME", "POD_NAMESPACE")
    k8s_node_name = _first_env("K8S_NODE_NAME", "NODE_NAME")
    k8s_pod_name = _first_env("K8S_POD_NAME", "POD_NAME") or (os.getenv("HOSTNAME") if running_on_kubernetes else None)

    if running_on_kubernetes or k8s_cluster_name or k8s_namespace_name or k8s_pod_name:
        attributes["cloud.platform"] = "aws_eks"

    optional_attributes = {
        "k8s.cluster.name": k8s_cluster_name,
        "k8s.namespace.name": k8s_namespace_name,
        "k8s.node.name": k8s_node_name,
        "k8s.pod.name": k8s_pod_name,
        "container.id": os.getenv("CONTAINER_ID"),
        "container.name": _first_env("CONTAINER_NAME", "ECS_CONTAINER_NAME"),
    }
    attributes.update({key: value for key, value in optional_attributes.items() if value})
    return attributes


def _sampler_ratio() -> float:
    try:
        return float(os.getenv("TRACEID_RATIO_BASED_SAMPLER", "1"))
    except ValueError:
        return 1.0


def _otel_available() -> bool:
    return all([
        trace,
        propagate,
        OTLPSpanExporter,
        B3MultiFormat,
        Resource,
        TracerProvider,
        BatchSpanProcessor,
        ConsoleSpanExporter,
        SimpleSpanProcessor,
        ParentBased,
        TraceIdRatioBased,
    ])


def _trace_baggage_attrs() -> dict[str, str]:
    if baggage is None:
        return {}

    return {f"baggage.{key}": str(value) for key, value in baggage.get_all().items()}


class TraceInstrumentation:
    #Initializes the requested work.
    def __init__(self) -> None:
        self.resource_attributes = _runtime_resource_attributes()
        self.exporters_list = _parse_string_list(os.getenv("OTEL_BACKEND_EXPORTERS"), DEFAULT_EXPORTERS)
        self.service_name = self.resource_attributes["service.name"]
        self._initialized = False
        self._provider: Any = None
        self._tracer: Any = None
        self._active_context: Any = None
        self._current_span: Any = None
        self._propagation_context: Any = None
        self._batch_processor: Any = None
        self._init()

    @classmethod
    #Initializes tracer.
    def initialise_tracer(cls) -> "TraceInstrumentation":
        return tracer

    @classmethod
    #Initializes tracer.
    def initialize_tracer(cls) -> "TraceInstrumentation":
        return tracer

    @property
    def active_span(self) -> Any:
        return self._current_span

    #Initializes the requested work.
    def _init(self) -> None:
        if not _otel_available():
            return

        resource = Resource.create(self.resource_attributes)
        sampler = ParentBased(root=TraceIdRatioBased(_sampler_ratio()))
        provider_options: dict[str, Any] = {"resource": resource, "sampler": sampler}
        if AwsXRayIdGenerator is not None:
            provider_options["id_generator"] = AwsXRayIdGenerator()
        self._provider = TracerProvider(**provider_options)

        backend = self.exporters_list[0].lower() if self.exporters_list else "console"
        if backend == "otel":
            ssm_parameters = _read_ssm_parameters()
            if ssm_parameters.is_empty():
                self._provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
            else:
                config = ssm_parameters.otel.trace if ssm_parameters.otel else None
                exporter_options: dict[str, Any] = {}
                if config and config.url:
                    exporter_options["endpoint"] = config.url
                if config and config.api_key:
                    exporter_options["headers"] = {"authorization": f"Bearer {config.api_key}"}
                self._batch_processor = BatchSpanProcessor(OTLPSpanExporter(**exporter_options))
                self._provider.add_span_processor(self._batch_processor)
        else:
            self._provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))

        propagate.set_global_textmap(B3MultiFormat())
        trace.set_tracer_provider(self._provider)
        self._tracer = trace.get_tracer(f"{self.service_name}-tracer")
        self._initialized = True

    #Starts a basic span.
    def start_basic_span(
        self,
        name: str,
        span_kind: Any = None,
        root: bool = False,
        set_active_context: bool = False,
        parent: Any = None,
    ) -> Any:
        if not self._initialized:
            return None

        try:
            if parent is not None:
                span_context = parent
            elif root:
                span_context = otel_context.Context()
            else:
                span_context = self._active_context

            span = self._tracer.start_span(
                name,
                context=span_context,
                kind=span_kind if span_kind is not None else SpanKind.INTERNAL,
            )

            self.set_attributes(span, _trace_baggage_attrs())

            if set_active_context:
                self._active_context = trace.set_span_in_context(span)

            self._current_span = span
            return span
        except Exception as error:  # pragma: no cover - defensive.
            logging.getLogger(__name__).debug("start_basic_span failed: %s", error)
            return None

    def set_attributes(self, span: Any, data: Any) -> None:
        if not span or not self._initialized or not data:
            return

        if isinstance(data, Mapping):
            for key, value in data.items():
                if value is not None:
                    span.set_attribute(key, value)

    #Records an error on the span.
    def record_error(self, error: Any, span: Any = None) -> None:
        record_error_span = span or self._current_span
        if record_error_span is None:
            return

        try:
            record_error_span.record_exception(error)
            record_error_span.set_status(Status(StatusCode.ERROR))
        except Exception as failure:  # pragma: no cover - defensive.
            logging.getLogger(__name__).debug("record_error failed: %s", failure)

    def set_active_context(self, span: Any) -> None:
        if span is None:
            return

        self._active_context = trace.set_span_in_context(span)

    #Fetch the trace attributes for context propagation.
    def fetch_trace_attrs(self) -> dict[str, str] | None:
        if not self._initialized:
            return None

        carrier: dict[str, str] = {}
        span_context = trace.set_span_in_context(self._current_span) if self._current_span else None
        propagate.inject(carrier, context=span_context)
        return carrier or None

    #Extract trace attributes from a carrier.
    def extract_trace_attrs(self, carrier: Mapping[str, str]) -> None:
        if not self._initialized:
            return

        self._propagation_context = propagate.extract(carrier)

    #Force all the spans to get exported.
    def export_spans(self) -> None:
        if self._provider is None:
            return

        try:
            self._provider.force_flush(timeout_millis=30000)
        except TypeError:
            self._provider.force_flush()


tracer = TraceInstrumentation()
