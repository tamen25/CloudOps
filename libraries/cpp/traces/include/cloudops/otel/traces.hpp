// CloudOps OpenTelemetry traces helper for C++ services.
//
// Mirrors the Node.js / Python / Java / .NET / Go libraries' API surface and
// environment-variable contract. Console output is the default sink; OTLP
// export is left to the caller (inject a transport via set_otlp_transport) so
// consumers can link the library without a hard dependency on libcurl / OpenSSL.
//
// Usage:
//
//     #include <cloudops/otel/traces.hpp>
//
//     auto& tracer = cloudops::otel::traces::tracer();
//     auto span = tracer.start_basic_span("handle-order",
//         {.set_active_context = true});
//     // ... work ...
//     tracer.record_error("boom", span);
//     span->end();
//     tracer.export_spans();
//
// Environment contract (matches the other libraries):
//
//     OTEL_BACKEND_EXPORTERS            JSON array or CSV; default "console"
//     TRACEID_RATIO_BASED_SAMPLER      root sampler ratio 0..1; default 1
//     OTEL_SSM_PARAMETERS              JSON object with otel.trace.{url,api_key}
//     /tmp/otelExporterParams.json     parameter file fallback
//     OTEL_SSM_PARAMETERS_FILE         optional override for that file path
//     OTEL_EXPORTER_OTLP_TRACES_ENDPOINT  OTLP HTTP endpoint fallback
//     OTEL_EXPORTER_OTLP_ENDPOINT       same, base URL (suffixed /v1/traces)
//     OTEL_API_KEY / OTEL_EXPORTER_OTLP_HEADERS  bearer auth fallback

#ifndef CLOUDOPS_OTEL_TRACES_HPP
#define CLOUDOPS_OTEL_TRACES_HPP

#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace cloudops::otel::traces {

constexpr const char* library_version = "0.1.0";

// SpanKind mirrors the OTLP span kind enum.
enum class SpanKind : int {
  Internal = 1,
  Server   = 2,
  Client   = 3,
  Producer = 4,
  Consumer = 5,
};

struct TracesExporterConfig {
  std::optional<std::string> url;
  std::optional<std::string> api_key;
};

struct SsmParameters {
  std::optional<TracesExporterConfig> otel_trace;
  bool is_empty() const;
};

class TraceInstrumentation;

// Span is one in-flight or finished trace span.
class Span {
 public:
  Span(TraceInstrumentation* owner, std::string trace_id, std::string span_id,
       std::string parent_span_id, std::string name, SpanKind kind, bool sampled);

  void set_attribute(const std::string& key, const std::string& value);
  void record_exception(const std::string& message);
  void set_status_error();
  void end();

  const std::string& trace_id() const noexcept { return trace_id_; }
  const std::string& span_id() const noexcept { return span_id_; }
  const std::string& parent_span_id() const noexcept { return parent_span_id_; }
  const std::string& name() const noexcept { return name_; }
  SpanKind           kind() const noexcept { return kind_; }
  bool               sampled() const noexcept { return sampled_; }
  int                status_code() const noexcept { return status_code_; }
  const std::map<std::string, std::string>& attributes() const noexcept { return attributes_; }

 private:
  friend class TraceInstrumentation;

  TraceInstrumentation*               owner_;
  std::string                         trace_id_;
  std::string                         span_id_;
  std::string                         parent_span_id_;
  std::string                         name_;
  SpanKind                            kind_{SpanKind::Internal};
  bool                                sampled_{true};
  bool                                ended_{false};
  int                                 status_code_{0};  // 0 unset, 1 ok, 2 error
  long long                           start_nano_{0};
  long long                           end_nano_{0};
  std::map<std::string, std::string>  attributes_;
};

// Options for start_basic_span, mirroring the Node.js reference library.
struct SpanOptions {
  SpanKind    kind{SpanKind::Internal};
  bool        root{false};
  bool        set_active_context{false};
  std::string parent_trace_id;
  std::string parent_span_id;
};

class TraceInstrumentation {
 public:
  explicit TraceInstrumentation(std::string name = "");
  ~TraceInstrumentation();

  TraceInstrumentation(const TraceInstrumentation&)            = delete;
  TraceInstrumentation& operator=(const TraceInstrumentation&) = delete;

  std::shared_ptr<Span> start_basic_span(const std::string& name, const SpanOptions& options = {});
  void                  set_attributes(const std::shared_ptr<Span>& span,
                                       const std::map<std::string, std::string>& data);
  void                  record_error(const std::string& message,
                                     const std::shared_ptr<Span>& span = nullptr);
  void                  set_active_context(const std::shared_ptr<Span>& span);

  // The current span as W3C `traceparent` and B3 `b3` carrier entries.
  std::optional<std::map<std::string, std::string>> fetch_trace_attrs();
  // Reads `traceparent` (preferred) or `b3` into the stored propagation context.
  void                                              extract_trace_attrs(
                                                        const std::map<std::string, std::string>& carrier);

  // Ships finished spans through the injected transport. No-op until a
  // transport is wired via set_otlp_transport.
  void export_spans();

  using OtlpTransport =
      std::function<bool(const std::string& url,
                         const std::map<std::string, std::string>& headers,
                         const std::string& body)>;
  void set_otlp_transport(OtlpTransport transport);

  const std::map<std::string, std::string>& resource_attributes() const noexcept;
  std::shared_ptr<Span>                      active_span() const noexcept;

  // Returns the parent trace/span ids captured by extract_trace_attrs.
  std::pair<std::string, std::string>        propagation_context() const;

 private:
  friend class Span;

  void        init();
  void        on_span_end(const Span& span);
  std::string build_otlp_payload(const std::vector<Span>& spans) const;

  std::map<std::string, std::string> resource_attributes_;
  std::vector<std::string>           exporters_;
  std::string                        service_name_;
  bool                               use_console_{false};
  bool                               use_otel_{false};
  std::string                        otel_url_;
  std::map<std::string, std::string> otel_headers_;
  double                             sample_ratio_{1.0};
  std::string                        active_trace_id_;
  std::string                        active_span_id_;
  std::string                        propagation_trace_id_;
  std::string                        propagation_span_id_;
  std::shared_ptr<Span>              current_span_;
  std::vector<Span>                  finished_;
  OtlpTransport                      transport_;
  mutable std::mutex                 mu_;
};

// Module-level tracer, mirroring the other libraries.
TraceInstrumentation& tracer();

}  // namespace cloudops::otel::traces

#endif  // CLOUDOPS_OTEL_TRACES_HPP
