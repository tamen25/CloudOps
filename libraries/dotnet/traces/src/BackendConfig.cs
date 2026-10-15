// This file contains backend config logic for traces src.
using System.Text.Json.Serialization;

namespace CloudOps.Otel.Traces;

public sealed class BackendConfig
{
    [JsonPropertyName("trace")]
    public TracesExporterConfig? Trace { get; set; }
}
