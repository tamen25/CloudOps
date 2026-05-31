package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInitTracerNoEndpointIsNoop(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	shutdown := initTracer("pricing")
	if shutdown == nil {
		t.Fatal("initTracer returned nil shutdown func")
	}
	shutdown() // must not panic when no SDK was started
}

func TestWithTracingPassesRequestsThrough(t *testing.T) {
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	_ = initTracer("pricing")
	h := withTracing("pricing", NewMux())
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest("GET", "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("healthz through tracing = %d, want 200", rr.Code)
	}
}
