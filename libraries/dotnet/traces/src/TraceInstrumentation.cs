// This file contains trace instrumentation logic for traces src.
using System.Diagnostics;
using OpenTelemetry;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace CloudOps.Otel.Traces;

public sealed class TraceInstrumentation : IDisposable
{
    private static readonly IReadOnlyList<string> DefaultExporters = ["console"];
    private static readonly Lazy<TraceInstrumentation> Instance = new(() => new TraceInstrumentation());

    private readonly IReadOnlyList<string> exportersList;
    private readonly ActivitySource source;
    private readonly string sourceName;
    private TracerProvider? tracerProvider;
    private ActivityContext activeContext;
    private ActivityContext propagationContext;
    private Activity? currentSpan;

    // Handles trace instrumentation.
    internal TraceInstrumentation()
    {
        ResourceAttributes = RuntimeResourceAttributes.Create();
        exportersList = TracesConfiguration.ParseStringArray(Environment.GetEnvironmentVariable("OTEL_BACKEND_EXPORTERS"), DefaultExporters);
        sourceName = ResourceAttributes.GetValueOrDefault("service.name", "unknown_service") + "-tracer";
        source = new ActivitySource(sourceName);
        Init();
    }

    public IReadOnlyDictionary<string, string> ResourceAttributes { get; }

    public Activity? ActiveSpan => currentSpan;

    public ActivityContext PropagationContext => propagationContext;

    // Initializes tracer.
    public static TraceInstrumentation InitialiseTracer()
    {
        return Instance.Value;
    }

    // Initializes tracer.
    public static TraceInstrumentation InitializeTracer()
    {
        return Instance.Value;
    }

    // Initializes the requested work.
    private void Init()
    {
        var builder = Sdk.CreateTracerProviderBuilder()
            .AddSource(sourceName)
            .SetResourceBuilder(ResourceBuilder.CreateDefault().AddAttributes(
                ResourceAttributes.Select(item => new KeyValuePair<string, object>(item.Key, item.Value))))
            .SetSampler(new ParentBasedSampler(new TraceIdRatioBasedSampler(TracesConfiguration.SamplerRatio())));

        var backend = exportersList.Count >= 1 ? exportersList[0].Trim().ToLowerInvariant() : "console";
        if (backend == "otel")
        {
            var config = TracesConfiguration.ReadSsmParameters().Backend("otel")?.Trace;
            if (config is null)
            {
                builder.AddProcessor(new SimpleActivityExportProcessor(new ConsoleActivityExporter()));
            }
            else
            {
                builder.AddOtlpExporter(options =>
                {
                    options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.HttpProtobuf;
                    if (TracesConfiguration.HasValue(config.Url))
                    {
                        options.Endpoint = new Uri(config.Url!);
                    }
                    if (TracesConfiguration.HasValue(config.ApiKey))
                    {
                        options.Headers = $"authorization=Bearer {config.ApiKey}";
                    }
                });
            }
        }
        else
        {
            builder.AddProcessor(new SimpleActivityExportProcessor(new ConsoleActivityExporter()));
        }

        tracerProvider = builder.Build();
    }

    // Starts a basic span.
    public Activity? StartBasicSpan(string name, SpanProps? props = null)
    {
        var options = props ?? new SpanProps();
        var kind = options.SpanKind ?? ActivityKind.Internal;

        Activity? span;
        if (options.Parent is ActivityContext parent && parent != default)
        {
            span = source.StartActivity(name, kind, parent);
        }
        else if (options.Root)
        {
            span = source.StartActivity(name, kind, default(ActivityContext));
        }
        else if (activeContext != default)
        {
            span = source.StartActivity(name, kind, activeContext);
        }
        else
        {
            span = source.StartActivity(name, kind);
        }

        if (span is null) return null;

        SetAttributes(span, TraceBaggageAttrs());

        if (options.SetActiveContext)
        {
            activeContext = span.Context;
        }

        currentSpan = span;
        return span;
    }

    // Sets attributes to the span.
    public void SetAttributes(Activity? span, IReadOnlyDictionary<string, object?> data)
    {
        if (span is null || data is null) return;

        foreach (var (key, value) in data)
        {
            if (value is not null)
            {
                span.SetTag(key, value);
            }
        }
    }

    // Records an error on the span.
    public void RecordError(Exception error, Activity? span = null)
    {
        var target = span ?? currentSpan;
        if (target is null) return;

        // Activity.AddException is only available on net9.0+, so RecordException
        // remains the correct call for the net8.0 target framework.
#pragma warning disable CS0618
        target.RecordException(error);
#pragma warning restore CS0618
        target.SetStatus(ActivityStatusCode.Error);
    }

    // Sets the active span context.
    public void SetActiveContext(Activity? span)
    {
        if (span is null) return;
        activeContext = span.Context;
    }

    // The active span as a propagation carrier for a message (SNS, SQS): W3C
    // `traceparent`, which every OpenTelemetry SDK reads by default, and B3
    // single-header `b3` for consumers that only know B3.
    public IReadOnlyDictionary<string, string>? FetchTraceAttrs()
    {
        var span = currentSpan;
        if (span is null) return null;

        var context = span.Context;
        var sampled = (context.TraceFlags & ActivityTraceFlags.Recorded) != 0;
        return new Dictionary<string, string>
        {
            ["traceparent"] = $"00-{context.TraceId}-{context.SpanId}-{(sampled ? "01" : "00")}",
            ["b3"] = $"{context.TraceId}-{context.SpanId}-{(sampled ? "1" : "0")}"
        };
    }

    // Reads a carrier into the parent context for the next root span. W3C
    // `traceparent` wins (TryParse rejects a malformed one, as the spec
    // requires); B3 single-header `b3` is the fallback.
    public void ExtractTraceAttrs(IReadOnlyDictionary<string, string> carrier)
    {
        if (carrier is null) return;

        if (carrier.TryGetValue("traceparent", out var traceparent)
            && ActivityContext.TryParse(traceparent, null, isRemote: true, out var w3c))
        {
            propagationContext = w3c;
            return;
        }

        if ((!carrier.TryGetValue("b3", out var raw) || string.IsNullOrWhiteSpace(raw))
            && (!carrier.TryGetValue("B3", out raw) || string.IsNullOrWhiteSpace(raw)))
        {
            return;
        }

        var parts = raw.Split('-');
        if (parts.Length < 2) return;

        try
        {
            var traceId = ActivityTraceId.CreateFromString(parts[0]);
            var spanId = ActivitySpanId.CreateFromString(parts[1]);
            var sampled = parts.Length < 3 || parts[2] == "1" || string.Equals(parts[2], "d", StringComparison.OrdinalIgnoreCase);
            propagationContext = new ActivityContext(
                traceId,
                spanId,
                sampled ? ActivityTraceFlags.Recorded : ActivityTraceFlags.None,
                isRemote: true);
        }
        catch (ArgumentOutOfRangeException)
        {
            // Invalid trace/span id lengths — ignore the carrier.
        }
    }

    // Force all the spans to get exported.
    public void ExportSpans()
    {
        tracerProvider?.ForceFlush(30000);
    }

    // Builds active baggage attributes.
    private static IReadOnlyDictionary<string, object?> TraceBaggageAttrs()
    {
        var attributes = new Dictionary<string, object?>(StringComparer.Ordinal);
        var activity = Activity.Current;
        if (activity is not null)
        {
            foreach (var baggage in activity.Baggage)
            {
                attributes[$"baggage.{baggage.Key}"] = baggage.Value ?? string.Empty;
            }
        }

        return attributes;
    }

    // Handles dispose.
    public void Dispose()
    {
        tracerProvider?.Dispose();
        source.Dispose();
    }
}
