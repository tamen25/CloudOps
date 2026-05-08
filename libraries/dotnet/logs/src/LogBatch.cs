namespace CloudOps.Otel.Logs;

internal sealed class LogBatch
{
    public LogBatch(LogEntry firstEntry)
    {
        Logs.Add(firstEntry);
    }

    public List<LogEntry> Logs { get; } = [];
}
