package main

import "net/http"

// initTracer is replaced by real OTel wiring in a follow-up task. It returns a
// shutdown func and is a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset, so
// the service runs cleanly with or without an observability backend.
func initTracer(_ string) func() {
	return func() {}
}

// withTracing wraps a handler so incoming spans are created and W3C
// traceparent is honored. Currently pass-through; real otelhttp wiring lands
// with initTracer.
func withTracing(_ string, h http.Handler) http.Handler {
	return h
}
