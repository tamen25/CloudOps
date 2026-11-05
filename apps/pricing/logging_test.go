package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.opentelemetry.io/otel/trace"
)

func decodeLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal(line, &m); err != nil {
			t.Fatalf("not a JSON line: %s", line)
		}
		out = append(out, m)
	}
	return out
}

func spanContext() context.Context {
	sc := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    trace.TraceID{0x0a, 0x0b, 0x0c},
		SpanID:     trace.SpanID{0x01, 0x02},
		TraceFlags: trace.FlagsSampled,
	})
	return trace.ContextWithSpanContext(context.Background(), sc)
}

// TestLoggerCarriesTheTraceContext: Argus found pricing's and ledger's logs
// uncorrelated and without severity on the EKS runs (ARG-LOG-001, LOG-002).
// A record logged with a span in its context must carry the span's IDs and a
// level the agent can parse.
func TestLoggerCarriesTheTraceContext(t *testing.T) {
	var buf bytes.Buffer
	newLogger(&buf).InfoContext(spanContext(), "hello")
	lines := decodeLines(t, &buf)
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1", len(lines))
	}
	l := lines[0]
	if l["level"] != "INFO" || l["msg"] != "hello" {
		t.Errorf("level/msg = %v/%v", l["level"], l["msg"])
	}
	if l["trace_id"] != "0a0b0c00000000000000000000000000" || l["span_id"] != "0102000000000000" {
		t.Errorf("trace_id/span_id = %v/%v", l["trace_id"], l["span_id"])
	}

	buf.Reset()
	newLogger(&buf).Info("no span")
	if l := decodeLines(t, &buf)[0]; l["trace_id"] != nil {
		t.Errorf("a record without a span got trace_id %v", l["trace_id"])
	}
}

// TestAccessLogLevelFollowsTheStatus: one line per request, at warn for 4xx
// and error for 5xx, with the request's trace; probes are not logged.
func TestAccessLogLevelFollowsTheStatus(t *testing.T) {
	cases := []struct {
		path   string
		status int
		level  string
	}{
		{"/quote", http.StatusOK, "INFO"},
		{"/quote", http.StatusBadRequest, "WARN"},
		{"/quote", http.StatusBadGateway, "ERROR"},
	}
	for _, tc := range cases {
		var buf bytes.Buffer
		h := withAccessLog(newLogger(&buf), http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(tc.status)
		}))
		req := httptest.NewRequest(http.MethodPost, tc.path, nil).WithContext(spanContext())
		h.ServeHTTP(httptest.NewRecorder(), req)
		lines := decodeLines(t, &buf)
		if len(lines) != 1 {
			t.Fatalf("%d: got %d lines, want 1", tc.status, len(lines))
		}
		l := lines[0]
		if l["level"] != tc.level || l["status"] != float64(tc.status) || l["path"] != tc.path || l["trace_id"] == nil {
			t.Errorf("%d: got %v", tc.status, l)
		}
	}

	var buf bytes.Buffer
	h := withAccessLog(newLogger(&buf), http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	for _, p := range []string{"/healthz", "/readyz", "/metrics"} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, p, nil))
	}
	if buf.Len() != 0 {
		t.Errorf("probes were logged: %s", buf.String())
	}
}
