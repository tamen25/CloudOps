package main

import (
	"testing"

	"go.opentelemetry.io/otel"
)

// With an endpoint set, initTracer installs the SDK and W3C trace-context
// propagation, so the service continues its callers' traces. Building the
// exporter does not connect, so no collector is needed here.
func TestInitTracerWithEndpointUsesW3CPropagation(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")
	t.Setenv("OTEL_API_KEY", "test-key")
	shutdown := initTracer("ledger")
	defer shutdown()

	fields := otel.GetTextMapPropagator().Fields()
	found := false
	for _, f := range fields {
		if f == "traceparent" {
			found = true
		}
	}
	if !found {
		t.Fatalf("propagator fields = %v, want traceparent (W3C)", fields)
	}
}
