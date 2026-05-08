#include "cloudops/otel/logs.hpp"
#include "cloudops/otel/detail/sampler.hpp"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <random>
#include <sstream>
#include <type_traits>

namespace cloudops::otel::logs {

namespace {

std::string make_uuid() {
  // RFC-4122 v4 layout — keep the dependency footprint at zero.
  static thread_local std::mt19937_64 rng(static_cast<uint64_t>(
      std::chrono::system_clock::now().time_since_epoch().count()));
  std::uniform_int_distribution<uint64_t> dist;
  uint64_t hi = dist(rng);
  uint64_t lo = dist(rng);
  hi = (hi & 0xFFFFFFFFFFFF0FFFULL) | 0x0000000000004000ULL;  // version 4
  lo = (lo & 0x3FFFFFFFFFFFFFFFULL) | 0x8000000000000000ULL;  // variant 1

  static const char* hex = "0123456789abcdef";
  std::string out(36, '-');
  auto put = [&](size_t pos, uint64_t v, int bytes) {
    for (int i = bytes - 1; i >= 0; --i) {
      out[pos++] = hex[(v >> (i * 8 + 4)) & 0xF];
      out[pos++] = hex[(v >> (i * 8)) & 0xF];
    }
  };
  put(0,  hi >> 32, 4);
  put(9,  (hi >> 16) & 0xFFFF, 2);
  put(14, hi & 0xFFFF, 2);
  put(19, lo >> 48, 2);
  put(24, lo & 0xFFFFFFFFFFFFULL, 6);
  return out;
}

std::string current_trace_id() {
  const char* xray = std::getenv("_X_AMZN_TRACE_ID");
  if (xray != nullptr && *xray != '\0') return xray;
  return "unknown";
}

std::string json_escape(const std::string& in) {
  std::string out;
  out.reserve(in.size() + 2);
  for (char c : in) {
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b";  break;
      case '\f': out += "\\f";  break;
      case '\n': out += "\\n";  break;
      case '\r': out += "\\r";  break;
      case '\t': out += "\\t";  break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

void write_console_entry(LogLevel level, const std::string& rendered) {
  auto& sink = (level == LogLevel::Error) ? std::cerr : std::cout;
  sink << rendered << '\n';
}

}  // namespace

std::string LogValue::render() const {
  return std::visit(
      [](const auto& v) -> std::string {
        using T = std::decay_t<decltype(v)>;
        if constexpr (std::is_same_v<T, std::string>) {
          return v;
        } else if constexpr (std::is_same_v<T, double>) {
          std::ostringstream ss;
          ss << v;
          return ss.str();
        } else if constexpr (std::is_same_v<T, long long>) {
          return std::to_string(v);
        } else if constexpr (std::is_same_v<T, bool>) {
          return v ? "true" : "false";
        } else {
          // map<string,string> — render as a single-line JSON object.
          std::ostringstream ss;
          ss << "{";
          bool first = true;
          for (const auto& [k, val] : v) {
            if (!first) ss << ",";
            first = false;
            ss << "\"" << json_escape(k) << "\":\"" << json_escape(val) << "\"";
          }
          ss << "}";
          return ss.str();
        }
      },
      value);
}

CloudOpsLogger::CloudOpsLogger(std::string name) {
  resource_attributes_ = detail::runtime_resource_attributes();
  enabled_levels_      = detail::parse_level_set(
      std::getenv("OTEL_LOG_LEVEL") == nullptr ? "" : std::getenv("OTEL_LOG_LEVEL"),
      {LogLevel::Info, LogLevel::Error, LogLevel::Debug, LogLevel::Warn});
  exporters_ = detail::parse_string_list(
      std::getenv("OTEL_BACKEND_EXPORTERS") == nullptr ? "" : std::getenv("OTEL_BACKEND_EXPORTERS"),
      {"console"});
  logger_name_ = name.empty() ? resource_attributes_["service.name"] : std::move(name);
  sampler_     = std::make_unique<LogSampler>(*this, detail::sampling_rate());
  init();
}

CloudOpsLogger::~CloudOpsLogger() = default;

void CloudOpsLogger::info(const std::string& m, std::vector<LogValue> p)  { log(LogLevel::Info,  m, std::move(p)); }
void CloudOpsLogger::error(const std::string& m, std::vector<LogValue> p) { log(LogLevel::Error, m, std::move(p)); }
void CloudOpsLogger::debug(const std::string& m, std::vector<LogValue> p) { log(LogLevel::Debug, m, std::move(p)); }
void CloudOpsLogger::warn(const std::string& m, std::vector<LogValue> p)  { log(LogLevel::Warn,  m, std::move(p)); }

void CloudOpsLogger::log(LogLevel level, const std::string& message, std::vector<LogValue> params) {
  std::string trace = current_trace_id();
  std::string invocation;
  {
    std::lock_guard<std::mutex> lk(mu_);
    if (trace != previous_trace_id_) {
      unique_id_         = make_uuid();
      previous_trace_id_ = trace;
    }
    invocation = unique_id_.empty() ? "unknown" : unique_id_;
  }

  LogEntry entry;
  entry.invocation_id   = invocation;
  entry.level           = level;
  entry.message         = message;
  entry.optional_params = std::move(params);
  sampler_->add(std::move(entry));
}

void CloudOpsLogger::process_log(const LogEntry& entry) {
  if (enabled_levels_.find(entry.level) == enabled_levels_.end()) return;

  auto rendered = render_entry(entry);

  if (use_console_) {
    write_console_entry(entry.level, rendered);
  }

  if (use_otel_) {
    std::lock_guard<std::mutex> lk(mu_);
    pending_.push_back(entry);
  }
}

void CloudOpsLogger::export_logs() {
  sampler_->flush_one_batch();
  if (!use_otel_) return;

  std::vector<LogEntry> pending;
  {
    std::lock_guard<std::mutex> lk(mu_);
    pending.swap(pending_);
  }
  if (pending.empty()) return;

  if (!transport_) {
    if (!use_console_) {
      for (const auto& entry : pending) {
        write_console_entry(entry.level, render_entry(entry));
      }
    }
    return;
  }

  auto body = build_otlp_payload(pending);
  bool shipped = false;
  try {
    shipped = transport_(otel_url_, otel_headers_, body);
  } catch (...) {
    shipped = false;
  }
  if (!shipped && !use_console_) {
    for (const auto& entry : pending) {
      write_console_entry(entry.level, render_entry(entry));
    }
  }
}

void CloudOpsLogger::set_otlp_transport(OtlpTransport transport) {
  transport_ = std::move(transport);
}

const std::map<std::string, std::string>& CloudOpsLogger::resource_attributes() const noexcept {
  return resource_attributes_;
}

const std::unordered_set<LogLevel>& CloudOpsLogger::enabled_levels() const noexcept {
  return enabled_levels_;
}

void CloudOpsLogger::init() {
  if (exporters_.size() == 1) {
    auto only = exporters_[0];
    std::transform(only.begin(), only.end(), only.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    if (only == "console") {
      use_console_ = true;
      return;
    }
  }

  auto ssm = detail::read_ssm_parameters();
  if (ssm.is_empty()) {
    use_console_ = true;
    return;
  }

  for (const auto& exporter : exporters_) {
    std::string lower = exporter;
    std::transform(lower.begin(), lower.end(), lower.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    if (lower == "console") {
      use_console_ = true;
    } else if (lower == "otel" && ssm.otel_logs.has_value()) {
      const auto& cfg = ssm.otel_logs.value();
      if (cfg.url.has_value()) {
        otel_url_ = cfg.url.value();
        if (cfg.api_key.has_value()) {
          otel_headers_["authorization"] = std::string{"Bearer "} + cfg.api_key.value();
        }
        use_otel_ = true;
      } else {
        use_console_ = true;
      }
    } else {
      use_console_ = true;
    }
  }
}

std::string CloudOpsLogger::render_entry(const LogEntry& entry) const {
  std::ostringstream ss;
  ss << entry.message;
  for (const auto& p : entry.optional_params) {
    ss << '\n' << p.render();
  }
  return ss.str();
}

std::string CloudOpsLogger::build_otlp_payload(const std::vector<LogEntry>& entries) const {
  auto now_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
      std::chrono::system_clock::now().time_since_epoch()).count();

  std::ostringstream ss;
  ss << "{\"resourceLogs\":[{\"resource\":{\"attributes\":[";
  bool first = true;
  for (const auto& [k, v] : resource_attributes_) {
    if (!first) ss << ",";
    first = false;
    ss << "{\"key\":\"" << json_escape(k)
       << "\",\"value\":{\"stringValue\":\"" << json_escape(v) << "\"}}";
  }
  ss << "]},\"scopeLogs\":[{\"scope\":{\"name\":\"cloudops.otel.logs\"},\"logRecords\":[";

  bool first_record = true;
  for (const auto& e : entries) {
    if (!first_record) ss << ",";
    first_record = false;
    ss << "{\"timeUnixNano\":\"" << now_ns
       << "\",\"observedTimeUnixNano\":\"" << now_ns
       << "\",\"severityText\":\"";
    auto level_str = log_level_to_string(e.level);
    std::transform(level_str.begin(), level_str.end(), level_str.begin(),
                   [](unsigned char c) { return std::toupper(c); });
    ss << level_str
       << "\",\"body\":{\"stringValue\":\"" << json_escape(render_entry(e))
       << "\"},\"attributes\":[{\"key\":\"invocation.id\",\"value\":{\"stringValue\":\""
       << json_escape(e.invocation_id) << "\"}}]}";
  }

  ss << "]}]}]}";
  return ss.str();
}

CloudOpsLogger& logger() {
  static CloudOpsLogger instance{};
  return instance;
}

}  // namespace cloudops::otel::logs
