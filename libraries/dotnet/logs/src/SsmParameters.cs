using System.Text.Json.Serialization;

namespace CloudOps.Otel.Logs;

public sealed class SsmParameters
{
    [JsonPropertyName("otel")]
    public BackendConfig? Otel { get; set; }

    public bool IsEmpty()
    {
        return Otel?.Logs == null
            || (string.IsNullOrWhiteSpace(Otel.Logs.Url) && string.IsNullOrWhiteSpace(Otel.Logs.ApiKey));
    }

    public BackendConfig? Backend(string name)
    {
        return name == "otel" ? Otel : null;
    }
}
