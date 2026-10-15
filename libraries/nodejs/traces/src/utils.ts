// This file contains utils logic for traces src.
import { diag } from "@opentelemetry/api";
import { readFileSync } from "fs";
import { AWSXRayIdGenerator } from "@opentelemetry/id-generator-aws-xray";
import { SDKRegistrationConfig } from "@opentelemetry/sdk-trace-base";
import { NodeTracerConfig } from "@opentelemetry/sdk-trace-node";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { B3Propagator } from "@opentelemetry/propagator-b3";

const DEFAULT_SSM_PARAMETERS_FILE = "/tmp/otelExporterParams.json";

export interface TracesExporterConfig {
  url?: string;
  api_key?: string;
}

export interface BackendConfig {
  trace?: TracesExporterConfig;
}

export interface SSMParameters {
  otel?: BackendConfig;
}

// Configures sdk registration.
export function configureSdkRegistration(config: SDKRegistrationConfig): SDKRegistrationConfig {
  return {
    ...config,
    // W3C trace context is what every OpenTelemetry SDK reads by default; B3
    // stays for consumers that only know it. Injection writes all of them. On
    // extraction the last propagator that finds a header wins, so W3C goes
    // last and beats B3 when a carrier holds both.
    propagator: new CompositePropagator({
      propagators: [new B3Propagator(), new W3CBaggagePropagator(), new W3CTraceContextPropagator()],
    }),
  };
}

// Configures tracer.
export function configureTracer(config: NodeTracerConfig): NodeTracerConfig {
  return {
    ...config,
    idGenerator: new AWSXRayIdGenerator(),
    forceFlushTimeoutMillis: 90000,
  };
}

// Extracts account id.
export function extractAccountId(arn: string | undefined): string | undefined {
  if (arn) {
    const parts = arn.split(":");
    if (parts.length >= 5) {
      return parts[4];
    }
  }

  return undefined;
}

// Extracts service name.
export function extractServiceName(arn: string | undefined): string | undefined {
  if (arn) {
    const parts = arn.split(":");
    if (parts.length >= 5) {
      return parts[5];
    }
  }

  return undefined;
}

// Extracts event source name.
export function extractEventSourceName(arn: string | undefined): string | undefined {
  if (arn) {
    const parts = arn.split(":");
    if (parts.length >= 1) {
      return parts[1];
    }
  }

  return undefined;
}

// Gets attribute value.
export function getAttributeValue(value: number | string | undefined): string | undefined {
  if (typeof value === "number") {
    return value.toString();
  }

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

// Sets object attributes.
export function setObjectAttributes(span: any, data: { [key: string]: number | string | undefined }): void {
  try {
    for (const key in data) {
      if (data[key]) {
        span.setAttribute(key, getAttributeValue(data[key]));
      }
    }
  } catch (e) {
    diag.debug("setObjectAttributes failed", e);
  }
}

// Sets single attribute.
export function setSingleAttribute(span: any, data: string | undefined): void {
  try {
    if (data) {
      span.setAttribute(data);
    }
  } catch (e) {
    diag.debug("setSingleAttribute failed", e);
  }
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

// Normalizes endpoint.
function normalizeEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  return endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint.replace(/\/$/, "")}/v1/traces`;
}

// Checks whether ssmparameters empty.
export function isSSMParametersEmpty(parameters: SSMParameters | null | undefined): boolean {
  const trace = parameters?.otel?.trace;
  return !trace?.url && !trace?.api_key;
}

// Reads ssmparameters file.
export function readSSMParametersFile(
  filePath = process.env.OTEL_SSM_PARAMETERS_FILE || DEFAULT_SSM_PARAMETERS_FILE,
): SSMParameters | undefined {
  try {
    const fileContent = JSON.parse(readFileSync(filePath, "utf-8")) as SSMParameters | null;
    return fileContent ?? undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      diag.error("Error reading or parsing otelExporterParams.json:", error);
    }

    return undefined;
  }
}

// Reads ssmparameters.
export function readSSMParameters(): SSMParameters {
  const configured = parseJsonEnv<SSMParameters>("OTEL_SSM_PARAMETERS");
  if (!isSSMParametersEmpty(configured)) return configured!;

  const fileParameters = readSSMParametersFile();
  if (!isSSMParametersEmpty(fileParameters)) return fileParameters!;

  const otelTracesUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    || normalizeEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const otelApiKey = process.env.OTEL_API_KEY || process.env.OTEL_EXPORTER_OTLP_HEADERS;

  const params: SSMParameters = {};

  if (otelTracesUrl || otelApiKey) {
    params.otel = {
      trace: {
        url: otelTracesUrl,
        api_key: otelApiKey,
      },
    };
  }

  return params;
}
