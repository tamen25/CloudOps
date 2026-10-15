// This file contains trace instrumentation test logic for OTel traces.
package com.cloudops.otel.traces;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.opentelemetry.api.trace.Span;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TraceInstrumentationTest {
  @Test
  void resourceAttributesIncludeTraceVersion() {
    TraceInstrumentation tracer = new TraceInstrumentation();
    assertEquals("0.1.0", tracer.resourceAttributes().get("cloudops-trace-ver"));
    assertTrue(tracer.resourceAttributes().containsKey("service.name"));
  }

  @Test
  void consoleTracerStartsSpanRecordsErrorAndPropagates() {
    PrintStream originalOut = System.out;
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    System.setOut(new PrintStream(output, true, StandardCharsets.UTF_8));

    try {
      TraceInstrumentation tracer = new TraceInstrumentation();
      Span span = tracer.startBasicSpan("manual-span", new SpanProps().setActiveContext(true));
      assertNotNull(span);

      tracer.setAttributes(span, Map.of("order.id", 42));
      tracer.recordError(new RuntimeException("boom"), span);

      Map<String, String> attrs = tracer.fetchTraceAttrs();
      assertNotNull(attrs);
      assertTrue(attrs.containsKey("b3"));

      tracer.extractTraceAttrs(Map.of("b3", "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1"));
      assertNotNull(tracer.propagationContext());

      span.end();
      tracer.exportSpans();
    } finally {
      System.setOut(originalOut);
    }

    assertTrue(output.toString(StandardCharsets.UTF_8).contains("manual-span"), output.toString(StandardCharsets.UTF_8));
  }

  @Test
  void childSpanInheritsActiveTraceContext() {
    PrintStream originalOut = System.out;
    System.setOut(new PrintStream(new ByteArrayOutputStream(), true, StandardCharsets.UTF_8));

    try {
      TraceInstrumentation tracer = new TraceInstrumentation();
      Span root = tracer.startBasicSpan("root", new SpanProps().root(true).setActiveContext(true));
      Span child = tracer.startBasicSpan("child", null);

      assertEquals(root.getSpanContext().getTraceId(), child.getSpanContext().getTraceId());

      child.end();
      root.end();
    } finally {
      System.setOut(originalOut);
    }
  }
}
