// Package logs is the CloudOps OpenTelemetry logs helper for Go services.
//
// API mirrors the Node.js / Python / Java / .NET libraries:
//
//	import "github.com/cloudops/otel-logs"
//
//	logs.Logger.Info("order created", map[string]any{"order_id": id})
//	logs.Logger.Error(err)
//	logs.Logger.ExportLogs()
//
// Set OTEL_SERVICE_NAME in every app. AWS Lambda / ECS / EKS resource
// attributes are auto-detected from common runtime env vars.
//
// Environment contract (matches the other libraries):
//
//	OTEL_BACKEND_EXPORTERS         JSON array or CSV; default "console"
//	OTEL_LOG_LEVEL                 JSON array or CSV of info/error/debug/warn
//	OTEL_LOGS_SAMPLING_RATE        percentage 0..100; errors always export
//	OTEL_SSM_PARAMETERS            JSON object with otel.logs.{url,api_key}
//	/tmp/otelExporterParams.json    parameter file fallback
//	OTEL_SSM_PARAMETERS_FILE        optional override for that file path
//	OTEL_EXPORTER_OTLP_LOGS_ENDPOINT  OTLP HTTP endpoint fallback
//	OTEL_EXPORTER_OTLP_ENDPOINT       same, base URL (suffixed /v1/logs)
//	OTEL_API_KEY / OTEL_EXPORTER_OTLP_HEADERS  bearer auth fallback
package logs

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// LibraryVersion is emitted as the cloudops-log-ver resource attribute.
const LibraryVersion = "0.1.0"

const defaultSSMParametersFile = "/tmp/otelExporterParams.json"

// LogLevel is one of "info", "error", "debug", "warn".
type LogLevel string

const (
	LevelInfo  LogLevel = "info"
	LevelError LogLevel = "error"
	LevelDebug LogLevel = "debug"
	LevelWarn  LogLevel = "warn"
)

var defaultLevels = map[LogLevel]bool{LevelInfo: true, LevelError: true, LevelDebug: true, LevelWarn: true}
var validLevels = map[LogLevel]bool{LevelInfo: true, LevelError: true, LevelDebug: true, LevelWarn: true}

// LogEntry is one log record before sampling.
type LogEntry struct {
	InvocationID   string
	Level          LogLevel
	Message        any
	OptionalParams []any
}

// LogBatch groups entries that share an invocation/trace context.
type LogBatch struct {
	Logs []LogEntry
}

// LogsExporterConfig is the OTLP destination for logs.
type LogsExporterConfig struct {
	URL    string `json:"url,omitempty"`
	APIKey string `json:"api_key,omitempty"`
}

// SsmParameters mirrors the JSON shape of OTEL_SSM_PARAMETERS.
type SsmParameters struct {
	Otel *struct {
		Logs *LogsExporterConfig `json:"logs,omitempty"`
	} `json:"otel,omitempty"`
}

// IsEmpty reports whether either the URL or the API key is configured.
func (s *SsmParameters) IsEmpty() bool {
	if s == nil || s.Otel == nil || s.Otel.Logs == nil {
		return true
	}
	return s.Otel.Logs.URL == "" && s.Otel.Logs.APIKey == ""
}

// CloudOpsLogger is the per-service logger.
type CloudOpsLogger struct {
	ResourceAttributes map[string]string
	EnabledLevels      map[LogLevel]bool
	Exporters          []string
	loggerName         string
	useConsole         bool
	useOTel            bool
	otelURL            string
	otelHeaders        map[string]string
	sampler            *logSampler
	previousTraceID    string
	uniqueID           string
	mu                 sync.Mutex
	pending            []LogEntry // exported via ExportLogs when OTel is on
}

// Logger is the package-level singleton, mirroring the other libraries.
var Logger = NewCloudOpsLogger("")

// NewCloudOpsLogger builds a logger. Pass an empty name to default to
// service.name resolved from the resource attributes.
func NewCloudOpsLogger(name string) *CloudOpsLogger {
	l := &CloudOpsLogger{
		ResourceAttributes: runtimeResourceAttributes(),
		EnabledLevels:      parseLevelSet(os.Getenv("OTEL_LOG_LEVEL"), defaultLevels),
		Exporters:          parseStringList(os.Getenv("OTEL_BACKEND_EXPORTERS"), []string{"console"}),
	}
	if name != "" {
		l.loggerName = name
	} else {
		l.loggerName = l.ResourceAttributes["service.name"]
	}
	l.sampler = newLogSampler(l, samplingRate())
	l.init()
	return l
}

// Info logs at info level.
func (l *CloudOpsLogger) Info(message any, optionalParams ...any) {
	l.Log(LevelInfo, message, optionalParams...)
}

// Error logs at error level. Errors bypass probabilistic sampling.
func (l *CloudOpsLogger) Error(message any, optionalParams ...any) {
	l.Log(LevelError, message, optionalParams...)
}

// Debug logs at debug level.
func (l *CloudOpsLogger) Debug(message any, optionalParams ...any) {
	l.Log(LevelDebug, message, optionalParams...)
}

// Warn logs at warn level.
func (l *CloudOpsLogger) Warn(message any, optionalParams ...any) {
	l.Log(LevelWarn, message, optionalParams...)
}

// Log dispatches to the sampler.
func (l *CloudOpsLogger) Log(level LogLevel, message any, optionalParams ...any) {
	currentTraceID := currentTraceID()
	l.mu.Lock()
	if currentTraceID != l.previousTraceID {
		l.uniqueID = uuid.NewString()
		l.previousTraceID = currentTraceID
	}
	invocation := l.uniqueID
	if invocation == "" {
		invocation = "unknown"
	}
	l.mu.Unlock()

	l.sampler.add(LogEntry{
		InvocationID:   invocation,
		Level:          level,
		Message:        message,
		OptionalParams: optionalParams,
	})
}

// ProcessLog renders an entry to the configured sinks. Called by the sampler.
func (l *CloudOpsLogger) ProcessLog(entry LogEntry) {
	if !l.EnabledLevels[entry.Level] {
		return
	}

	if l.useConsole {
		l.writeConsole(entry)
	}

	if l.useOTel {
		l.mu.Lock()
		l.pending = append(l.pending, entry)
		l.mu.Unlock()
	}
}

// ExportLogs flushes the in-memory batch + (when OTel is on) ships pending
// entries to the OTLP/HTTP logs endpoint. Safe to call multiple times.
func (l *CloudOpsLogger) ExportLogs() error {
	l.sampler.flushOneBatch()
	if !l.useOTel {
		return nil
	}

	l.mu.Lock()
	pending := l.pending
	l.pending = nil
	l.mu.Unlock()
	if len(pending) == 0 {
		return nil
	}

	if err := shipOtlpLogs(l.otelURL, l.otelHeaders, l.ResourceAttributes, pending); err != nil {
		if !l.useConsole {
			for _, entry := range pending {
				l.writeConsole(entry)
			}
		}
		return err
	}
	return nil
}

func (l *CloudOpsLogger) init() {
	if len(l.Exporters) <= 1 && len(l.Exporters) == 1 && strings.EqualFold(l.Exporters[0], "console") {
		l.useConsole = true
		return
	}

	ssm := readSSMParameters()
	if ssm.IsEmpty() {
		l.useConsole = true
		return
	}

	for _, exp := range l.Exporters {
		switch strings.ToLower(exp) {
		case "console":
			l.useConsole = true
		case "otel":
			l.initOtel(ssm)
		default:
			l.useConsole = true
		}
	}
}

// Initializes OTel.
func (l *CloudOpsLogger) initOtel(ssm SsmParameters) {
	cfg := ssm.Otel.Logs
	if cfg == nil || cfg.URL == "" {
		l.useConsole = true
		return
	}
	l.otelURL = cfg.URL
	l.otelHeaders = map[string]string{}
	if cfg.APIKey != "" {
		l.otelHeaders["authorization"] = "Bearer " + cfg.APIKey
	}
	l.useOTel = true
}

func (l *CloudOpsLogger) writeConsole(entry LogEntry) {
	w := os.Stdout
	if entry.Level == LevelError {
		w = os.Stderr
	}
	fmt.Fprintln(w, renderEntry(entry.Message, entry.OptionalParams))
}

// ─── helpers ────────────────────────────────────────────────────────────────

func cloneStringSlice(in []string) []string {
	if in == nil {
		return nil
	}
	out := make([]string, len(in))
	copy(out, in)
	return out
}

// Copies level set.
func cloneLevelSet(in map[LogLevel]bool) map[LogLevel]bool {
	if in == nil {
		return nil
	}
	out := make(map[LogLevel]bool, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// Parses string list.
func parseStringList(raw string, fallback []string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return cloneStringSlice(fallback)
	}
	if strings.HasPrefix(trimmed, "[") {
		var parsed []string
		if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil && len(parsed) > 0 {
			out := make([]string, 0, len(parsed))
			for _, s := range parsed {
				if t := strings.TrimSpace(s); t != "" {
					out = append(out, t)
				}
			}
			if len(out) > 0 {
				return out
			}
		}
	}
	out := make([]string, 0)
	for _, item := range strings.Split(trimmed, ",") {
		if t := strings.TrimSpace(item); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return cloneStringSlice(fallback)
	}
	return out
}

// Parses level set.
func parseLevelSet(raw string, fallback map[LogLevel]bool) map[LogLevel]bool {
	if strings.TrimSpace(raw) == "" {
		return cloneLevelSet(fallback)
	}
	keys := parseStringList(raw, nil)
	if len(keys) == 0 {
		return cloneLevelSet(fallback)
	}
	out := map[LogLevel]bool{}
	for _, k := range keys {
		level := LogLevel(strings.ToLower(k))
		if validLevels[level] {
			out[level] = true
		}
	}
	if len(out) == 0 {
		return cloneLevelSet(fallback)
	}
	return out
}

// Parses resource attributes.
func parseResourceAttributes(raw string) map[string]string {
	out := map[string]string{}
	if raw == "" {
		return out
	}
	for _, item := range strings.Split(raw, ",") {
		k, v, ok := strings.Cut(item, "=")
		if ok {
			k, v = strings.TrimSpace(k), strings.TrimSpace(v)
			if k != "" && v != "" {
				out[k] = v
			}
		}
	}
	return out
}

// Normalizes endpoint.
func normalizeEndpoint(endpoint string) string {
	if endpoint == "" {
		return ""
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if strings.HasSuffix(endpoint, "/v1/logs") {
		return endpoint
	}
	return endpoint + "/v1/logs"
}

func readSSMParameters() SsmParameters {
	raw := os.Getenv("OTEL_SSM_PARAMETERS")
	if raw != "" {
		var s SsmParameters
		if err := json.Unmarshal([]byte(raw), &s); err == nil && !s.IsEmpty() {
			return s
		}
	}

	if fileParameters := readSSMParametersFile(""); !fileParameters.IsEmpty() {
		return fileParameters
	}

	logsURL := os.Getenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT")
	if logsURL == "" {
		logsURL = normalizeEndpoint(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	}
	apiKey := os.Getenv("OTEL_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")
	}
	if logsURL != "" || apiKey != "" {
		return SsmParameters{Otel: &struct {
			Logs *LogsExporterConfig `json:"logs,omitempty"`
		}{Logs: &LogsExporterConfig{URL: logsURL, APIKey: apiKey}}}
	}
	return SsmParameters{}
}

func readSSMParametersFile(filePath string) SsmParameters {
	if filePath == "" {
		filePath = os.Getenv("OTEL_SSM_PARAMETERS_FILE")
	}
	if filePath == "" {
		filePath = defaultSSMParametersFile
	}

	raw, err := os.ReadFile(filePath)
	if err != nil {
		if !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Error reading or parsing otelExporterParams.json: %v\n", err)
		}
		return SsmParameters{}
	}

	var s SsmParameters
	if err := json.Unmarshal(raw, &s); err != nil {
		fmt.Fprintf(os.Stderr, "Error reading or parsing otelExporterParams.json: %v\n", err)
		return SsmParameters{}
	}
	return s
}

// Finds first env.
func firstEnv(names ...string) string {
	for _, n := range names {
		if v := os.Getenv(n); v != "" {
			return v
		}
	}
	return ""
}

func runtimeResourceAttributes() map[string]string {
	attrs := parseResourceAttributes(os.Getenv("OTEL_RESOURCE_ATTRIBUTES"))
	if v := os.Getenv("OTEL_SERVICE_NAME"); v != "" {
		attrs["service.name"] = v
	} else if attrs["service.name"] == "" {
		if v := os.Getenv("AWS_LAMBDA_FUNCTION_NAME"); v != "" {
			attrs["service.name"] = v
		} else {
			attrs["service.name"] = "unknown_service"
		}
	}
	attrs["cloudops-log-ver"] = LibraryVersion

	if name := os.Getenv("AWS_LAMBDA_FUNCTION_NAME"); name != "" {
		attrs["cloud.platform"] = "aws_lambda"
		attrs["faas.name"] = name
		return attrs
	}

	if firstEnv("ECS_CONTAINER_METADATA_URI_V4", "ECS_CONTAINER_METADATA_URI") != "" || os.Getenv("ECS_CONTAINER_METADATA_FILE") != "" {
		attrs["cloud.platform"] = "aws_ecs"
	}

	runningOnK8s := os.Getenv("KUBERNETES_SERVICE_HOST") != ""
	cluster := firstEnv("K8S_CLUSTER_NAME", "EKS_CLUSTER_NAME")
	namespace := firstEnv("K8S_NAMESPACE_NAME", "POD_NAMESPACE")
	node := firstEnv("K8S_NODE_NAME", "NODE_NAME")
	pod := firstEnv("K8S_POD_NAME", "POD_NAME")
	if pod == "" && runningOnK8s {
		pod = os.Getenv("HOSTNAME")
	}

	if runningOnK8s || cluster != "" || namespace != "" || pod != "" {
		attrs["cloud.platform"] = "aws_eks"
	}

	for k, v := range map[string]string{
		"k8s.cluster.name":   cluster,
		"k8s.namespace.name": namespace,
		"k8s.node.name":      node,
		"k8s.pod.name":       pod,
		"container.id":       os.Getenv("CONTAINER_ID"),
		"container.name":     firstEnv("CONTAINER_NAME", "ECS_CONTAINER_NAME"),
	} {
		if v != "" {
			attrs[k] = v
		}
	}
	return attrs
}

func samplingRate() float64 {
	raw := os.Getenv("OTEL_LOGS_SAMPLING_RATE")
	if raw == "" {
		return 100
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 100
	}
	return v
}

func currentTraceID() string {
	if v := os.Getenv("_X_AMZN_TRACE_ID"); v != "" {
		return v
	}
	// Real OTel trace context plumbing is left to the consumer; the API
	// surface matches the other libraries and the value is only used to
	// segment sampling batches.
	return "unknown"
}

// Renders entry.
func renderEntry(message any, optionalParams []any) string {
	parts := []string{stringify(message)}
	for _, p := range optionalParams {
		parts = append(parts, stringify(p))
	}
	return strings.Join(parts, "\n")
}

// Turns into text the requested work.
func stringify(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case error:
		return t.Error()
	case string:
		return t
	case []byte:
		return string(t)
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return string(b)
}

// shipOtlpLogs posts a minimal OTLP/HTTP logs payload. Best-effort — failures
// fall back to console output so a misconfigured endpoint does not silently
// drop data.
func shipOtlpLogs(endpoint string, headers, resourceAttrs map[string]string, entries []LogEntry) error {
	if endpoint == "" {
		return nil
	}
	if _, err := url.Parse(endpoint); err != nil {
		return err
	}

	logRecords := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		logRecords = append(logRecords, map[string]any{
			"timeUnixNano":         strconv.FormatInt(time.Now().UnixNano(), 10),
			"observedTimeUnixNano": strconv.FormatInt(time.Now().UnixNano(), 10),
			"severityText":         strings.ToUpper(string(e.Level)),
			"body":                 map[string]any{"stringValue": renderEntry(e.Message, e.OptionalParams)},
			"attributes": []map[string]any{
				{"key": "invocation.id", "value": map[string]any{"stringValue": e.InvocationID}},
			},
		})
	}

	resourceList := make([]map[string]any, 0, len(resourceAttrs))
	for k, v := range resourceAttrs {
		resourceList = append(resourceList, map[string]any{
			"key":   k,
			"value": map[string]any{"stringValue": v},
		})
	}

	body := map[string]any{
		"resourceLogs": []map[string]any{{
			"resource": map[string]any{"attributes": resourceList},
			"scopeLogs": []map[string]any{{
				"scope":      map[string]any{"name": "cloudops.otel.logs"},
				"logRecords": logRecords,
			}},
		}},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(string(payload)))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("otlp logs export: status %d", resp.StatusCode)
	}
	return nil
}

// ─── sampler ────────────────────────────────────────────────────────────────

type logSampler struct {
	logger *CloudOpsLogger
	rate   float64
	mu     sync.Mutex
	batch  map[string]*LogBatch
}

func newLogSampler(l *CloudOpsLogger, rate float64) *logSampler {
	return &logSampler{logger: l, rate: rate, batch: map[string]*LogBatch{}}
}

func (s *logSampler) add(entry LogEntry) {
	if s.rate == 0 {
		s.logger.ProcessLog(entry)
		return
	}
	if entry.InvocationID == "" || entry.InvocationID == "unknown" {
		s.logger.ProcessLog(entry)
		return
	}
	s.mu.Lock()
	if existing, ok := s.batch[entry.InvocationID]; ok {
		existing.Logs = append(existing.Logs, entry)
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	s.flushOneBatch()
	s.mu.Lock()
	s.batch[entry.InvocationID] = &LogBatch{Logs: []LogEntry{entry}}
	s.mu.Unlock()
}

func (s *logSampler) flushOneBatch() {
	s.mu.Lock()
	current := s.batch
	s.batch = map[string]*LogBatch{}
	s.mu.Unlock()

	for _, batch := range current {
		hasError := false
		for _, e := range batch.Logs {
			if e.Level == LevelError {
				hasError = true
				break
			}
		}
		if hasError || s.shouldSample() {
			for _, e := range batch.Logs {
				s.logger.ProcessLog(e)
			}
		}
	}
}

// Decides whether to sample.
func (s *logSampler) shouldSample() bool {
	threshold := s.rate
	if threshold < 0 {
		threshold = 0
	}
	if threshold > 100 {
		threshold = 100
	}
	return rand.Float64() <= threshold/100
}
