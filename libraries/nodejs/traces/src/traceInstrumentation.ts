import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  SDKRegistrationConfig,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  SpanProcessor,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import api, {
  Context,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  propagation,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  Tracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

import {
  configureSdkRegistration,
  configureTracer,
  extractEventSourceName,
  isSSMParametersEmpty,
  readSSMParameters,
  setObjectAttributes,
  setSingleAttribute,
} from "./utils";
import { ServiceAttributes, spanProps, SpanAttributes } from "./interface";
import { AwsService } from "./enums";
import { ServicesExtensions } from "./services/serviceExtensions";

const CLOUDOPS_TRACE_VER = "0.1.0";

const ATTR_CLOUD_PLATFORM = "cloud.platform";
const ATTR_CONTAINER_ID = "container.id";
const ATTR_CONTAINER_NAME = "container.name";
const ATTR_FAAS_NAME = "faas.name";
const ATTR_K8S_CLUSTER_NAME = "k8s.cluster.name";
const ATTR_K8S_NAMESPACE_NAME = "k8s.namespace.name";
const ATTR_K8S_NODE_NAME = "k8s.node.name";
const ATTR_K8S_POD_NAME = "k8s.pod.name";
const CLOUD_PLATFORM_VALUE_AWS_ECS = "aws_ecs";
const CLOUD_PLATFORM_VALUE_AWS_EKS = "aws_eks";
const CLOUD_PLATFORM_VALUE_AWS_LAMBDA = "aws_lambda";

// Parses string array.
export function parseStringArray(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return [...fallback];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const values = parsed.map(String).map((item) => item.trim()).filter(Boolean);
      return values.length > 0 ? values : [...fallback];
    }
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [...fallback];
}

// Parses resource attributes.
export function parseResourceAttributes(raw: string | undefined): Record<string, string> {
  if (!raw) return {};

  return raw.split(",").reduce<Record<string, string>>((attributes, item) => {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex <= 0) return attributes;

    const key = item.slice(0, separatorIndex).trim();
    const value = item.slice(separatorIndex + 1).trim();
    if (key && value) attributes[key] = value;

    return attributes;
  }, {});
}

function authHeaders(apiKey: string | undefined): Record<string, string> {
  if (!apiKey) return {};
  return { authorization: `Bearer ${apiKey}` };
}

// Finds first env.
function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }

  return undefined;
}

// Adds runtime resource attributes.
export function addRuntimeResourceAttributes(attributes: Record<string, string>): void {
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    attributes[ATTR_CLOUD_PLATFORM] = CLOUD_PLATFORM_VALUE_AWS_LAMBDA;
    attributes[ATTR_FAAS_NAME] = process.env.AWS_LAMBDA_FUNCTION_NAME;
    return;
  }

  const ecsMetadataUri = firstEnv("ECS_CONTAINER_METADATA_URI_V4", "ECS_CONTAINER_METADATA_URI");
  const runningOnEcs = Boolean(ecsMetadataUri || process.env.ECS_CONTAINER_METADATA_FILE);
  if (runningOnEcs) {
    attributes[ATTR_CLOUD_PLATFORM] = CLOUD_PLATFORM_VALUE_AWS_ECS;
  }

  const runningOnKubernetes = Boolean(process.env.KUBERNETES_SERVICE_HOST);
  const k8sClusterName = firstEnv("K8S_CLUSTER_NAME", "EKS_CLUSTER_NAME");
  const k8sNamespaceName = firstEnv("K8S_NAMESPACE_NAME", "POD_NAMESPACE");
  const k8sNodeName = firstEnv("K8S_NODE_NAME", "NODE_NAME");
  const k8sPodName = firstEnv("K8S_POD_NAME", "POD_NAME", runningOnKubernetes ? "HOSTNAME" : "");

  if (runningOnKubernetes || k8sClusterName || k8sNamespaceName || k8sPodName) {
    attributes[ATTR_CLOUD_PLATFORM] = CLOUD_PLATFORM_VALUE_AWS_EKS;
  }

  if (k8sClusterName) attributes[ATTR_K8S_CLUSTER_NAME] = k8sClusterName;
  if (k8sNamespaceName) attributes[ATTR_K8S_NAMESPACE_NAME] = k8sNamespaceName;
  if (k8sNodeName) attributes[ATTR_K8S_NODE_NAME] = k8sNodeName;
  if (k8sPodName) attributes[ATTR_K8S_POD_NAME] = k8sPodName;

  const containerId = firstEnv("CONTAINER_ID");
  const containerName = firstEnv("CONTAINER_NAME", "ECS_CONTAINER_NAME");
  if (containerId) attributes[ATTR_CONTAINER_ID] = containerId;
  if (containerName) attributes[ATTR_CONTAINER_NAME] = containerName;
}

function traceBaggageAttrs(): Record<string, string> {
  const activeBaggage = propagation.getActiveBaggage();
  if (!activeBaggage) return {};

  const attributes: Record<string, string> = {};
  activeBaggage.getAllEntries().forEach(([key, entry]) => {
    attributes[`baggage.${key}`] = entry.value;
  });

  return attributes;
}

class TraceInstrumentation {
  private isInitialized = false;

  private serviceName: string | undefined = process.env.OTEL_SERVICE_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME;

  private tracerProvider!: NodeTracerProvider;

  private tracer!: Tracer;

  private activeContext!: Context;

  private currentSpan!: Span;

  private static instance?: TraceInstrumentation;

  private batchProcessorConfig!: SpanProcessor;

  private servicesExtensions: ServicesExtensions = new ServicesExtensions();

  private propagationContext!: Context;

  get activeSpan(): Span | undefined {
    return this.currentSpan;
  }

  // Initializes tracer.
  static initialiseTracer(): TraceInstrumentation {
    if (!this.instance) {
      this.instance = new TraceInstrumentation();
      this.instance.init();
    }

    return this.instance;
  }

  private init(): void {
    if (this.isInitialized) return;

    diag.debug("Registering OpenTelemetry");

    if (
      typeof process.env.ENABLE_OTEL_DEBUG_LOGS === "string"
      && process.env.ENABLE_OTEL_DEBUG_LOGS.toLocaleLowerCase() === "true"
    ) {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    const traceRatio = parseFloat(process.env.TRACEID_RATIO_BASED_SAMPLER ?? "1");

    const envResourceAttributes = parseResourceAttributes(process.env.OTEL_RESOURCE_ATTRIBUTES);
    const resourceAttributes: Record<string, string> = {
      ...envResourceAttributes,
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME
        || envResourceAttributes[ATTR_SERVICE_NAME]
        || process.env.AWS_LAMBDA_FUNCTION_NAME
        || process.env.npm_package_name
        || "unknown_service",
      "cloudops-trace-ver": CLOUDOPS_TRACE_VER,
    };

    addRuntimeResourceAttributes(resourceAttributes);

    this.tracerProvider = new NodeTracerProvider(
      configureTracer({
        resource: defaultResource().merge(resourceFromAttributes(resourceAttributes)),
        sampler: new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(traceRatio),
        }),
        spanProcessors: this.spanProcessors(),
      }),
    );

    try {
      let sdkRegistrationConfig: SDKRegistrationConfig = {};
      sdkRegistrationConfig = configureSdkRegistration(sdkRegistrationConfig);
      this.tracerProvider.register(sdkRegistrationConfig);

      registerInstrumentations({
        tracerProvider: this.tracerProvider,
      });

      this.tracer = trace.getTracer(
        `${process.env.AWS_LAMBDA_FUNCTION_NAME || this.serviceName || "cloudops"}-tracer`,
      );
      this.isInitialized = true;
    } catch (e) {
      diag.debug("OTEL register failed", e);
    }
  }

  // The span processor for the configured backend: OTLP when the exporter
  // parameters are present, the console otherwise (also when they cannot be
  // read). The parameters hold an API key, so only the URL is ever logged.
  private spanProcessors(): SpanProcessor[] {
    const backend = parseStringArray(process.env.OTEL_BACKEND_EXPORTERS, ["console"])
      .map((item) => item.toLowerCase())[0];
    if (backend === "otel") {
      try {
        const ssmParams = readSSMParameters();
        if (!isSSMParametersEmpty(ssmParams)) {
          diag.debug(`TraceInstrumentation exporting to ${ssmParams.otel?.trace?.url ?? "(no url)"}`);
          this.batchProcessorConfig = new BatchSpanProcessor(
            new OTLPTraceExporter({
              url: ssmParams.otel?.trace?.url,
              headers: authHeaders(ssmParams.otel?.trace?.api_key),
            }),
          );
          return [this.batchProcessorConfig];
        }
        diag.debug("TraceInstrumentation SSM parameters are empty. Switching tracer to console.");
      } catch (e) {
        diag.debug("TraceInstrumentation could not read the exporter parameters. Switching tracer to console.", e);
      }
    }
    return [new SimpleSpanProcessor(new ConsoleSpanExporter())];
  }

  /**
   * Starts a basic span
   *
   * This method is implemented to start simple span and default proparties
   *
   * @param name Attribute value
   * @param props Properties for startSpan
   *
   * @returns the {@link SpanContext} object associated with this Span.
   */
  startBasicSpan(name: string, props?: spanProps): Span | undefined {
    if (!this.isInitialized) {
      return undefined;
    }

    try {
      const span = this.tracer.startSpan(
        name,
        {
          root: props?.root,
          kind: props?.spanKind ?? SpanKind.INTERNAL,
          attributes: {},
          startTime: new Date(),
        },
        props?.parent || this.activeContext,
      );

      this.setAttributes(span, traceBaggageAttrs());

      if (props?.setActiveContext) {
        this.activeContext = api.trace.setSpan(api.context.active(), span);
      }

      this.currentSpan = span;

      return span;
    } catch (e) {
      diag.debug("startSpan failed", e);
      return undefined;
    }
  }

  /**
   * Sets attributes to the span.
   *
   * Sets number of Attributes based on the input with the key and value passed as arguments.
   *
   * @param data the key and value of the attributes
   */
  setAttributes(span: any, data: SpanAttributes): void {
    if (!span || !this.isInitialized || (!data && !span)) {
      return;
    }

    if (data && typeof data === "object") {
      setObjectAttributes(span, data);
    } else {
      setSingleAttribute(span, data);
    }
  }

  /**
   * Sets the active span status as error span and exception as a span event
   *
   * @param error the exception the only accepted values are string or Error
   */
  recordError(error: any, span?: Span): void {
    if (!this.activeContext) {
      return;
    }

    const recordErrorSpan = span || this.currentSpan;
    try {
      recordErrorSpan?.recordException(error);
      recordErrorSpan?.setStatus({ code: SpanStatusCode.ERROR });
    } catch (e) {
      diag.debug("recordError failed", e);
    }
  }

  /**
   * Sets the active span status as active
   *
   * @param span The span which need to be set as active
   */
  setActiveContext(span: Span | undefined): void {
    if (!span) {
      return;
    }

    this.activeContext = api.trace.setSpan(api.context.active(), span);
  }

  /**
   * Fetch the trace attributes for context propagation
   *
   * If no object is provided the method create a empty object and returns
   * the new object with injected context data
   *
   * @returns attributes object with context attributes
   */
  fetchTraceAttrs(): { [key: string]: string } | undefined {
    const traceAttrs = {};

    api.propagation.inject(api.trace.setSpan(api.context.active(), this.currentSpan), traceAttrs);
    return traceAttrs || undefined;
  }

  /**
   * Extract trace attributes from a carrier
   *
   * For lambda instrumentation this method is called to interanlly handle the context propagation
   *
   * @param event Lambda handler event attributes
   */
  extractTraceAttrs(baggageAttrs: Record<string, string>): void {
    this.propagationContext = api.propagation.extract(api.context.active(), baggageAttrs);
  }

  /**
   * Starts an AWS specific service span
   *
   * This method is implemented to simplify statrting span
   *
   * @param service Type of the aws service
   * @param props Properties for startSpan
   *
   * @returns the {@link SpanContext} object associated with this Span.
   */
  startAwsSpan(service: AwsService, props: ServiceAttributes): Span | undefined {
    let span;
    let eventSpan;

    const metadata = this.servicesExtensions.requestPreSpanHook(service, props);

    if (!metadata.spanName) {
      return undefined;
    }

    if (service === "lambda" && props.lambdaEventAttributes?.event.Records?.length === 0) {
      span = this.startBasicSpan(metadata.spanName, {
        spanKind: metadata.spanKind,
        setActiveContext: true,
        root: true,
        parent: this.propagationContext ? this.propagationContext : undefined,
      });

      this.setAttributes(span, metadata.spanAttributes);

      return span;
    }

    if (service === "lambda") {
      span = this.startBasicSpan(metadata.spanName, {
        root: true,
        spanKind: metadata.spanKind,
        setActiveContext: true,
        parent: this.propagationContext ? this.propagationContext : undefined,
      });

      this.setAttributes(span, metadata.spanAttributes);

      const records = props?.lambdaEventAttributes?.event?.Records;
      const eventSource = records?.[0]?.eventSource || records?.[0]?.EventSource;
      const eventSourceName = extractEventSourceName(eventSource) || "Lambda Event";

      if (Array.isArray(records) && records.length > 1) {
        eventSpan = this.startBasicSpan(`Received '${eventSourceName}' batch records`, {
          spanKind: SpanKind.CONSUMER,
          setActiveContext: true,
        });
      } else {
        eventSpan = this.startBasicSpan(`Received '${eventSourceName}' record`, {
          spanKind: SpanKind.CONSUMER,
          setActiveContext: true,
        });
      }

      eventSpan?.end();
      return span;
    }

    span = this.startBasicSpan(metadata.spanName, {
      spanKind: metadata.spanKind,
      setActiveContext: false,
    });
    this.setAttributes(span, metadata.spanAttributes);

    return span;
  }

  /**
   * Force all the spans to get exported
   *
   * This method should be called when the execution is about to shutdown to make
   * sure all the spans are exported.
   *
   * @returns promise
   */
  async exportSpans(): Promise<void> {
    if (!this.batchProcessorConfig) {
      return;
    }

    await this.batchProcessorConfig.forceFlush();
  }
}

export const tracer = TraceInstrumentation.initialiseTracer();
