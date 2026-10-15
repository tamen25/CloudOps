// This file contains tracer test logic for go traces.
package traces

import (
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Handles test parse string list.
func TestParseStringList(t *testing.T) {
	got := parseStringList(`["console","otel"]`, []string{"x"})
	if len(got) != 2 || got[0] != "console" || got[1] != "otel" {
		t.Fatalf("json list: %#v", got)
	}

	got = parseStringList("console, otel", nil)
	if len(got) != 2 || got[1] != "otel" {
		t.Fatalf("csv: %#v", got)
	}

	got = parseStringList("", []string{"console"})
	if len(got) != 1 || got[0] != "console" {
		t.Fatalf("empty fallback: %#v", got)
	}
}

// Handles test normalize endpoint.
func TestNormalizeEndpoint(t *testing.T) {
	if got := normalizeEndpoint("https://otel.example.com/"); got != "https://otel.example.com/v1/traces" {
		t.Fatal(got)
	}
	if got := normalizeEndpoint("https://otel.example.com/v1/traces"); got != "https://otel.example.com/v1/traces" {
		t.Fatal(got)
	}
	if got := normalizeEndpoint(""); got != "" {
		t.Fatal(got)
	}
}

// Handles test runtime resource attributes lambda.
func TestRuntimeResourceAttributesLambda(t *testing.T) {
	t.Setenv("AWS_LAMBDA_FUNCTION_NAME", "fn-test")
	t.Setenv("OTEL_SERVICE_NAME", "fn-svc")
	attrs := runtimeResourceAttributes()
	if attrs["cloud.platform"] != "aws_lambda" || attrs["faas.name"] != "fn-test" {
		t.Fatalf("lambda attrs: %#v", attrs)
	}
	if attrs["service.name"] != "fn-svc" {
		t.Fatalf("service.name: %s", attrs["service.name"])
	}
	if attrs["cloudops-trace-ver"] != LibraryVersion {
		t.Fatalf("trace version attr: %s", attrs["cloudops-trace-ver"])
	}
}

// Handles test runtime resource attributes service name override.
func TestRuntimeResourceAttributesServiceNameOverride(t *testing.T) {
	t.Setenv("OTEL_RESOURCE_ATTRIBUTES", "service.name=from-resource,deployment.environment=dev")
	t.Setenv("OTEL_SERVICE_NAME", "from-env")

	attrs := runtimeResourceAttributes()
	if attrs["service.name"] != "from-env" {
		t.Fatalf("service.name: %s", attrs["service.name"])
	}
	if attrs["deployment.environment"] != "dev" {
		t.Fatalf("resource attributes not preserved: %#v", attrs)
	}
}

// Handles test sampler ratio.
func TestSamplerRatio(t *testing.T) {
	t.Setenv("TRACEID_RATIO_BASED_SAMPLER", "0.25")
	if got := samplerRatio(); got != 0.25 {
		t.Fatalf("ratio: %v", got)
	}
	os.Unsetenv("TRACEID_RATIO_BASED_SAMPLER")
	if got := samplerRatio(); got != 1 {
		t.Fatalf("default ratio: %v", got)
	}
	t.Setenv("TRACEID_RATIO_BASED_SAMPLER", "bad")
	if got := samplerRatio(); got != 1 {
		t.Fatalf("bad ratio fallback: %v", got)
	}
}

// Handles test read ssmparameters from JSON.
func TestReadSSMParametersFromJSON(t *testing.T) {
	t.Setenv("OTEL_SSM_PARAMETERS", `{"otel":{"trace":{"url":"https://collector.example.com/v1/traces","api_key":"secret"}}}`)
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	t.Setenv("OTEL_API_KEY", "")
	t.Setenv("OTEL_EXPORTER_OTLP_HEADERS", "")

	ssm := readSSMParameters()
	if ssm.IsEmpty() || ssm.Otel == nil || ssm.Otel.Trace == nil {
		t.Fatalf("ssm not parsed: %#v", ssm)
	}
	if ssm.Otel.Trace.URL != "https://collector.example.com/v1/traces" || ssm.Otel.Trace.APIKey != "secret" {
		t.Fatalf("unexpected ssm trace config: %#v", ssm.Otel.Trace)
	}
}

// Handles test read ssmparameters from file.
func TestReadSSMParametersFromFile(t *testing.T) {
	paramsFile := filepath.Join(t.TempDir(), "otelExporterParams.json")
	if err := os.WriteFile(paramsFile, []byte(`{"otel":{"trace":{"url":"https://file.example.com/v1/traces","api_key":"file-secret"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("OTEL_SSM_PARAMETERS", "")
	t.Setenv("OTEL_SSM_PARAMETERS_FILE", paramsFile)
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://fallback.example.com")
	t.Setenv("OTEL_API_KEY", "fallback-secret")

	ssm := readSSMParameters()
	if ssm.Otel == nil || ssm.Otel.Trace == nil || ssm.Otel.Trace.URL != "https://file.example.com/v1/traces" {
		t.Fatalf("unexpected file ssm trace config: %#v", ssm)
	}
}

// Handles test read ssmparameters falls back when file is invalid.
func TestReadSSMParametersFallsBackWhenFileIsInvalid(t *testing.T) {
	paramsFile := filepath.Join(t.TempDir(), "otelExporterParams.json")
	if err := os.WriteFile(paramsFile, []byte(`{not-json`), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("OTEL_SSM_PARAMETERS", "")
	t.Setenv("OTEL_SSM_PARAMETERS_FILE", paramsFile)
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "https://fallback.example.com/v1/traces")
	t.Setenv("OTEL_API_KEY", "fallback-secret")

	ssm := readSSMParameters()
	if ssm.Otel == nil || ssm.Otel.Trace == nil || ssm.Otel.Trace.URL != "https://fallback.example.com/v1/traces" {
		t.Fatalf("unexpected fallback ssm trace config: %#v", ssm)
	}
}

// Handles test console tracer starts span and renders on end.
func TestConsoleTracerStartsSpanAndRendersOnEnd(t *testing.T) {
	t.Setenv("OTEL_BACKEND_EXPORTERS", "console")
	t.Setenv("OTEL_SERVICE_NAME", "orders-api")
	t.Setenv("TRACEID_RATIO_BASED_SAMPLER", "1")

	tracer := NewTraceInstrumentation("orders-api")
	output := captureStdout(t, func() {
		span := tracer.StartBasicSpan("manual-span", &SpanOptions{SetActiveContext: true})
		if span == nil {
			t.Fatal("expected a span")
		}
		tracer.SetAttributes(span, map[string]any{"order.id": 42})
		tracer.RecordError(errors.New("boom"), span)
		span.End()
		if err := tracer.ExportSpans(); err != nil {
			t.Fatalf("console export should be a no-op: %v", err)
		}
	})

	if !strings.Contains(output, "manual-span") || !strings.Contains(output, "traceId") {
		t.Fatalf("console span output missing: %q", output)
	}
}

// Handles test child span inherits active trace context.
func TestChildSpanInheritsActiveContext(t *testing.T) {
	t.Setenv("OTEL_BACKEND_EXPORTERS", "console")
	tracer := NewTraceInstrumentation("ctx-test")

	captureStdout(t, func() {
		root := tracer.StartBasicSpan("root", &SpanOptions{Root: true, SetActiveContext: true})
		child := tracer.StartBasicSpan("child", nil)
		if child.TraceID != root.TraceID {
			t.Fatalf("child trace id %s != root %s", child.TraceID, root.TraceID)
		}
		if child.ParentSpanID != root.SpanID {
			t.Fatalf("child parent %s != root span %s", child.ParentSpanID, root.SpanID)
		}
		child.End()
		root.End()
	})
}

// Handles test fetch and extract trace attributes round trip.
func TestFetchAndExtractTraceAttrs(t *testing.T) {
	t.Setenv("OTEL_BACKEND_EXPORTERS", "console")
	tracer := NewTraceInstrumentation("prop-test")

	captureStdout(t, func() {
		span := tracer.StartBasicSpan("root", &SpanOptions{SetActiveContext: true})
		attrs := tracer.FetchTraceAttrs()
		if attrs == nil || !strings.HasPrefix(attrs["b3"], span.TraceID+"-"+span.SpanID) {
			t.Fatalf("unexpected b3 carrier: %#v", attrs)
		}
		span.End()
	})

	tracer.ExtractTraceAttrs(map[string]string{"b3": "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1"})
	traceID, spanID := tracer.PropagationContext()
	if traceID != "0af7651916cd43dd8448eb211c80319c" || spanID != "b7ad6b7169203331" {
		t.Fatalf("propagation context: %s / %s", traceID, spanID)
	}
}

// Handles test export spans falls back to console on httpfailure.
func TestExportSpansFallsBackToConsoleOnHTTPFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "collector down", http.StatusBadGateway)
	}))
	defer server.Close()

	t.Setenv("OTEL_BACKEND_EXPORTERS", "otel")
	t.Setenv("OTEL_SSM_PARAMETERS", `{"otel":{"trace":{"url":"`+server.URL+`","api_key":"secret"}}}`)
	t.Setenv("TRACEID_RATIO_BASED_SAMPLER", "1")

	tracer := NewTraceInstrumentation("export-test")
	output := captureStdout(t, func() {
		span := tracer.StartBasicSpan("shipped-span", nil)
		span.End()
		if err := tracer.ExportSpans(); err == nil {
			t.Fatal("expected export error")
		}
	})

	if !strings.Contains(output, "shipped-span") {
		t.Fatalf("fallback console output missing: %q", output)
	}
}

// Handles test xray trace id encodes epoch.
func TestXRayTraceIDEncodesEpoch(t *testing.T) {
	id := newXRayTraceID()
	if len(id) != 32 {
		t.Fatalf("trace id length: %d", len(id))
	}
	raw, err := hex.DecodeString(id[:8])
	if err != nil {
		t.Fatal(err)
	}
	epoch := int64(binary.BigEndian.Uint32(raw))
	if delta := time.Now().Unix() - epoch; delta < 0 || delta > 5 {
		t.Fatalf("epoch prefix off by %d seconds", delta)
	}
}

// Handles test stringify variants.
func TestStringifyVariants(t *testing.T) {
	if got := stringify(nil); got != "" {
		t.Fatal(got)
	}
	if got := stringify("hello"); got != "hello" {
		t.Fatal(got)
	}
	if got := stringify(map[string]any{"k": "v"}); !strings.Contains(got, "\"k\":\"v\"") {
		t.Fatal(got)
	}
}

// Captures stdout.
func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = w
	defer func() {
		os.Stdout = old
	}()

	fn()

	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

// A carrier is W3C first: other OpenTelemetry SDKs read and write
// `traceparent` by default, and B3 stays as the fallback.
func TestTraceAttrsUseW3CAndFallBackToB3(t *testing.T) {
	t.Setenv("OTEL_BACKEND_EXPORTERS", "console")
	tracer := NewTraceInstrumentation("w3c-test")

	captureStdout(t, func() {
		span := tracer.StartBasicSpan("root", &SpanOptions{SetActiveContext: true})
		attrs := tracer.FetchTraceAttrs()
		want := "00-" + span.TraceID + "-" + span.SpanID + "-"
		if !strings.HasPrefix(attrs["traceparent"], want) || attrs["b3"] == "" {
			t.Fatalf("carrier = %#v, want traceparent %s… and b3", attrs, want)
		}
		span.End()
	})

	// traceparent wins over b3 when both are present.
	tracer.ExtractTraceAttrs(map[string]string{
		"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"b3":          "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1",
	})
	if traceID, spanID := tracer.PropagationContext(); traceID != "4bf92f3577b34da6a3ce929d0e0e4736" || spanID != "00f067aa0ba902b7" {
		t.Errorf("with both headers: %s / %s, want the traceparent IDs", traceID, spanID)
	}

	// A malformed or all-zero traceparent is ignored, and b3 is used.
	for _, bad := range []string{"garbage", "00-00000000000000000000000000000000-00f067aa0ba902b7-01", "00-4bf92f35-00f067aa-01"} {
		tracer.ExtractTraceAttrs(map[string]string{"traceparent": bad, "b3": "0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-1"})
		if traceID, _ := tracer.PropagationContext(); traceID != "0af7651916cd43dd8448eb211c80319c" {
			t.Errorf("traceparent %q: trace %s, want the b3 fallback", bad, traceID)
		}
	}
}
