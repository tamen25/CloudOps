// Package traces is the CloudOps OpenTelemetry traces helper for Go services.
//
// API mirrors the Node.js / Python / Java / .NET libraries:
//
//	import traces "github.com/cloudops/otel-traces"
//
//	span := traces.Tracer.StartBasicSpan("handle-order", nil)
//	// ... work ...
//	traces.Tracer.RecordError(err, span)
//	span.End()
//	traces.Tracer.ExportSpans()
//
// Set OTEL_SERVICE_NAME in every app. AWS Lambda / ECS / EKS resource
// attributes are auto-detected from common runtime env vars.
//
// Environment contract (matches the other libraries):
//
//	OTEL_BACKEND_EXPORTERS            JSON array or CSV; default "console"
//	TRACEID_RATIO_BASED_SAMPLER      root sampler ratio 0..1; default 1
//	OTEL_SSM_PARAMETERS              JSON object with otel.trace.{url,api_key}
//	/tmp/otelExporterParams.json     parameter file fallback
//	OTEL_SSM_PARAMETERS_FILE         optional override for that file path
//	OTEL_EXPORTER_OTLP_TRACES_ENDPOINT  OTLP HTTP endpoint fallback
//	OTEL_EXPORTER_OTLP_ENDPOINT       same, base URL (suffixed /v1/traces)
//	OTEL_API_KEY / OTEL_EXPORTER_OTLP_HEADERS  bearer auth fallback
package traces

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	mathrand "math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// LibraryVersion is emitted as the cloudops-trace-ver resource attribute.
const LibraryVersion = "0.1.0"

const defaultSSMParametersFile = "/tmp/otelExporterParams.json"

// SpanKind mirrors the OTLP span kind enum.
type SpanKind int

const (
	SpanKindUnspecified SpanKind = 0
	SpanKindInternal    SpanKind = 1
	SpanKindServer      SpanKind = 2
	SpanKindClient      SpanKind = 3
	SpanKindProducer    SpanKind = 4
	SpanKindConsumer    SpanKind = 5
)

// spanStatus mirrors the OTLP status code enum.
const (
	statusUnset = 0
	statusOK    = 1
	statusError = 2
)

// TracesExporterConfig is the OTLP destination for spans.
type TracesExporterConfig struct {
	URL    string `json:"url,omitempty"`
	APIKey string `json:"api_key,omitempty"`
}

// SsmParameters mirrors the JSON shape of OTEL_SSM_PARAMETERS.
type SsmParameters struct {
	Otel *struct {
		Trace *TracesExporterConfig `json:"trace,omitempty"`
	} `json:"otel,omitempty"`
}

// IsEmpty reports whether neither the URL nor the API key is configured.
func (s *SsmParameters) IsEmpty() bool {
	if s == nil || s.Otel == nil || s.Otel.Trace == nil {
		return true
	}
	return s.Otel.Trace.URL == "" && s.Otel.Trace.APIKey == ""
}

// spanEvent is an exception or annotation recorded on a span.
type spanEvent struct {
	Name       string
	TimeNano   int64
	Attributes map[string]any
}

// Span is one in-flight or finished trace span.
type Span struct {
	TraceID      string
	SpanID       string
	ParentSpanID string
	Name         string
	Kind         SpanKind
	StartNano    int64
	EndNano      int64
	StatusCode   int
	StatusMsg    string
	Attributes   map[string]any
	Events       []spanEvent
	Sampled      bool

	owner *TraceInstrumentation
	mu    sync.Mutex
	ended bool
}

// SetAttribute records a single attribute on the span.
func (s *Span) SetAttribute(key string, value any) {
	if s == nil || value == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Attributes == nil {
		s.Attributes = map[string]any{}
	}
	s.Attributes[key] = value
}

// RecordException attaches an exception event to the span.
func (s *Span) RecordException(err error) {
	if s == nil || err == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Events = append(s.Events, spanEvent{
		Name:     "exception",
		TimeNano: time.Now().UnixNano(),
		Attributes: map[string]any{
			"exception.message": err.Error(),
			"exception.type":    fmt.Sprintf("%T", err),
		},
	})
}

// SetStatus sets the span status code and optional message.
func (s *Span) SetStatus(code int, message string) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.StatusCode = code
	s.StatusMsg = message
}

// End finalizes the span and hands it to the owning tracer for export.
func (s *Span) End() {
	if s == nil {
		return
	}
	s.mu.Lock()
	if s.ended {
		s.mu.Unlock()
		return
	}
	s.ended = true
	if s.EndNano == 0 {
		s.EndNano = time.Now().UnixNano()
	}
	s.mu.Unlock()

	if s.owner != nil {
		s.owner.finish(s)
	}
}

// SpanOptions configures StartBasicSpan.
type SpanOptions struct {
	Kind             SpanKind
	Root             bool
	SetActiveContext bool
	ParentTraceID    string
	ParentSpanID     string
}

// TraceInstrumentation is the per-service tracer.
type TraceInstrumentation struct {
	ResourceAttributes map[string]string
	Exporters          []string
	serviceName        string
	useConsole         bool
	useOTel            bool
	otelURL            string
	otelHeaders        map[string]string
	sampleRatio        float64

	mu                 sync.Mutex
	activeTraceID      string
	activeSpanID       string
	propagationTraceID string
	propagationSpanID  string
	currentSpan        *Span
	finished           []*Span
}

// Tracer is the package-level singleton, mirroring the other libraries.
var Tracer = NewTraceInstrumentation("")

// NewTraceInstrumentation builds a tracer. Pass an empty name to default to
// service.name resolved from the resource attributes.
func NewTraceInstrumentation(name string) *TraceInstrumentation {
	t := &TraceInstrumentation{
		ResourceAttributes: runtimeResourceAttributes(),
		Exporters:          parseStringList(os.Getenv("OTEL_BACKEND_EXPORTERS"), []string{"console"}),
		sampleRatio:        samplerRatio(),
	}
	if name != "" {
		t.serviceName = name
	} else {
		t.serviceName = t.ResourceAttributes["service.name"]
	}
	t.init()
	return t
}

// ActiveSpan returns the most recently started span.
func (t *TraceInstrumentation) ActiveSpan() *Span {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.currentSpan
}

// Initializes the requested work.
func (t *TraceInstrumentation) init() {
	if len(t.Exporters) == 1 && strings.EqualFold(t.Exporters[0], "console") {
		t.useConsole = true
		return
	}

	backend := ""
	if len(t.Exporters) > 0 {
		backend = strings.ToLower(t.Exporters[0])
	}
	if backend != "otel" {
		t.useConsole = true
		return
	}

	ssm := readSSMParameters()
	if ssm.IsEmpty() {
		t.useConsole = true
		return
	}

	cfg := ssm.Otel.Trace
	if cfg == nil || cfg.URL == "" {
		t.useConsole = true
		return
	}
	t.otelURL = cfg.URL
	t.otelHeaders = map[string]string{}
	if cfg.APIKey != "" {
		t.otelHeaders["authorization"] = "Bearer " + cfg.APIKey
	}
	t.useOTel = true
}

// StartBasicSpan starts a span, applying root/parent/active-context rules that
// mirror the Node.js reference library.
func (t *TraceInstrumentation) StartBasicSpan(name string, opts *SpanOptions) *Span {
	if opts == nil {
		opts = &SpanOptions{}
	}

	kind := opts.Kind
	if kind == SpanKindUnspecified {
		kind = SpanKindInternal
	}

	t.mu.Lock()
	var traceID, parentSpanID string
	switch {
	case opts.ParentTraceID != "":
		traceID = opts.ParentTraceID
		parentSpanID = opts.ParentSpanID
	case opts.Root:
		traceID = newXRayTraceID()
	case t.activeTraceID != "":
		traceID = t.activeTraceID
		parentSpanID = t.activeSpanID
	default:
		traceID = newXRayTraceID()
	}

	span := &Span{
		TraceID:      traceID,
		SpanID:       newSpanID(),
		ParentSpanID: parentSpanID,
		Name:         name,
		Kind:         kind,
		StartNano:    time.Now().UnixNano(),
		Attributes:   map[string]any{},
		Sampled:      t.shouldSample(),
		owner:        t,
	}

	if opts.SetActiveContext {
		t.activeTraceID = span.TraceID
		t.activeSpanID = span.SpanID
	}
	t.currentSpan = span
	t.mu.Unlock()

	t.SetAttributes(span, traceBaggageAttrs())
	return span
}

// SetAttributes copies a map of attributes onto the span.
func (t *TraceInstrumentation) SetAttributes(span *Span, data map[string]any) {
	if span == nil || data == nil {
		return
	}
	for k, v := range data {
		if v != nil {
			span.SetAttribute(k, v)
		}
	}
}

// RecordError marks the span as errored and records the exception.
func (t *TraceInstrumentation) RecordError(err error, span *Span) {
	target := span
	if target == nil {
		target = t.ActiveSpan()
	}
	if target == nil {
		return
	}
	target.RecordException(err)
	target.SetStatus(statusError, "")
}

// SetActiveContext promotes a span to the active trace context.
func (t *TraceInstrumentation) SetActiveContext(span *Span) {
	if span == nil {
		return
	}
	t.mu.Lock()
	t.activeTraceID = span.TraceID
	t.activeSpanID = span.SpanID
	t.mu.Unlock()
}

// FetchTraceAttrs injects the current span into a B3 single-header carrier.
func (t *TraceInstrumentation) FetchTraceAttrs() map[string]string {
	span := t.ActiveSpan()
	if span == nil {
		return nil
	}
	sampled := "0"
	if span.Sampled {
		sampled = "1"
	}
	return map[string]string{"b3": fmt.Sprintf("%s-%s-%s", span.TraceID, span.SpanID, sampled)}
}

// ExtractTraceAttrs parses a B3 single-header carrier into the propagation
// context used as the parent for the next root span.
func (t *TraceInstrumentation) ExtractTraceAttrs(carrier map[string]string) {
	if carrier == nil {
		return
	}
	raw := carrier["b3"]
	if raw == "" {
		raw = carrier["B3"]
	}
	parts := strings.Split(raw, "-")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return
	}
	t.mu.Lock()
	t.propagationTraceID = parts[0]
	t.propagationSpanID = parts[1]
	t.mu.Unlock()
}

// PropagationContext returns the parent trace/span IDs captured by
// ExtractTraceAttrs, for use as StartBasicSpan parent options.
func (t *TraceInstrumentation) PropagationContext() (traceID, spanID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.propagationTraceID, t.propagationSpanID
}

// finish is called by Span.End to record and (in console mode) print the span.
func (t *TraceInstrumentation) finish(span *Span) {
	if t.useConsole && span.Sampled {
		fmt.Fprintln(os.Stdout, renderSpan(span))
	}
	if t.useOTel && span.Sampled {
		t.mu.Lock()
		t.finished = append(t.finished, span)
		t.mu.Unlock()
	}
}

// ExportSpans ships finished spans to the OTLP/HTTP traces endpoint. Safe to
// call multiple times. Best-effort: failures fall back to console output.
func (t *TraceInstrumentation) ExportSpans() error {
	if !t.useOTel {
		return nil
	}

	t.mu.Lock()
	pending := t.finished
	t.finished = nil
	t.mu.Unlock()
	if len(pending) == 0 {
		return nil
	}

	if err := shipOtlpTraces(t.otelURL, t.otelHeaders, t.ResourceAttributes, pending); err != nil {
		if !t.useConsole {
			for _, span := range pending {
				fmt.Fprintln(os.Stdout, renderSpan(span))
			}
		}
		return err
	}
	return nil
}

// Decides whether to sample a new root span.
func (t *TraceInstrumentation) shouldSample() bool {
	ratio := t.sampleRatio
	if ratio >= 1 {
		return true
	}
	if ratio <= 0 {
		return false
	}
	return mathrand.Float64() <= ratio
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
				if trimmedItem := strings.TrimSpace(s); trimmedItem != "" {
					out = append(out, trimmedItem)
				}
			}
			if len(out) > 0 {
				return out
			}
		}
	}
	out := make([]string, 0)
	for _, item := range strings.Split(trimmed, ",") {
		if trimmedItem := strings.TrimSpace(item); trimmedItem != "" {
			out = append(out, trimmedItem)
		}
	}
	if len(out) == 0 {
		return cloneStringSlice(fallback)
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
	if strings.HasSuffix(endpoint, "/v1/traces") {
		return endpoint
	}
	return endpoint + "/v1/traces"
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

	tracesURL := os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
	if tracesURL == "" {
		tracesURL = normalizeEndpoint(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	}
	apiKey := os.Getenv("OTEL_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")
	}
	if tracesURL != "" || apiKey != "" {
		return SsmParameters{Otel: &struct {
			Trace *TracesExporterConfig `json:"trace,omitempty"`
		}{Trace: &TracesExporterConfig{URL: tracesURL, APIKey: apiKey}}}
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
	attrs["cloudops-trace-ver"] = LibraryVersion

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

// traceBaggageAttrs mirrors the Node.js baggage bridge. Go has no ambient
// baggage store here, so it returns an empty map; the hook keeps API parity.
func traceBaggageAttrs() map[string]any {
	return map[string]any{}
}

func samplerRatio() float64 {
	raw := os.Getenv("TRACEID_RATIO_BASED_SAMPLER")
	if raw == "" {
		return 1
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 1
	}
	return v
}

// newXRayTraceID builds an AWS X-Ray compatible 16-byte trace id: the first
// four bytes carry the epoch seconds, the remaining twelve are random.
func newXRayTraceID() string {
	buf := make([]byte, 16)
	binary.BigEndian.PutUint32(buf[0:4], uint32(time.Now().Unix()))
	_, _ = rand.Read(buf[4:])
	return hex.EncodeToString(buf)
}

// newSpanID builds a random 8-byte span id.
func newSpanID() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

// Renders span for console output.
func renderSpan(span *Span) string {
	payload := map[string]any{
		"name":              span.Name,
		"traceId":           span.TraceID,
		"spanId":            span.SpanID,
		"parentSpanId":      span.ParentSpanID,
		"kind":              int(span.Kind),
		"startTimeUnixNano": strconv.FormatInt(span.StartNano, 10),
		"endTimeUnixNano":   strconv.FormatInt(span.EndNano, 10),
		"attributes":        span.Attributes,
		"status":            span.StatusCode,
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return fmt.Sprintf("%v", payload)
	}
	return string(b)
}

// otlpAttributes converts a map into the OTLP key/value list shape.
func otlpAttributes(attrs map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(attrs))
	for k, v := range attrs {
		out = append(out, map[string]any{
			"key":   k,
			"value": map[string]any{"stringValue": stringify(v)},
		})
	}
	return out
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

// shipOtlpTraces posts a minimal OTLP/HTTP traces payload. Best-effort.
func shipOtlpTraces(endpoint string, headers, resourceAttrs map[string]string, spans []*Span) error {
	if endpoint == "" {
		return nil
	}
	if _, err := url.Parse(endpoint); err != nil {
		return err
	}

	spanRecords := make([]map[string]any, 0, len(spans))
	for _, s := range spans {
		record := map[string]any{
			"traceId":           s.TraceID,
			"spanId":            s.SpanID,
			"name":              s.Name,
			"kind":              int(s.Kind),
			"startTimeUnixNano": strconv.FormatInt(s.StartNano, 10),
			"endTimeUnixNano":   strconv.FormatInt(s.EndNano, 10),
			"attributes":        otlpAttributes(s.Attributes),
			"status":            map[string]any{"code": s.StatusCode},
		}
		if s.ParentSpanID != "" {
			record["parentSpanId"] = s.ParentSpanID
		}
		spanRecords = append(spanRecords, record)
	}

	resourceList := make([]map[string]any, 0, len(resourceAttrs))
	for k, v := range resourceAttrs {
		resourceList = append(resourceList, map[string]any{
			"key":   k,
			"value": map[string]any{"stringValue": v},
		})
	}

	body := map[string]any{
		"resourceSpans": []map[string]any{{
			"resource": map[string]any{"attributes": resourceList},
			"scopeSpans": []map[string]any{{
				"scope": map[string]any{"name": "cloudops.otel.traces"},
				"spans": spanRecords,
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
		return fmt.Errorf("otlp traces export: status %d", resp.StatusCode)
	}
	return nil
}
