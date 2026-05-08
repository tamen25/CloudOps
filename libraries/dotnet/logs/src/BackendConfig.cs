using System.Text.Json.Serialization;

namespace CloudOps.Otel.Logs;

public sealed class BackendConfig
{
    [JsonPropertyName("logs")]
    public LogsExporterConfig? Logs { get; set; }
}
