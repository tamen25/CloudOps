using System.Diagnostics;

namespace CloudOps.Otel.Traces;

// Properties for StartBasicSpan, mirroring the Node.js reference library.
public sealed class SpanProps
{
    public ActivityKind? SpanKind { get; set; }

    public bool Root { get; set; }

    public bool SetActiveContext { get; set; }

    public ActivityContext? Parent { get; set; }
}
