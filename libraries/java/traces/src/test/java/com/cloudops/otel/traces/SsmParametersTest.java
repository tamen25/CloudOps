package com.cloudops.otel.traces;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SsmParametersTest {
  @Test
  void emptyWhenNoTraceBackendIsConfigured() {
    assertTrue(new SsmParameters().isEmpty());
  }

  @Test
  void backendReturnsConfiguredOtelBackendOnly() {
    TracesExporterConfig trace = new TracesExporterConfig();
    trace.url = "https://collector.example.com/v1/traces";

    BackendConfig backend = new BackendConfig();
    backend.trace = trace;

    SsmParameters parameters = new SsmParameters();
    parameters.otel = backend;

    assertFalse(parameters.isEmpty());
    assertSame(backend, parameters.backend("otel"));
    assertNull(parameters.backend("metrics"));
  }
}
