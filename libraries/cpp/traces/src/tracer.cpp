// This file contains tracer logic for traces src.
#include "cloudops/otel/detail/tracer.hpp"

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <random>
#include <sstream>
#include <string>

namespace cloudops::otel::traces {

namespace {

// Returns the current wall-clock time in nanoseconds.
long long now_nano() {
  using namespace std::chrono;
  return duration_cast<nanoseconds>(system_clock::now().time_since_epoch()).count();
}

// Returns a thread-local random engine seeded once per thread.
std::mt19937_64& rng() {
  static thread_local std::mt19937_64 engine{std::random_device{}()};
  return engine;
}

// Renders bytes as lowercase hex.
std::string to_hex(const unsigned char* bytes, std::size_t length) {
  static const char* digits = "0123456789abcdef";
  std::string out;
  out.reserve(length * 2);
  for (std::size_t i = 0; i < length; ++i) {
    out.push_back(digits[bytes[i] >> 4]);
    out.push_back(digits[bytes[i] & 0x0F]);
  }
  return out;
}

// Renders a span as a compact JSON line for the console sink.
std::string render_span(const Span& span) {
  std::ostringstream os;
  os << "{\"name\":\"" << span.name() << "\""
     << ",\"traceId\":\"" << span.trace_id() << "\""
     << ",\"spanId\":\"" << span.span_id() << "\""
     << ",\"parentSpanId\":\"" << span.parent_span_id() << "\""
     << ",\"kind\":" << static_cast<int>(span.kind())
     << ",\"status\":" << span.status_code()
     << ",\"attributes\":{";
  bool first = true;
  for (const auto& [key, value] : span.attributes()) {
    if (!first) os << ",";
    os << "\"" << key << "\":\"" << value << "\"";
    first = false;
  }
  os << "}}";
  return os.str();
}

// is_hex reports whether s is exactly n lowercase hex digits.
bool is_hex(const std::string& s, std::size_t n) {
  if (s.size() != n) return false;
  for (char c : s) {
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  }
  return true;
}

// parse_traceparent reads "00-<32 hex trace id>-<16 hex span id>-<2 hex
// flags>". A malformed value or all-zero ids return false, as the W3C spec
// requires.
bool parse_traceparent(const std::string& v, std::string& trace_id, std::string& span_id) {
  if (v.size() < 55 || v[2] != '-' || v[35] != '-' || v[52] != '-') return false;
  std::string version = v.substr(0, 2), tid = v.substr(3, 32), sid = v.substr(36, 16), flags = v.substr(53, 2);
  if (!is_hex(version, 2) || version == "ff" || !is_hex(tid, 32) || !is_hex(sid, 16) || !is_hex(flags, 2)) {
    return false;
  }
  if (tid.find_first_not_of('0') == std::string::npos || sid.find_first_not_of('0') == std::string::npos) {
    return false;
  }
  trace_id = tid;
  span_id = sid;
  return true;
}

}  // namespace

namespace detail {

// newXRayTraceId builds an AWS X-Ray compatible 16-byte trace id: the first
// four bytes carry the epoch seconds, the remaining twelve are random.
std::string new_xray_trace_id() {
  unsigned char buf[16];
  auto epoch = static_cast<std::uint32_t>(
      std::chrono::duration_cast<std::chrono::seconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count());
  buf[0] = static_cast<unsigned char>((epoch >> 24) & 0xFF);
  buf[1] = static_cast<unsigned char>((epoch >> 16) & 0xFF);
  buf[2] = static_cast<unsigned char>((epoch >> 8) & 0xFF);
  buf[3] = static_cast<unsigned char>(epoch & 0xFF);
  for (std::size_t i = 4; i < sizeof(buf); ++i) {
    buf[i] = static_cast<unsigned char>(rng()() & 0xFF);
  }
  return to_hex(buf, sizeof(buf));
}

// newSpanId builds a random 8-byte span id.
std::string new_span_id() {
  unsigned char buf[8];
  for (unsigned char& byte : buf) {
    byte = static_cast<unsigned char>(rng()() & 0xFF);
  }
  return to_hex(buf, sizeof(buf));
}

}  // namespace detail

// ─── Span ─────────────────────────────────────────────────────────────────

Span::Span(TraceInstrumentation* owner, std::string trace_id, std::string span_id,
           std::string parent_span_id, std::string name, SpanKind kind, bool sampled)
    : owner_(owner),
      trace_id_(std::move(trace_id)),
      span_id_(std::move(span_id)),
      parent_span_id_(std::move(parent_span_id)),
      name_(std::move(name)),
      kind_(kind),
      sampled_(sampled),
      start_nano_(now_nano()) {}

// Sets a single attribute on the span.
void Span::set_attribute(const std::string& key, const std::string& value) {
  attributes_[key] = value;
}

// Records an exception as a span attribute.
void Span::record_exception(const std::string& message) {
  attributes_["exception.message"] = message;
}

// Marks the span status as error.
void Span::set_status_error() {
  status_code_ = 2;
}

// Ends the span and hands it to the owning tracer.
void Span::end() {
  if (ended_) return;
  ended_ = true;
  end_nano_ = now_nano();
  if (owner_ != nullptr) {
    owner_->on_span_end(*this);
  }
}

// ─── TraceInstrumentation ───────────────────────────────────────────────────

TraceInstrumentation::TraceInstrumentation(std::string name) {
  resource_attributes_ = detail::runtime_resource_attributes();
  exporters_ = detail::parse_string_list(std::getenv("OTEL_BACKEND_EXPORTERS")
                                             ? std::getenv("OTEL_BACKEND_EXPORTERS")
                                             : std::string{},
                                         {"console"});
  service_name_ = name.empty() ? resource_attributes_["service.name"] : name;
  sample_ratio_ = detail::sampler_ratio();
  init();
}

TraceInstrumentation::~TraceInstrumentation() = default;

// Initializes the requested work.
void TraceInstrumentation::init() {
  std::string backend = exporters_.empty() ? "console" : exporters_.front();
  std::string lowered;
  lowered.reserve(backend.size());
  for (char c : backend) lowered.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));

  if (lowered != "otel") {
    use_console_ = true;
    return;
  }

  auto ssm = detail::read_ssm_parameters();
  if (ssm.is_empty() || !ssm.otel_trace.has_value() || !ssm.otel_trace->url.has_value()) {
    use_console_ = true;
    return;
  }

  otel_url_ = ssm.otel_trace->url.value();
  if (ssm.otel_trace->api_key.has_value()) {
    otel_headers_["authorization"] = "Bearer " + ssm.otel_trace->api_key.value();
  }
  use_otel_ = true;
}

// Starts a basic span.
std::shared_ptr<Span> TraceInstrumentation::start_basic_span(const std::string& name,
                                                             const SpanOptions& options) {
  std::lock_guard<std::mutex> lock(mu_);

  std::string trace_id;
  std::string parent_span_id;
  if (!options.parent_trace_id.empty()) {
    trace_id = options.parent_trace_id;
    parent_span_id = options.parent_span_id;
  } else if (options.root) {
    trace_id = detail::new_xray_trace_id();
  } else if (!active_trace_id_.empty()) {
    trace_id = active_trace_id_;
    parent_span_id = active_span_id_;
  } else {
    trace_id = detail::new_xray_trace_id();
  }

  bool sampled = true;
  if (sample_ratio_ <= 0.0) {
    sampled = false;
  } else if (sample_ratio_ < 1.0) {
    std::uniform_real_distribution<double> dist(0.0, 1.0);
    sampled = dist(rng()) <= sample_ratio_;
  }

  auto span = std::make_shared<Span>(this, trace_id, detail::new_span_id(), parent_span_id, name,
                                     options.kind, sampled);

  if (options.set_active_context) {
    active_trace_id_ = span->trace_id();
    active_span_id_ = span->span_id();
  }
  current_span_ = span;
  return span;
}

// Sets attributes to the span.
void TraceInstrumentation::set_attributes(const std::shared_ptr<Span>& span,
                                          const std::map<std::string, std::string>& data) {
  if (!span) return;
  for (const auto& [key, value] : data) {
    span->set_attribute(key, value);
  }
}

// Records an error on the span.
void TraceInstrumentation::record_error(const std::string& message,
                                        const std::shared_ptr<Span>& span) {
  std::shared_ptr<Span> target = span;
  if (!target) {
    std::lock_guard<std::mutex> lock(mu_);
    target = current_span_;
  }
  if (!target) return;

  target->record_exception(message);
  target->set_status_error();
}

// Sets the active span context.
void TraceInstrumentation::set_active_context(const std::shared_ptr<Span>& span) {
  if (!span) return;
  std::lock_guard<std::mutex> lock(mu_);
  active_trace_id_ = span->trace_id();
  active_span_id_ = span->span_id();
}

// The active span as a propagation carrier for a message (SNS, SQS): W3C
// `traceparent`, which every OpenTelemetry SDK reads by default, and B3
// single-header `b3` for consumers that only know B3.
std::optional<std::map<std::string, std::string>> TraceInstrumentation::fetch_trace_attrs() {
  std::lock_guard<std::mutex> lock(mu_);
  if (!current_span_) return std::nullopt;

  bool sampled = current_span_->sampled();
  std::map<std::string, std::string> carrier;
  carrier["traceparent"] = "00-" + current_span_->trace_id() + "-" + current_span_->span_id() + (sampled ? "-01" : "-00");
  carrier["b3"] = current_span_->trace_id() + "-" + current_span_->span_id() + (sampled ? "-1" : "-0");
  return carrier;
}

// Reads a carrier into the parent context for the next root span. W3C
// `traceparent` wins; B3 single-header `b3` is the fallback.
void TraceInstrumentation::extract_trace_attrs(const std::map<std::string, std::string>& carrier) {
  auto tp = carrier.find("traceparent");
  std::string w3c_trace, w3c_span;
  if (tp != carrier.end() && parse_traceparent(tp->second, w3c_trace, w3c_span)) {
    std::lock_guard<std::mutex> lock(mu_);
    propagation_trace_id_ = w3c_trace;
    propagation_span_id_ = w3c_span;
    return;
  }

  auto it = carrier.find("b3");
  if (it == carrier.end()) it = carrier.find("B3");
  if (it == carrier.end() || it->second.empty()) return;

  const std::string& raw = it->second;
  auto first_dash = raw.find('-');
  if (first_dash == std::string::npos) return;
  auto second_dash = raw.find('-', first_dash + 1);

  std::string trace_id = raw.substr(0, first_dash);
  std::string span_id = second_dash == std::string::npos
                            ? raw.substr(first_dash + 1)
                            : raw.substr(first_dash + 1, second_dash - first_dash - 1);
  if (trace_id.empty() || span_id.empty()) return;

  std::lock_guard<std::mutex> lock(mu_);
  propagation_trace_id_ = trace_id;
  propagation_span_id_ = span_id;
}

// Wires an OTLP transport implementation.
void TraceInstrumentation::set_otlp_transport(OtlpTransport transport) {
  std::lock_guard<std::mutex> lock(mu_);
  transport_ = std::move(transport);
}

// finish is called by Span::end to record and (in console mode) print the span.
void TraceInstrumentation::on_span_end(const Span& span) {
  if (!span.sampled()) return;

  if (use_console_) {
    std::cout << render_span(span) << "\n";
  }
  if (use_otel_) {
    std::lock_guard<std::mutex> lock(mu_);
    finished_.push_back(span);
  }
}

// Force all the spans to get exported.
void TraceInstrumentation::export_spans() {
  std::vector<Span> pending;
  OtlpTransport transport;
  std::string url;
  std::map<std::string, std::string> headers;
  {
    std::lock_guard<std::mutex> lock(mu_);
    if (!use_otel_ || !transport_) return;
    pending.swap(finished_);
    transport = transport_;
    url = otel_url_;
    headers = otel_headers_;
  }
  if (pending.empty()) return;

  transport(url, headers, build_otlp_payload(pending));
}

// Builds an OTLP/HTTP JSON traces payload.
std::string TraceInstrumentation::build_otlp_payload(const std::vector<Span>& spans) const {
  std::ostringstream os;
  os << "{\"resourceSpans\":[{\"resource\":{\"attributes\":[";
  bool first_attr = true;
  for (const auto& [key, value] : resource_attributes_) {
    if (!first_attr) os << ",";
    os << "{\"key\":\"" << key << "\",\"value\":{\"stringValue\":\"" << value << "\"}}";
    first_attr = false;
  }
  os << "]},\"scopeSpans\":[{\"scope\":{\"name\":\"cloudops.otel.traces\"},\"spans\":[";
  bool first_span = true;
  for (const auto& span : spans) {
    if (!first_span) os << ",";
    os << "{\"traceId\":\"" << span.trace_id() << "\",\"spanId\":\"" << span.span_id() << "\"";
    if (!span.parent_span_id().empty()) {
      os << ",\"parentSpanId\":\"" << span.parent_span_id() << "\"";
    }
    os << ",\"name\":\"" << span.name() << "\",\"kind\":" << static_cast<int>(span.kind())
       << ",\"status\":{\"code\":" << span.status_code() << "}}";
    first_span = false;
  }
  os << "]}]}]}";
  return os.str();
}

// Handles resource attributes.
const std::map<std::string, std::string>& TraceInstrumentation::resource_attributes() const noexcept {
  return resource_attributes_;
}

// Handles active span.
std::shared_ptr<Span> TraceInstrumentation::active_span() const noexcept {
  std::lock_guard<std::mutex> lock(mu_);
  return current_span_;
}

// Returns the parent trace/span ids captured by extract_trace_attrs.
std::pair<std::string, std::string> TraceInstrumentation::propagation_context() const {
  std::lock_guard<std::mutex> lock(mu_);
  return {propagation_trace_id_, propagation_span_id_};
}

// Module-level tracer, mirroring the other libraries.
TraceInstrumentation& tracer() {
  static TraceInstrumentation instance;
  return instance;
}

}  // namespace cloudops::otel::traces
