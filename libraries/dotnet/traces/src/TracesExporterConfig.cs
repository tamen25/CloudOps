using System.Text.Json.Serialization;

namespace CloudOps.Otel.Traces;

public sealed class TracesExporterConfig
{
    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("api_key")]
    public string? ApiKey { get; set; }
}
