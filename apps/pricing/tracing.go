package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

// initTracer configures the global OTel tracer provider with an OTLP/HTTP
// exporter. It is a no-op (returning a no-op shutdown) when
// OTEL_EXPORTER_OTLP_ENDPOINT is unset, so the service runs cleanly with or
// without an observability backend — mirrors apps/order-api/src/tracing.ts.
func initTracer(serviceName string) func() {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		log.Println("OTEL_EXPORTER_OTLP_ENDPOINT not set — OTel tracer not started")
		return func() {}
	}

	// otlptracehttp wants host:port (+ optional path), not a scheme. Strip it
	// and honor https unless the endpoint is explicitly http://.
	insecure := strings.HasPrefix(endpoint, "http://")
	trimmed := strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")

	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(trimmed),
		otlptracehttp.WithURLPath("/v1/traces"),
	}
	if insecure {
		opts = append(opts, otlptracehttp.WithInsecure())
	}
	if key := os.Getenv("OTEL_API_KEY"); key != "" {
		opts = append(opts, otlptracehttp.WithHeaders(map[string]string{"Authorization": "Bearer " + key}))
	}

	ctx := context.Background()
	exporter, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		log.Printf("otlp trace exporter init failed: %v — continuing without tracing", err)
		return func() {}
	}

	res, _ := resource.Merge(resource.Default(), resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
	))

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{},
	))

	return func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = tp.Shutdown(shutdownCtx)
	}
}

// withTracing wraps a handler so each request becomes a server span and W3C
// traceparent from upstream is honored, linking pricing into the caller's
// trace.
func withTracing(serviceName string, h http.Handler) http.Handler {
	return otelhttp.NewHandler(h, serviceName)
}
