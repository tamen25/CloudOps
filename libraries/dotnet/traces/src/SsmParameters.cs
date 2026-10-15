// This file contains SSM parameters logic for traces src.
using System.Text.Json.Serialization;

namespace CloudOps.Otel.Traces;

public sealed class SsmParameters
{
    [JsonPropertyName("otel")]
    public BackendConfig? Otel { get; set; }

    // Checks whether empty.
    public bool IsEmpty()
    {
        return Otel?.Trace == null
            || (string.IsNullOrWhiteSpace(Otel.Trace.Url) && string.IsNullOrWhiteSpace(Otel.Trace.ApiKey));
    }

    // Handles backend.
    public BackendConfig? Backend(string name)
    {
        return name == "otel" ? Otel : null;
    }
}
