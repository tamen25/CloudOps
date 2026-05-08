import contextlib
import io
import unittest
from unittest.mock import patch

from cloudops_otel_logs import CloudOpsLogger
from cloudops_otel_logs.logger import (
    BackendConfig,
    LogEntry,
    LogSampler,
    LogsExporterConfig,
    SsmParameters,
    _normalize_endpoint,
    _parse_log_levels,
    _parse_resource_attributes,
    _parse_string_list,
    _read_ssm_parameters,
    _sampling_rate,
)


class CloudOpsLoggerTests(unittest.TestCase):
    def test_runtime_resource_attributes_for_eks(self):
        with patch.dict("os.environ", {
            "OTEL_SERVICE_NAME": "order-api",
            "KUBERNETES_SERVICE_HOST": "10.0.0.1",
            "K8S_NAMESPACE_NAME": "cloudops",
            "K8S_POD_NAME": "order-api-abc",
            "K8S_NODE_NAME": "ip-10-0-0-1",
            "K8S_CLUSTER_NAME": "cloudops-dev",
        }, clear=True):
            logger = CloudOpsLogger("test")

        self.assertEqual(logger.resource_attributes["service.name"], "order-api")
        self.assertEqual(logger.resource_attributes["cloud.platform"], "aws_eks")
        self.assertEqual(logger.resource_attributes["k8s.namespace.name"], "cloudops")
        self.assertEqual(logger.resource_attributes["k8s.pod.name"], "order-api-abc")
        self.assertEqual(logger.resource_attributes["k8s.node.name"], "ip-10-0-0-1")
        self.assertEqual(logger.resource_attributes["k8s.cluster.name"], "cloudops-dev")

    def test_runtime_resource_attributes_for_lambda(self):
        with patch.dict("os.environ", {
            "AWS_LAMBDA_FUNCTION_NAME": "orders-handler",
        }, clear=True):
            logger = CloudOpsLogger("test")

        self.assertEqual(logger.resource_attributes["service.name"], "orders-handler")
        self.assertEqual(logger.resource_attributes["cloud.platform"], "aws_lambda")
        self.assertEqual(logger.resource_attributes["faas.name"], "orders-handler")

    def test_runtime_resource_attributes_merge_otel_resource_attributes(self):
        with patch.dict("os.environ", {
            "OTEL_RESOURCE_ATTRIBUTES": "deployment.environment=dev,k8s.cluster.name=cloudops-dev",
            "OTEL_SERVICE_NAME": "order-api",
        }, clear=True):
            logger = CloudOpsLogger("test")

        self.assertEqual(logger.resource_attributes["service.name"], "order-api")
        self.assertEqual(logger.resource_attributes["deployment.environment"], "dev")
        self.assertEqual(logger.resource_attributes["k8s.cluster.name"], "cloudops-dev")

    def test_invalid_log_levels_do_not_disable_logging(self):
        self.assertEqual(_parse_log_levels("bad,error"), {"error"})
        self.assertEqual(_parse_log_levels("bad"), {"info", "error", "debug", "warn"})

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
        self.assertEqual(_normalize_endpoint("https://collector.example.com/"), "https://collector.example.com/v1/logs")

    def test_read_ssm_parameters_prefers_json_and_falls_back_to_otel_env(self):
        with patch.dict("os.environ", {
            "OTEL_SSM_PARAMETERS": '{"otel":{"logs":{"url":"https://collector.example.com/v1/logs","api_key":"secret"}}}',
            "OTEL_EXPORTER_OTLP_ENDPOINT": "https://fallback.example.com",
            "OTEL_API_KEY": "fallback-secret",
        }, clear=True):
            parsed = _read_ssm_parameters()

        self.assertEqual(parsed.otel.logs.url, "https://collector.example.com/v1/logs")
        self.assertEqual(parsed.otel.logs.api_key, "secret")

        with patch.dict("os.environ", {
            "OTEL_EXPORTER_OTLP_ENDPOINT": "https://collector.example.com/",
            "OTEL_API_KEY": "direct-secret",
        }, clear=True):
            parsed = _read_ssm_parameters()

        self.assertEqual(parsed.otel.logs.url, "https://collector.example.com/v1/logs")
        self.assertEqual(parsed.otel.logs.api_key, "direct-secret")

    def test_console_logger_renders_enabled_messages(self):
        with patch.dict("os.environ", {
            "OTEL_BACKEND_EXPORTERS": "console",
            "OTEL_LOG_LEVEL": "info,error",
            "OTEL_LOGS_SAMPLING_RATE": "0",
        }, clear=True):
            logger = CloudOpsLogger("test")

        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            logger.info("created order", {"order_id": 42})
            logger.debug("debug should be disabled")
            logger.error(ValueError("payment failed"))
            logger.export_logs()

        self.assertIn("created order", stdout.getvalue())
        self.assertIn("order_id", stdout.getvalue())
        self.assertNotIn("debug should be disabled", stdout.getvalue())
        self.assertIn("payment failed", stderr.getvalue())

    def test_sampler_processes_directly_when_sampling_is_zero(self):
        class FakeLogger:
            def __init__(self):
                self.processed = []

            def process_log(self, log_entry):
                self.processed.append(log_entry)

        with patch.dict("os.environ", {"OTEL_LOGS_SAMPLING_RATE": "0"}, clear=True):
            self.assertEqual(_sampling_rate(), 0)
            logger = FakeLogger()
            sampler = LogSampler(logger)

        sampler.add_log(LogEntry(invocation_id="batch-1", level="error", message="boom"))
        self.assertEqual([entry.message for entry in logger.processed], ["boom"])

    def test_ssm_parameters_backend_and_empty_detection(self):
        self.assertTrue(SsmParameters().is_empty())

        backend = BackendConfig(logs=LogsExporterConfig(url="https://collector.example.com/v1/logs"))
        parameters = SsmParameters(otel=backend)

        self.assertFalse(parameters.is_empty())
        self.assertIs(parameters.backend("otel"), backend)
        self.assertIsNone(parameters.backend("metrics"))


if __name__ == "__main__":
    unittest.main()
