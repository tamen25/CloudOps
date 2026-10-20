package com.cloudops.otel.traces;

import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.context.Context;

// Properties for startBasicSpan, mirroring the Node.js reference library.
public final class SpanProps {
  public SpanKind spanKind;
  public boolean root;
  public boolean setActiveContext;
  public Context parent;

  public SpanProps() {}

  public SpanProps spanKind(SpanKind value) {
    this.spanKind = value;
    return this;
  }

  public SpanProps root(boolean value) {
    this.root = value;
    return this;
  }

  public SpanProps setActiveContext(boolean value) {
    this.setActiveContext = value;
    return this;
  }

  public SpanProps parent(Context value) {
    this.parent = value;
    return this;
  }
}
