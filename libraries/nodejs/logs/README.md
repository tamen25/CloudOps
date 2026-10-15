<!-- This document explains readme for CloudOps. -->
# @cloudops/otel-logs

Node.js/TypeScript OpenTelemetry logs helper for CloudOps services.

```ts
import { logger } from "@cloudops/otel-logs";

logger.info("order created", { orderId });
logger.error(error);

await logger.exportLogs();
```

The logger supports console output by default and OTLP export when configured
with `OTEL_BACKEND_EXPORTERS=["otel"]`.

## OTLP configuration

When OTLP export is enabled, configuration is resolved in this order:

1. `OTEL_SSM_PARAMETERS` as JSON:
   `{"otel":{"logs":{"url":"https://otel.example.com/v1/logs","api_key":"..."}}}`
2. `/tmp/otelExporterParams.json`, matching the shared exporter parameter contract.
   Set `OTEL_SSM_PARAMETERS_FILE` to override the path for tests or local runs.
3. Direct OpenTelemetry env vars:
   `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
   `OTEL_API_KEY`, and `OTEL_EXPORTER_OTLP_HEADERS`.

## Runtime resource attributes

Set `OTEL_SERVICE_NAME` in every app. The library uses it as `service.name`.
It also merges `OTEL_RESOURCE_ATTRIBUTES`, so app or deployment metadata such
as `deployment.environment=dev,k8s.cluster.name=cloudops-dev-cluster` is kept
on exported log records.

The library also detects the AWS runtime and adds OpenTelemetry resource
attributes without requiring deprecated semantic-convention constants:

| Runtime | Detection | Attributes added |
| --- | --- | --- |
| Lambda | `AWS_LAMBDA_FUNCTION_NAME` | `cloud.platform=aws_lambda`, `faas.name` |
| ECS | `ECS_CONTAINER_METADATA_URI_V4`, `ECS_CONTAINER_METADATA_URI`, or `ECS_CONTAINER_METADATA_FILE` | `cloud.platform=aws_ecs`, optional container attributes |
| EKS | `KUBERNETES_SERVICE_HOST` or injected `K8S_*` values | `cloud.platform=aws_eks`, optional Kubernetes attributes |

For EKS, expose these env vars from the Kubernetes downward API when possible:
`K8S_CLUSTER_NAME`, `K8S_NAMESPACE_NAME`, `K8S_POD_NAME`, `K8S_NODE_NAME`, and
`CONTAINER_NAME`. The pod `HOSTNAME` is used as a fallback pod name when the app
is running inside Kubernetes.
