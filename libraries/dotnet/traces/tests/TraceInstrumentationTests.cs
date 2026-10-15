// This file contains trace instrumentation tests logic for traces tests.
using System.Diagnostics;
using Xunit;

namespace CloudOps.Otel.Traces.Tests;

public sealed class TraceInstrumentationTests
{
    [Fact]
    // Console tracer starts a span, records an error and propagates B3 context.
    public void ConsoleTracerStartsSpanRecordsErrorAndPropagates()
    {
        using var env = new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_BACKEND_EXPORTERS"] = "console",
            ["OTEL_SERVICE_NAME"] = "orders-api",
            ["TRACEID_RATIO_BASED_SAMPLER"] = "1"
        });

        var originalOut = Console.Out;
        var output = new StringWriter();
        Console.SetOut(output);

        try
        {
            using var tracer = new TraceInstrumentation();
            using var span = tracer.StartBasicSpan("manual-span", new SpanProps { SetActiveContext = true });
            Assert.NotNull(span);

            tracer.SetAttributes(span, new Dictionary<string, object?> { ["order.id"] = 42 });
            tracer.RecordError(new InvalidOperationException("boom"), span);

            var attrs = tracer.FetchTraceAttrs();
            Assert.NotNull(attrs);
            Assert.True(attrs!.ContainsKey("b3"));

            tracer.ExtractTraceAttrs(new Dictionary<string, string>
            {
                ["b3"] = "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1"
            });
            Assert.Equal("0af7651916cd43dd8448eb211c80319c", tracer.PropagationContext.TraceId.ToString());

            span!.Dispose();
            tracer.ExportSpans();
        }
        finally
        {
            Console.SetOut(originalOut);
        }

        Assert.Contains("manual-span", output.ToString());
    }

    [Fact]
    // Child span inherits the active trace context.
    public void ChildSpanInheritsActiveTraceContext()
    {
        using var env = new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_BACKEND_EXPORTERS"] = "console",
            ["OTEL_SERVICE_NAME"] = "ctx-api",
            ["TRACEID_RATIO_BASED_SAMPLER"] = "1"
        });

        var originalOut = Console.Out;
        Console.SetOut(new StringWriter());

        try
        {
            using var tracer = new TraceInstrumentation();
            using var root = tracer.StartBasicSpan("root", new SpanProps { Root = true, SetActiveContext = true });
            using var child = tracer.StartBasicSpan("child");

            Assert.NotNull(root);
            Assert.NotNull(child);
            Assert.Equal(root!.TraceId, child!.TraceId);
        }
        finally
        {
            Console.SetOut(originalOut);
        }
    }

    [Fact]
    // Resource attributes carry the trace library version.
    public void ResourceAttributesIncludeTraceVersion()
    {
        using var env = new EnvironmentScope(new Dictionary<string, string?>
        {
            ["OTEL_BACKEND_EXPORTERS"] = "console",
            ["OTEL_SERVICE_NAME"] = "ver-api"
        });

        using var tracer = new TraceInstrumentation();
        Assert.Equal("0.1.0", tracer.ResourceAttributes["cloudops-trace-ver"]);
        Assert.Equal("ver-api", tracer.ResourceAttributes["service.name"]);
    }
}
