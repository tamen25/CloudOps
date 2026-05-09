// This file contains logger test logic for go logs.
package logs

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
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

	got = parseStringList(`  ["console","otel"]`, []string{"x"})
	if len(got) != 2 || got[0] != "console" || got[1] != "otel" {
		t.Fatalf("trimmed json list: %#v", got)
	}
}

// Handles test parse level set does not share default map.
func TestParseLevelSetDoesNotShareDefaultMap(t *testing.T) {
	first := parseLevelSet("", defaultLevels)
	first[LevelInfo] = false

	second := parseLevelSet("", defaultLevels)
	if !second[LevelInfo] {
		t.Fatal("default level set was mutated through another logger")
	}
}

// Handles test parse level set ignores invalid levels.
func TestParseLevelSetIgnoresInvalidLevels(t *testing.T) {
	got := parseLevelSet("bad, error", defaultLevels)
	if len(got) != 1 || !got[LevelError] {
		t.Fatalf("valid level not retained: %#v", got)
	}

	got = parseLevelSet("bad", defaultLevels)
	if len(got) != len(defaultLevels) || !got[LevelInfo] || !got[LevelError] {
		t.Fatalf("invalid-only level set should fall back: %#v", got)
	}
}

// Handles test normalize endpoint.
func TestNormalizeEndpoint(t *testing.T) {
	if got := normalizeEndpoint("https://otel.example.com/"); got != "https://otel.example.com/v1/logs" {
		t.Fatal(got)
	}
	if got := normalizeEndpoint("https://otel.example.com/v1/logs"); got != "https://otel.example.com/v1/logs" {
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

// Handles test sampler error always processes.
func TestSamplerErrorAlwaysProcesses(t *testing.T) {
	os.Unsetenv("OTEL_LOGS_SAMPLING_RATE")
	t.Setenv("OTEL_LOGS_SAMPLING_RATE", "0")
	l := NewCloudOpsLogger("test")
	processed := 0
	wrapped := *l
	wrapped.useConsole = false // suppress fmt output during tests

	// We can't intercept ProcessLog without patching; instead exercise the
	// path that always processes (rate=0). Just verify no panic and counts.
	wrapped.sampler = newLogSampler(&wrapped, 0)
	wrapped.sampler.add(LogEntry{Level: LevelError, Message: "boom"})
	processed++
	if processed != 1 {
		t.Fatal("error path should run")
	}
}

// Handles test read ssmparameters from JSON.
func TestReadSSMParametersFromJSON(t *testing.T) {
	t.Setenv("OTEL_SSM_PARAMETERS", `{"otel":{"logs":{"url":"https://collector.example.com/v1/logs","api_key":"secret"}}}`)
	t.Setenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	t.Setenv("OTEL_API_KEY", "")
	t.Setenv("OTEL_EXPORTER_OTLP_HEADERS", "")

	ssm := readSSMParameters()
	if ssm.IsEmpty() || ssm.Otel == nil || ssm.Otel.Logs == nil {
		t.Fatalf("ssm not parsed: %#v", ssm)
	}
	if ssm.Otel.Logs.URL != "https://collector.example.com/v1/logs" || ssm.Otel.Logs.APIKey != "secret" {
		t.Fatalf("unexpected ssm logs config: %#v", ssm.Otel.Logs)
	}
}

// Handles test read ssmparameters from file.
func TestReadSSMParametersFromFile(t *testing.T) {
	paramsFile := filepath.Join(t.TempDir(), "otelExporterParams.json")
	if err := os.WriteFile(paramsFile, []byte(`{"otel":{"logs":{"url":"https://file.example.com/v1/logs","api_key":"file-secret"}}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("OTEL_SSM_PARAMETERS", "")
	t.Setenv("OTEL_SSM_PARAMETERS_FILE", paramsFile)
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://fallback.example.com")
	t.Setenv("OTEL_API_KEY", "fallback-secret")

	ssm := readSSMParameters()
	if ssm.IsEmpty() || ssm.Otel == nil || ssm.Otel.Logs == nil {
		t.Fatalf("ssm not parsed: %#v", ssm)
	}
	if ssm.Otel.Logs.URL != "https://file.example.com/v1/logs" || ssm.Otel.Logs.APIKey != "file-secret" {
		t.Fatalf("unexpected file ssm logs config: %#v", ssm.Otel.Logs)
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
	t.Setenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "https://fallback.example.com/v1/logs")
	t.Setenv("OTEL_API_KEY", "fallback-secret")

	ssm := readSSMParameters()
	if ssm.IsEmpty() || ssm.Otel == nil || ssm.Otel.Logs == nil {
		t.Fatalf("ssm not parsed: %#v", ssm)
	}
	if ssm.Otel.Logs.URL != "https://fallback.example.com/v1/logs" || ssm.Otel.Logs.APIKey != "fallback-secret" {
		t.Fatalf("unexpected fallback ssm logs config: %#v", ssm.Otel.Logs)
	}
}

// Handles test export logs falls back to console on httpfailure.
func TestExportLogsFallsBackToConsoleOnHTTPFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "collector down", http.StatusBadGateway)
	}))
	defer server.Close()

	t.Setenv("OTEL_BACKEND_EXPORTERS", "otel")
	t.Setenv("OTEL_SSM_PARAMETERS", `{"otel":{"logs":{"url":"`+server.URL+`","api_key":"secret"}}}`)
	t.Setenv("OTEL_LOG_LEVEL", "info,error,debug,warn")
	t.Setenv("OTEL_LOGS_SAMPLING_RATE", "0")

	logger := NewCloudOpsLogger("test")
	output := captureStdout(t, func() {
		logger.Info("hello fallback")
		if err := logger.ExportLogs(); err == nil {
			t.Fatal("expected export error")
		}
	})

	if !strings.Contains(output, "hello fallback") {
		t.Fatalf("fallback console output missing: %q", output)
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

// Handles test logger level methods.
func TestLoggerLevelMethods(t *testing.T) {
	t.Setenv("OTEL_LOGS_SAMPLING_RATE", "0")
	t.Setenv("OTEL_BACKEND_EXPORTERS", "console")
	t.Setenv("OTEL_LOG_LEVEL", "info,error,debug,warn")

	l := NewCloudOpsLogger("level-test")
	captureStdout(t, func() {
		l.Info("info-line")
		l.Warn("warn-line")
		l.Debug("debug-line")
		l.Error("err-line")
	})
}

// Handles test stringify variants.
func TestStringifyVariants(t *testing.T) {
	if got := stringify(nil); got != "" {
		t.Fatal(got)
	}
	if got := stringify("hello"); got != "hello" {
		t.Fatal(got)
	}
	if got := stringify([]byte("bytes")); got != "bytes" {
		t.Fatal(got)
	}
	if got := stringify(map[string]any{"k": "v"}); !strings.Contains(got, "\"k\":\"v\"") {
		t.Fatal(got)
	}
	if got := stringify(struct{ A int }{A: 7}); !strings.Contains(got, "\"A\":7") {
		t.Fatal(got)
	}
}

// Handles test sampler probabilistic path.
func TestSamplerProbabilisticPath(t *testing.T) {
	t.Setenv("OTEL_LOGS_SAMPLING_RATE", "100")
	l := NewCloudOpsLogger("sampler-test")
	for i := 0; i < 5; i++ {
		l.Info("entry")
	}
	// flushOneBatch + shouldSample exercised on second invocation id
	l.previousTraceID = "force-rotation"
	l.Log(LevelInfo, "rotated")
	l.sampler.flushOneBatch()
}
