const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const originalEnv = { ...process.env };
const instrumentationPath = path.resolve(__dirname, "../dist/traceInstrumentation.js");
const utilsPath = path.resolve(__dirname, "../dist/utils.js");

// Resets env.
function resetEnv(overrides = {}) {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, originalEnv, overrides);
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("OTEL_")
      || key.startsWith("AWS_")
      || key.startsWith("ECS_")
      || key.startsWith("K8S_")
      || key.startsWith("POD_")
      || key.startsWith("CONTAINER_")
      || key === "HOSTNAME"
      || key === "KUBERNETES_SERVICE_HOST"
      || key === "TRACEID_RATIO_BASED_SAMPLER"
      || key === "_X_AMZN_TRACE_ID"
      || key === "npm_package_name"
    ) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, overrides);
}

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test.afterEach(() => {
  resetEnv();
  delete require.cache[require.resolve(instrumentationPath)];
  delete require.cache[require.resolve(utilsPath)];
});

test("readSSMParameters prefers configured JSON and falls back to OTEL trace env vars", () => {
  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_SSM_PARAMETERS: JSON.stringify({
      otel: { trace: { url: "https://collector.example.com/v1/traces", api_key: "secret" } },
    }),
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://fallback.example.com",
  });

  const { readSSMParameters } = freshRequire(utilsPath);
  assert.deepEqual(readSSMParameters(), {
    otel: { trace: { url: "https://collector.example.com/v1/traces", api_key: "secret" } },
  });

  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example.com/",
    OTEL_API_KEY: "direct-secret",
  });

  delete require.cache[require.resolve(utilsPath)];
  assert.deepEqual(freshRequire(utilsPath).readSSMParameters(), {
    otel: { trace: { url: "https://collector.example.com/v1/traces", api_key: "direct-secret" } },
  });
});

test("readSSMParameters supports the otelExporterParams file path", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudops-otel-traces-"));
  const paramsFile = path.join(tempDir, "otelExporterParams.json");

  try {
    fs.writeFileSync(paramsFile, JSON.stringify({
      otel: { trace: { url: "https://file.example.com/v1/traces", api_key: "file-secret" } },
    }));

    resetEnv({
      OTEL_BACKEND_EXPORTERS: "console",
      OTEL_SSM_PARAMETERS_FILE: paramsFile,
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://fallback.example.com",
      OTEL_API_KEY: "fallback-secret",
    });

    const { readSSMParameters } = freshRequire(utilsPath);
    assert.deepEqual(readSSMParameters(), {
      otel: { trace: { url: "https://file.example.com/v1/traces", api_key: "file-secret" } },
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("isSSMParametersEmpty detects empty and populated trace configs", () => {
  const { isSSMParametersEmpty } = freshRequire(utilsPath);
  assert.equal(isSSMParametersEmpty(undefined), true);
  assert.equal(isSSMParametersEmpty({}), true);
  assert.equal(isSSMParametersEmpty({ otel: { trace: {} } }), true);
  assert.equal(isSSMParametersEmpty({ otel: { trace: { url: "https://x/v1/traces" } } }), false);
});

test("extractAccountId and extractEventSourceName parse ARNs", () => {
  const { extractAccountId, extractEventSourceName } = freshRequire(utilsPath);
  assert.equal(
    extractAccountId("arn:aws:lambda:us-east-1:123456789012:function:orders"),
    "123456789012",
  );
  assert.equal(extractAccountId(undefined), undefined);
  assert.equal(extractEventSourceName("aws:sns"), "sns");
});

test("configuration parsers trim values and reject empty arrays", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console" });
  const { parseStringArray, parseResourceAttributes } = freshRequire(instrumentationPath);

  const fallback = ["console"];
  const parsedFallback = parseStringArray(undefined, fallback);
  parsedFallback.push("otel");
  assert.deepEqual(fallback, ["console"]);

  assert.deepEqual(parseStringArray('["console", " otel "]', ["x"]), ["console", "otel"]);
  assert.deepEqual(parseStringArray("console, otel", ["x"]), ["console", "otel"]);
  assert.deepEqual(
    parseResourceAttributes("service.name=orders,empty=,deployment.environment=dev"),
    { "service.name": "orders", "deployment.environment": "dev" },
  );
});

test("runtime resource attributes identify Lambda and Kubernetes environments", () => {
  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    AWS_LAMBDA_FUNCTION_NAME: "orders-handler",
  });
  const { addRuntimeResourceAttributes } = freshRequire(instrumentationPath);

  const lambdaAttributes = {};
  addRuntimeResourceAttributes(lambdaAttributes);
  assert.equal(lambdaAttributes["cloud.platform"], "aws_lambda");
  assert.equal(lambdaAttributes["faas.name"], "orders-handler");

  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    KUBERNETES_SERVICE_HOST: "10.0.0.1",
    K8S_CLUSTER_NAME: "cloudops-dev",
    POD_NAMESPACE: "cloudops",
    HOSTNAME: "orders-pod",
    CONTAINER_NAME: "orders",
  });
  delete require.cache[require.resolve(instrumentationPath)];

  const { addRuntimeResourceAttributes: addKubernetesAttributes } = freshRequire(instrumentationPath);
  const kubernetesAttributes = {};
  addKubernetesAttributes(kubernetesAttributes);
  assert.equal(kubernetesAttributes["cloud.platform"], "aws_eks");
  assert.equal(kubernetesAttributes["k8s.cluster.name"], "cloudops-dev");
  assert.equal(kubernetesAttributes["k8s.namespace.name"], "cloudops");
  assert.equal(kubernetesAttributes["k8s.pod.name"], "orders-pod");
  assert.equal(kubernetesAttributes["container.name"], "orders");
});

test("tracer starts a basic span and exports without an OTLP exporter", async () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);

  const span = tracer.startBasicSpan("manual-span");
  assert.ok(span, "expected a span to be returned when console exporter is active");
  span.end();

  // No OTLP batch processor is configured for the console exporter, so this is a no-op.
  await tracer.exportSpans();
});

test("startAwsSpan builds a service span from the SNS extension", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);

  const span = tracer.startAwsSpan("sns", { snsAttributes: { topicName: "orders-topic" } });
  assert.ok(span, "expected an SNS service span");
  span.end();
});

test("startAwsSpan returns undefined for an unknown service", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);

  assert.equal(tracer.startAwsSpan("unknown-service", {}), undefined);
});

test("startAwsSpan builds a span for every supported AWS service", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);

  const cases = [
    ["sqs", { sqsAttributes: { queueName: "orders-queue", queueARN: "arn:aws:sqs:...:orders" } }],
    ["kinesis", { kinesisAttributes: { streamName: "orders-stream", shardId: "shard-1" } }],
    ["dynamodb", { dynamoDbAttributes: { tableName: "orders", operation: "PutItem" } }],
    ["neptunedb", { neptuneDbAttributes: { clusterIdentifier: "orders-cluster", databaseName: "orders" } }],
    ["timestreamdb", { timestreamDbAttributes: { databaseName: "orders-db", tableName: "events" } }],
    ["eventbridge", { eventBridgeAttributes: { eventBusName: "orders-bus", source: "orders" } }],
    ["s3", { s3Attributes: { bucketName: "orders-bucket", objectKey: "o/1" } }],
    ["apigateway", { apiGatewayAttributes: { apiName: "orders-api", httpMethod: "POST", path: "/orders" } }],
  ];

  for (const [service, props] of cases) {
    const span = tracer.startAwsSpan(service, props);
    assert.ok(span, `expected a span for ${service}`);
    span.end();
  }
});

test("startAwsSpan handles lambda batch and empty record events", () => {
  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_SERVICE_NAME: "orders-api",
    AWS_LAMBDA_FUNCTION_NAME: "orders-handler",
  });
  const { tracer } = freshRequire(instrumentationPath);

  const context = { awsRequestId: "req-1", invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789012:function:orders" };

  const emptyRecords = tracer.startAwsSpan("lambda", { lambdaEventAttributes: { event: { Records: [] }, context } });
  assert.ok(emptyRecords, "expected a span for an empty-records lambda event");
  emptyRecords.end();

  const batch = tracer.startAwsSpan("lambda", {
    lambdaEventAttributes: {
      event: { Records: [{ eventSource: "aws:sqs" }, { eventSource: "aws:sqs" }] },
      context,
    },
  });
  assert.ok(batch, "expected a span for a batch lambda event");
  batch.end();
});

test("tracer records errors, sets active context, and propagates trace attributes", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);

  const span = tracer.startBasicSpan("root", { setActiveContext: true });
  assert.ok(span);

  tracer.setAttributes(span, "single-attribute");
  tracer.setActiveContext(span);
  tracer.recordError(new Error("boom"), span);

  const traceAttrs = tracer.fetchTraceAttrs();
  assert.equal(typeof traceAttrs, "object");

  // Round-trips through extract without throwing.
  tracer.extractTraceAttrs({ b3: "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1" });

  span.end();
});

// A carrier is W3C first: other OpenTelemetry SDKs read and write
// `traceparent` by default; B3 stays as the fallback.
test("trace attributes use W3C and fall back to B3", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);
  const api = require("@opentelemetry/api");

  const span = tracer.startBasicSpan("root", { setActiveContext: true });
  const carrier = tracer.fetchTraceAttrs();
  span.end();
  assert.match(carrier.traceparent ?? "", /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  assert.ok(carrier.b3, "carrier keeps b3");

  const traceIdAfter = (headers) => {
    tracer.extractTraceAttrs(headers);
    return api.trace.getSpanContext(tracer.propagationContext)?.traceId;
  };
  const b3 = "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1";
  assert.equal(
    traceIdAfter({ traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01", b3 }),
    "4bf92f3577b34da6a3ce929d0e0e4736",
  );
  assert.equal(traceIdAfter({ b3 }), "0af7651916cd43dd8448eb211c80319c");
});

test("SNS and SQS extensions retrieve W3C and B3 propagation attributes, nothing else", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  const { tracer } = freshRequire(instrumentationPath);
  const { SnsServiceExtension } = freshRequire(path.resolve(__dirname, "../dist/services/SnsServiceExtension.js"));
  const { SqsServiceExtension } = freshRequire(path.resolve(__dirname, "../dist/services/SqsServiceExtension.js"));

  const span = tracer.startBasicSpan("propagation-root", { setActiveContext: true });

  const sns = new SnsServiceExtension();
  const snsAttrs = sns.requestPropagationAttributes(span);
  assert.equal(typeof snsAttrs, "object");
  assert.deepEqual(
    sns.retrievePropagationAttributes({ Records: [{ Sns: { MessageAttributes: {
      traceparent: { Value: "trace-w3c" }, b3: { Value: "trace-b3" }, orderId: { Value: "42" },
    } } }] }),
    { traceparent: "trace-w3c", b3: "trace-b3" },
  );

  const sqs = new SqsServiceExtension();
  const sqsAttrs = sqs.requestPropagationAttributes(span);
  assert.equal(typeof sqsAttrs, "object");
  assert.deepEqual(
    sqs.retrievePropagationAttributes({ Records: [{ messageAttributes: {
      traceparent: { stringValue: "trace-w3c" }, b3: { stringValue: "trace-b3" }, orderId: { stringValue: "42" },
    } }] }),
    { traceparent: "trace-w3c", b3: "trace-b3" },
  );

  span?.end();
});

test("service registry gates propagation to supported services", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_SERVICE_NAME: "orders-api" });
  freshRequire(instrumentationPath);
  const { ServicesExtensions } = freshRequire(path.resolve(__dirname, "../dist/services/serviceExtensions.js"));

  const registry = new ServicesExtensions();
  assert.deepEqual(registry.requestPreSpanHook("unknown", {}), {});
  // dynamodb is not a valid propagation service, so it is gated out.
  assert.equal(registry.requestPropagationAttributes({}, "dynamodb"), undefined);
  assert.equal(registry.retrievePropagationAttributes({}, "dynamodb"), undefined);
});
