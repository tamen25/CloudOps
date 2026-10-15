// This file contains main logic for examples smoke.
// Smoke test consumer for the cloudops-otel-traces Go library. Exercises every
// public surface and exits 0 when the library is wired correctly.
package main

import (
	"errors"
	"fmt"
	"os"

	traces "github.com/cloudops/otel-traces"
)

// Runs the main workflow for the requested work.
func main() {
	os.Setenv("OTEL_SERVICE_NAME", "smoke-test")
	os.Setenv("OTEL_BACKEND_EXPORTERS", "console")

	tracer := traces.NewTraceInstrumentation("smoke-test")

	root := tracer.StartBasicSpan("root", &traces.SpanOptions{Root: true, SetActiveContext: true})
	child := tracer.StartBasicSpan("child", &traces.SpanOptions{Kind: traces.SpanKindConsumer})
	tracer.SetAttributes(child, map[string]any{"k": "v"})
	tracer.RecordError(errors.New("boom"), child)
	child.End()

	attrs := tracer.FetchTraceAttrs()
	root.End()

	if err := tracer.ExportSpans(); err != nil {
		fmt.Fprintln(os.Stderr, "ExportSpans failed:", err)
		os.Exit(1)
	}

	if tracer.ResourceAttributes["service.name"] != "smoke-test" {
		fmt.Fprintln(os.Stderr, "service.name not propagated")
		os.Exit(1)
	}
	if child.TraceID != root.TraceID {
		fmt.Fprintln(os.Stderr, "child did not inherit trace id")
		os.Exit(1)
	}
	if attrs["traceparent"] == "" || attrs["b3"] == "" {
		fmt.Fprintln(os.Stderr, "traceparent or b3 propagation header missing")
		os.Exit(1)
	}

	fmt.Println("ok — go traces smoke")
}
