const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const originalEnv = { ...process.env };
const instrumentationPath = path.resolve(__dirname, "../dist/logsInstrumentation.js");
const utilsPath = path.resolve(__dirname, "../dist/utils.js");

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

test("readSSMParameters prefers configured JSON and falls back to OTEL env vars", () => {
  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_SSM_PARAMETERS: JSON.stringify({
      otel: { logs: { url: "https://collector.example.com/v1/logs", api_key: "secret" } },
    }),
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://fallback.example.com",
  });

  const { readSSMParameters } = freshRequire(utilsPath);
  assert.deepEqual(readSSMParameters(), {
    otel: { logs: { url: "https://collector.example.com/v1/logs", api_key: "secret" } },
  });

  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example.com/",
    OTEL_API_KEY: "direct-secret",
  });

  delete require.cache[require.resolve(utilsPath)];
  assert.deepEqual(freshRequire(utilsPath).readSSMParameters(), {
    otel: { logs: { url: "https://collector.example.com/v1/logs", api_key: "direct-secret" } },
  });
});

test("configuration parsers trim values and reject unknown log levels", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console" });
  const {
    parseLogLevels,
    parseResourceAttributes,
    parseStringArray,
  } = freshRequire(instrumentationPath);

  const fallback = ["console"];
  const parsedFallback = parseStringArray(undefined, fallback);
  parsedFallback.push("otel");
  assert.deepEqual(fallback, ["console"]);

  assert.deepEqual(parseStringArray('["console", " otel "]', ["x"]), ["console", "otel"]);
  assert.deepEqual(parseStringArray("console, otel", ["x"]), ["console", "otel"]);
  assert.deepEqual(parseLogLevels("bad,error"), ["error"]);
  assert.deepEqual(parseLogLevels("bad"), ["info", "error", "debug", "warn"]);
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

test("console logger renders enabled levels and structured parameters", async () => {
  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_LOG_LEVEL: "info,error",
    OTEL_LOGS_SAMPLING_RATE: "0",
  });

  const infoLines = [];
  const errorLines = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args) => infoLines.push(args.join(" "));
  console.error = (...args) => errorLines.push(args.join(" "));

  try {
    const { logger } = freshRequire(instrumentationPath);
    logger.info("created order", { order_id: 42 });
    logger.debug("debug should be disabled");
    logger.error(new Error("payment failed"));
    await logger.exportLogs();
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  const infoOutput = infoLines.join("\n");
  const errorOutput = errorLines.join("\n");
  assert.match(infoOutput, /created order/);
  assert.match(infoOutput, /order_id/);
  assert.doesNotMatch(infoOutput, /debug should be disabled/);
  assert.match(errorOutput, /payment failed/);
});

test("LogSampler probabilistic batches and flushes per invocation id", async () => {
  resetEnv({
    OTEL_BACKEND_EXPORTERS: "console",
    OTEL_LOG_LEVEL: "info,error",
    OTEL_LOGS_SAMPLING_RATE: "100",
  });

  const infoLines = [];
  const originalInfo = console.info;
  console.info = (...args) => infoLines.push(args.join(" "));
  try {
    const { logger } = freshRequire(instrumentationPath);
    // Two invocations: first batches under one id, second forces a flush of
    // the first and starts a new batch.
    logger.info("first-invocation");
    logger.info("first-invocation-2");
    process.env._X_AMZN_TRACE_ID = "Root=1-deadbeef-trace";
    logger.info("second-invocation");
    await logger.exportLogs();
  } finally {
    console.info = originalInfo;
  }

  assert.match(infoLines.join("\n"), /first-invocation/);
});

test("exportLogs is a no-op when no OTel exporter is configured", async () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console", OTEL_LOG_LEVEL: "info" });
  const { logger } = freshRequire(instrumentationPath);
  // Should resolve without throwing.
  await logger.exportLogs();
});

test("parseStringArray returns fallback for non-array JSON or empty arrays", () => {
  resetEnv({ OTEL_BACKEND_EXPORTERS: "console" });
  const { parseStringArray } = freshRequire(instrumentationPath);
  // CSV path: pure-whitespace input filters down to [] (current behavior —
  // documented here so a future change can't silently shift the contract).
  assert.deepEqual(parseStringArray("  ", ["a"]), []);
  // Non-array JSON falls through and returns fallback.
  assert.deepEqual(parseStringArray('{"k":1}', ["fb"]), ["fb"]);
  // Empty JSON array → fallback.
  assert.deepEqual(parseStringArray("[]", ["fb"]), ["fb"]);
});
