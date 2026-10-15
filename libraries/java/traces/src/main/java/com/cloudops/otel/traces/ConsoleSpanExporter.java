package com.cloudops.otel.traces;

import io.opentelemetry.sdk.common.CompletableResultCode;
import io.opentelemetry.sdk.trace.data.SpanData;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import java.util.Collection;

// A minimal SpanExporter that prints finished spans to stdout. Keeps the
// console default dependency-free (no opentelemetry-exporter-logging needed).
final class ConsoleSpanExporter implements SpanExporter {
  @Override
  public CompletableResultCode export(Collection<SpanData> spans) {
    for (SpanData span : spans) {
      System.out.println(
          "{\"name\":\"" + span.getName()
              + "\",\"traceId\":\"" + span.getTraceId()
              + "\",\"spanId\":\"" + span.getSpanId()
              + "\",\"kind\":\"" + span.getKind()
              + "\",\"status\":\"" + span.getStatus().getStatusCode()
              + "\",\"attributes\":" + span.getAttributes() + "}");
    }
    return CompletableResultCode.ofSuccess();
  }

  @Override
  public CompletableResultCode flush() {
    return CompletableResultCode.ofSuccess();
  }

  @Override
  public CompletableResultCode shutdown() {
    return CompletableResultCode.ofSuccess();
  }
}
