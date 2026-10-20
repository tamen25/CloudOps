using System.Text.Json.Serialization;

namespace CloudOps.Otel.Traces;

public sealed class SsmParameters
{
    [JsonPropertyName("otel")]
    public BackendConfig? Otel { get; set; }

    public bool IsEmpty()
    {
        return Otel?.Trace == null
            || (string.IsNullOrWhiteSpace(Otel.Trace.Url) && string.IsNullOrWhiteSpace(Otel.Trace.ApiKey));
    }

    public BackendConfig? Backend(string name)
    {
        return name == "otel" ? Otel : null;
    }
}
