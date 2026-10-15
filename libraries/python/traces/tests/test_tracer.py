import os
import tempfile
import unittest
from unittest.mock import patch

from cloudops_otel_traces import TraceInstrumentation
from cloudops_otel_traces.tracer import (
    BackendConfig,
    SsmParameters,
    TracesExporterConfig,
    _normalize_endpoint,
    _parse_resource_attributes,
    _parse_string_list,
    _read_ssm_parameters,
    _runtime_resource_attributes,
    _sampler_ratio,
)


class TraceInstrumentationTests(unittest.TestCase):
    def test_runtime_resource_attributes_for_eks(self):
        with patch.dict("os.environ", {
            "OTEL_SERVICE_NAME": "order-api",
            "KUBERNETES_SERVICE_HOST": "10.0.0.1",
            "K8S_NAMESPACE_NAME": "cloudops",
            "K8S_POD_NAME": "order-api-abc",
            "K8S_NODE_NAME": "ip-10-0-0-1",
            "K8S_CLUSTER_NAME": "cloudops-dev",
        }, clear=True):
            attributes = _runtime_resource_attributes()

        self.assertEqual(attributes["service.name"], "order-api")
        self.assertEqual(attributes["cloud.platform"], "aws_eks")
        self.assertEqual(attributes["k8s.namespace.name"], "cloudops")
        self.assertEqual(attributes["k8s.pod.name"], "order-api-abc")
        self.assertEqual(attributes["cloudops-trace-ver"], "0.1.0")

    def test_runtime_resource_attributes_for_lambda(self):
        with patch.dict("os.environ", {
            "AWS_LAMBDA_FUNCTION_NAME": "orders-handler",
        }, clear=True):
            attributes = _runtime_resource_attributes()

        self.assertEqual(attributes["service.name"], "orders-handler")
        self.assertEqual(attributes["cloud.platform"], "aws_lambda")
        self.assertEqual(attributes["faas.name"], "orders-handler")

    def test_runtime_resource_attributes_merge_otel_resource_attributes(self):
        with patch.dict("os.environ", {
            "OTEL_RESOURCE_ATTRIBUTES": "deployment.environment=dev,k8s.cluster.name=cloudops-dev",
            "OTEL_SERVICE_NAME": "order-api",
        }, clear=True):
            attributes = _runtime_resource_attributes()

        self.assertEqual(attributes["service.name"], "order-api")
        self.assertEqual(attributes["deployment.environment"], "dev")
        self.assertEqual(attributes["k8s.cluster.name"], "cloudops-dev")

    def test_string_list_and_resource_attribute_parsers(self):
        fallback = ["console"]
        parsed_fallback = _parse_string_list(None, fallback)
        parsed_fallback.append("otel")

        self.assertEqual(fallback, ["console"])
        self.assertEqual(_parse_string_list('["console", " otel "]', ["x"]), ["console", "otel"])
        self.assertEqual(_parse_string_list("console, otel", ["x"]), ["console", "otel"])
        self.assertEqual(
            _parse_resource_attributes("service.name=orders,empty=,deployment.environment=dev"),
            {"service.name": "orders", "deployment.environment": "dev"},
        )
        self.assertEqual(_normalize_endpoint("https://collector.example.com/"), "https://collector.example.com/v1/traces")

    def test_sampler_ratio_parsing(self):
        with patch.dict("os.environ", {"TRACEID_RATIO_BASED_SAMPLER": "0.25"}, clear=True):
            self.assertEqual(_sampler_ratio(), 0.25)
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(_sampler_ratio(), 1.0)
        with patch.dict("os.environ", {"TRACEID_RATIO_BASED_SAMPLER": "bad"}, clear=True):
            self.assertEqual(_sampler_ratio(), 1.0)

    def test_read_ssm_parameters_prefers_json_and_falls_back_to_otel_env(self):
        with patch.dict("os.environ", {
            "OTEL_SSM_PARAMETERS": '{"otel":{"trace":{"url":"https://collector.example.com/v1/traces","api_key":"secret"}}}',
            "OTEL_EXPORTER_OTLP_ENDPOINT": "https://fallback.example.com",
            "OTEL_API_KEY": "fallback-secret",
        }, clear=True):
            parsed = _read_ssm_parameters()

        self.assertEqual(parsed.otel.trace.url, "https://collector.example.com/v1/traces")
        self.assertEqual(parsed.otel.trace.api_key, "secret")

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict("os.environ", {
                "OTEL_SSM_PARAMETERS_FILE": os.path.join(temp_dir, "missing.json"),
                "OTEL_EXPORTER_OTLP_ENDPOINT": "https://collector.example.com/",
                "OTEL_API_KEY": "direct-secret",
            }, clear=True):
                parsed = _read_ssm_parameters()

        self.assertEqual(parsed.otel.trace.url, "https://collector.example.com/v1/traces")
        self.assertEqual(parsed.otel.trace.api_key, "direct-secret")

    def test_read_ssm_parameters_uses_params_file_before_direct_env(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            params_file = os.path.join(temp_dir, "otelExporterParams.json")
            with open(params_file, "w", encoding="utf-8") as file:
                file.write('{"otel":{"trace":{"url":"https://file.example.com/v1/traces","api_key":"file-secret"}}}')

            with patch.dict("os.environ", {
                "OTEL_SSM_PARAMETERS_FILE": params_file,
                "OTEL_EXPORTER_OTLP_ENDPOINT": "https://fallback.example.com",
                "OTEL_API_KEY": "fallback-secret",
            }, clear=True):
                parsed = _read_ssm_parameters()

        self.assertEqual(parsed.otel.trace.url, "https://file.example.com/v1/traces")
        self.assertEqual(parsed.otel.trace.api_key, "file-secret")

    def test_ssm_parameters_backend_and_empty_detection(self):
        self.assertTrue(SsmParameters().is_empty())

        backend = BackendConfig(trace=TracesExporterConfig(url="https://collector.example.com/v1/traces"))
        parameters = SsmParameters(otel=backend)

        self.assertFalse(parameters.is_empty())
        self.assertIs(parameters.backend("otel"), backend)
        self.assertIsNone(parameters.backend("metrics"))

    def test_console_tracer_starts_span_and_exports(self):
        with patch.dict("os.environ", {
            "OTEL_BACKEND_EXPORTERS": "console",
            "OTEL_SERVICE_NAME": "orders-api",
        }, clear=True):
            instrumentation = TraceInstrumentation()

        span = instrumentation.start_basic_span("manual-span", set_active_context=True)
        self.assertIsNotNone(span)

        instrumentation.set_attributes(span, {"order.id": 42})
        instrumentation.record_error(ValueError("boom"), span)

        trace_attrs = instrumentation.fetch_trace_attrs()
        self.assertIsInstance(trace_attrs, dict)

        # Round-trips through extract without raising.
        instrumentation.extract_trace_attrs({
            "x-b3-traceid": "0af7651916cd43dd8448eb211c80319c",
            "x-b3-spanid": "b7ad6b7169203331",
            "x-b3-sampled": "1",
        })

        span.end()
        instrumentation.export_spans()


if __name__ == "__main__":
    unittest.main()
