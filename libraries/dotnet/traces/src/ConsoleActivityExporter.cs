using System.Diagnostics;
using OpenTelemetry;

namespace CloudOps.Otel.Traces;

// A minimal exporter that writes finished spans to stdout. Keeps the console
// default dependency-free (no OpenTelemetry.Exporter.Console package needed).
internal sealed class ConsoleActivityExporter : BaseExporter<Activity>
{
    public override ExportResult Export(in Batch<Activity> batch)
    {
        foreach (var activity in batch)
        {
            Console.WriteLine(
                $"{{\"name\":\"{activity.DisplayName}\",\"traceId\":\"{activity.TraceId}\","
                + $"\"spanId\":\"{activity.SpanId}\",\"kind\":\"{activity.Kind}\",\"status\":\"{activity.Status}\"}}");
        }

        return ExportResult.Success;
    }
}
