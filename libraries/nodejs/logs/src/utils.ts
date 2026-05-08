export interface LogsExporterConfig {
  url?: string;
  api_key?: string;
}

export interface BackendConfig {
  logs?: LogsExporterConfig;
}

export interface SSMParameters {
  otel?: BackendConfig;
}

function parseJsonEnv<T>(name: string): T | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function normalizeEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  return endpoint.endsWith("/v1/logs") ? endpoint : `${endpoint.replace(/\/$/, "")}/v1/logs`;
}

export function isSSMParametersEmpty(parameters: SSMParameters | undefined): boolean {
  const logs = parameters?.otel?.logs;
  return !logs?.url && !logs?.api_key;
}

export function readSSMParameters(): SSMParameters {
  const configured = parseJsonEnv<SSMParameters>("OTEL_SSM_PARAMETERS");
  if (!isSSMParametersEmpty(configured)) return configured!;

  const otelLogsUrl = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
    || normalizeEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const otelApiKey = process.env.OTEL_API_KEY || process.env.OTEL_EXPORTER_OTLP_HEADERS;

  const params: SSMParameters = {};

  if (otelLogsUrl || otelApiKey) {
    params.otel = {
      logs: {
        url: otelLogsUrl,
        api_key: otelApiKey,
      },
    };
  }

  return params;
}
