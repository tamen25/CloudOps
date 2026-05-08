using System.Text.Json;

namespace CloudOps.Otel.Logs;

internal static class LogsConfiguration
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static SsmParameters ReadSsmParameters()
    {
        var configured = Environment.GetEnvironmentVariable("OTEL_SSM_PARAMETERS");
        if (HasValue(configured))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<SsmParameters>(configured!, JsonOptions);
                if (parsed is not null && !parsed.IsEmpty()) return parsed;
            }
            catch (JsonException)
            {
                // Fall through to direct OTEL env vars.
            }
        }

        var logsUrl = FirstValue(
            Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"),
            NormalizeEndpoint(Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT")));
        var apiKey = FirstValue(
            Environment.GetEnvironmentVariable("OTEL_API_KEY"),
            Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_HEADERS"));

        var parameters = new SsmParameters();
        if (HasValue(logsUrl) || HasValue(apiKey))
        {
            parameters.Otel = new BackendConfig
            {
                Logs = new LogsExporterConfig
                {
                    Url = logsUrl,
                    ApiKey = apiKey
                }
            };
        }

        return parameters;
    }

    public static IReadOnlyList<string> ParseStringArray(string? raw, IReadOnlyList<string> fallback)
    {
        if (!HasValue(raw)) return fallback.ToArray();

        try
        {
            var parsed = JsonSerializer.Deserialize<string[]>(raw!, JsonOptions);
            if (parsed is { Length: > 0 })
            {
                var jsonValues = parsed.Select(item => item.Trim()).Where(HasValue).ToArray();
                if (jsonValues.Length > 0) return jsonValues;
            }
        }
        catch (JsonException)
        {
            // Fall back to comma-separated values.
        }

        var values = raw!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return values.Length > 0 ? values : fallback.ToArray();
    }

    public static double SamplingRate()
    {
        return double.TryParse(Environment.GetEnvironmentVariable("OTEL_LOGS_SAMPLING_RATE"), out var value)
            ? value
            : 100;
    }

    public static bool HasValue(string? value)
    {
        return !string.IsNullOrWhiteSpace(value);
    }

    public static string? FirstValue(params string?[] values)
    {
        return values.FirstOrDefault(HasValue);
    }

    private static string? NormalizeEndpoint(string? endpoint)
    {
        if (!HasValue(endpoint)) return null;

        var normalized = endpoint!.EndsWith("/", StringComparison.Ordinal)
            ? endpoint[..^1]
            : endpoint;
        return normalized.EndsWith("/v1/logs", StringComparison.Ordinal) ? normalized : $"{normalized}/v1/logs";
    }
}
