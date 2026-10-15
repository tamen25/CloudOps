package com.cloudops.otel.traces;

import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.propagation.TextMapGetter;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.SpanContext;
import io.opentelemetry.api.trace.SpanId;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.TraceFlags;
import io.opentelemetry.api.trace.TraceId;
import io.opentelemetry.api.trace.TraceState;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.SpanProcessor;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class TraceInstrumentation {
  private static final String[] DEFAULT_EXPORTERS = {"console"};
  private static volatile TraceInstrumentation instance;

  private final Map<String, String> resourceAttributes;
  private final String[] exportersList;
  private SdkTracerProvider tracerProvider;
  private Tracer tracer;
  private boolean useConsole;
  private boolean useOtel;
  private Context activeContext;
  private Context propagationContext;
  private Span currentSpan;

  TraceInstrumentation() {
    this.resourceAttributes = RuntimeResourceAttributes.create();
    this.exportersList = TracesConfiguration.parseStringArray(System.getenv("OTEL_BACKEND_EXPORTERS"), DEFAULT_EXPORTERS);
    init();
  }

  // Initializes tracer.
  public static TraceInstrumentation initialiseTracer() {
    return initializeTracer();
  }

  // Initializes tracer.
  public static TraceInstrumentation initializeTracer() {
    TraceInstrumentation localInstance = instance;
    if (localInstance == null) {
      synchronized (TraceInstrumentation.class) {
        localInstance = instance;
        if (localInstance == null) {
          localInstance = new TraceInstrumentation();
          instance = localInstance;
        }
      }
    }

    return localInstance;
  }

  public Map<String, String> resourceAttributes() {
    return resourceAttributes;
  }

  public Span activeSpan() {
    return currentSpan;
  }

  public Context propagationContext() {
    return propagationContext;
  }

  // Initializes the requested work.
  private void init() {
    Sampler sampler = Sampler.parentBased(Sampler.traceIdRatioBased(TracesConfiguration.samplerRatio()));

    SpanProcessor processor;
    if (exportersList.length >= 1 && "otel".equalsIgnoreCase(exportersList[0].trim())) {
      SsmParameters ssmParameters = TracesConfiguration.readSsmParameters();
      if (ssmParameters == null || ssmParameters.isEmpty()) {
        processor = SimpleSpanProcessor.create(new ConsoleSpanExporter());
        useConsole = true;
      } else {
        BackendConfig backendConfig = ssmParameters.backend("otel");
        var exporterBuilder = OtlpHttpSpanExporter.builder();
        if (TracesConfiguration.hasValue(backendConfig.trace.url)) {
          exporterBuilder.setEndpoint(backendConfig.trace.url);
        }
        if (TracesConfiguration.hasValue(backendConfig.trace.apiKey)) {
          exporterBuilder.addHeader("authorization", "Bearer " + backendConfig.trace.apiKey);
        }
        processor = BatchSpanProcessor.builder(exporterBuilder.build()).build();
        useOtel = true;
      }
    } else {
      processor = SimpleSpanProcessor.create(new ConsoleSpanExporter());
      useConsole = true;
    }

    tracerProvider = SdkTracerProvider.builder()
        .setResource(Resource.getDefault().merge(resource()))
        .setSampler(sampler)
        .addSpanProcessor(processor)
        .build();

    OpenTelemetry openTelemetry = OpenTelemetrySdk.builder()
        .setTracerProvider(tracerProvider)
        .build();
    tracer = openTelemetry.getTracer(resourceAttributes.getOrDefault("service.name", "unknown_service") + "-tracer");
  }

  // Starts a basic span.
  public Span startBasicSpan(String name, SpanProps props) {
    if (tracer == null) return null;

    SpanProps options = props == null ? new SpanProps() : props;

    try {
      SpanBuilder builder = tracer.spanBuilder(name)
          .setSpanKind(options.spanKind == null ? SpanKind.INTERNAL : options.spanKind);

      if (options.parent != null) {
        builder.setParent(options.parent);
      } else if (options.root) {
        builder.setNoParent();
      } else if (activeContext != null) {
        builder.setParent(activeContext);
      }

      Span span = builder.startSpan();
      setAttributes(span, traceBaggageAttrs());

      if (options.setActiveContext) {
        activeContext = Context.current().with(span);
      }

      currentSpan = span;
      return span;
    } catch (RuntimeException error) {
      return null;
    }
  }

  public void setAttributes(Span span, Map<String, ?> data) {
    if (span == null || data == null) return;

    data.forEach((key, value) -> {
      if (value != null) {
        span.setAttribute(key, String.valueOf(value));
      }
    });
  }

  // Records an error on the span.
  public void recordError(Throwable error, Span span) {
    Span target = span != null ? span : currentSpan;
    if (target == null) return;

    target.recordException(error);
    target.setStatus(StatusCode.ERROR);
  }

  public void setActiveContext(Span span) {
    if (span == null) return;
    activeContext = Context.current().with(span);
  }

  // The active span as a propagation carrier for a message (SNS, SQS): W3C
  // `traceparent`, which every OpenTelemetry SDK reads by default, and B3
  // single-header `b3` for consumers that only know B3.
  public Map<String, String> fetchTraceAttrs() {
    if (currentSpan == null) return null;

    SpanContext spanContext = currentSpan.getSpanContext();
    if (!spanContext.isValid()) return null;

    Map<String, String> carrier = new HashMap<>();
    W3CTraceContextPropagator.getInstance().inject(Context.root().with(currentSpan), carrier, Map::put);
    carrier.put(
        "b3",
        spanContext.getTraceId() + "-" + spanContext.getSpanId() + "-" + (spanContext.isSampled() ? "1" : "0"));
    return carrier;
  }

  // Reads a carrier into the parent context for the next root span. W3C
  // `traceparent` wins (the propagator ignores a malformed one, as the spec
  // requires); B3 single-header `b3` is the fallback.
  public void extractTraceAttrs(Map<String, String> carrier) {
    if (carrier == null) return;

    Context w3c = W3CTraceContextPropagator.getInstance().extract(Context.root(), carrier, MAP_GETTER);
    if (Span.fromContext(w3c).getSpanContext().isValid()) {
      propagationContext = w3c;
      return;
    }

    String raw = carrier.getOrDefault("b3", carrier.get("B3"));
    if (!TracesConfiguration.hasValue(raw)) return;

    String[] parts = raw.split("-");
    if (parts.length < 2 || !TraceId.isValid(parts[0]) || !SpanId.isValid(parts[1])) return;

    boolean sampled = parts.length < 3 || "1".equals(parts[2]) || "d".equalsIgnoreCase(parts[2]);
    SpanContext remote = SpanContext.createFromRemoteParent(
        parts[0], parts[1], sampled ? TraceFlags.getSampled() : TraceFlags.getDefault(), TraceState.getDefault());
    propagationContext = Context.root().with(Span.wrap(remote));
  }

  private static final TextMapGetter<Map<String, String>> MAP_GETTER =
      new TextMapGetter<>() {
        @Override
        public Iterable<String> keys(Map<String, String> carrier) {
          return carrier.keySet();
        }

        @Override
        public String get(Map<String, String> carrier, String key) {
          return carrier == null ? null : carrier.get(key);
        }
      };

  // Force all the spans to get exported.
  public void exportSpans() {
    if (tracerProvider == null) return;

    CompletableResultCode resultCode = tracerProvider.forceFlush();
    resultCode.join(30, TimeUnit.SECONDS);
  }

  private Resource resource() {
    io.opentelemetry.sdk.resources.ResourceBuilder builder = Resource.builder();
    resourceAttributes.forEach(builder::put);
    return builder.build();
  }

  private static Map<String, String> traceBaggageAttrs() {
    Map<String, String> attributes = new HashMap<>();
    Baggage.current().forEach((key, entry) -> attributes.put("baggage." + key, entry.getValue()));
    return attributes;
  }
}
