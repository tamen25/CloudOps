namespace CloudOps.Otel.Logs;

internal sealed record LogEntry(
    string InvocationId,
    LogLevel Level,
    object? Message,
    object?[] OptionalParams);
