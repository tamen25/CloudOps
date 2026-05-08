// CloudOps OpenTelemetry logs helper for C++ services.
//
// Mirrors the Node.js / Python / Java / .NET / Go libraries' API surface and
// environment-variable contract. Console output is the default sink; OTLP
// export is left to the caller (no in-tree HTTP client) so consumers can
// link the library without a hard dependency on libcurl / OpenSSL.
//
// Usage:
//
//     #include <cloudops/otel/logs.hpp>
//
//     auto& logger = cloudops::otel::logs::logger();
//     logger.info("order created", {cloudops::otel::logs::LogValue{
//       std::map<std::string, std::string>{{"order_id", order_id}}
//     }});
//     logger.error(ex.what());
//     logger.export_logs();
//
// Environment contract (matches the other libraries):
//
//     OTEL_BACKEND_EXPORTERS         JSON array or CSV; default "console"
//     OTEL_LOG_LEVEL                 JSON array or CSV of info/error/debug/warn
//     OTEL_LOGS_SAMPLING_RATE        percentage 0..100; errors always export
//     OTEL_SSM_PARAMETERS            JSON object with otel.logs.{url,api_key}
//     OTEL_EXPORTER_OTLP_LOGS_ENDPOINT  OTLP HTTP endpoint fallback
//     OTEL_EXPORTER_OTLP_ENDPOINT       same, base URL (suffixed /v1/logs)
//     OTEL_API_KEY / OTEL_EXPORTER_OTLP_HEADERS  bearer auth fallback

#ifndef CLOUDOPS_OTEL_LOGS_HPP
#define CLOUDOPS_OTEL_LOGS_HPP

#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <variant>
#include <vector>

namespace cloudops::otel::logs {

constexpr const char* library_version = "1.16.2";

enum class LogLevel { Info, Error, Debug, Warn };

std::string log_level_to_string(LogLevel level);
LogLevel    log_level_from_string(const std::string& s);

// LogValue is the union accepted as an optional param. Strings / numbers /
// booleans / nested string maps are first-class; everything else is rendered
// via `to_string`.
struct LogValue {
  std::variant<std::string, double, long long, bool, std::map<std::string, std::string>> value;
  std::string render() const;
};

struct LogEntry {
  std::string                   invocation_id;
  LogLevel                      level{LogLevel::Info};
  std::string                   message;
  std::vector<LogValue>         optional_params;
};

struct LogBatch {
  std::vector<LogEntry> logs;
};

struct LogsExporterConfig {
  std::optional<std::string> url;
  std::optional<std::string> api_key;
};

struct SsmParameters {
  std::optional<LogsExporterConfig> otel_logs;
  bool is_empty() const;
};

class LogSampler;

class CloudOpsLogger {
 public:
  explicit CloudOpsLogger(std::string name = "");
  ~CloudOpsLogger();

  CloudOpsLogger(const CloudOpsLogger&)            = delete;
  CloudOpsLogger& operator=(const CloudOpsLogger&) = delete;

  void info(const std::string& message, std::vector<LogValue> params = {});
  void error(const std::string& message, std::vector<LogValue> params = {});
  void debug(const std::string& message, std::vector<LogValue> params = {});
  void warn(const std::string& message, std::vector<LogValue> params = {});
  void log(LogLevel level, const std::string& message, std::vector<LogValue> params = {});

  void process_log(const LogEntry& entry);

  // Flushes any in-flight sampling batch and (when an OTLP transport is
  // wired via set_otlp_transport) ships pending entries.
  void export_logs();

  using OtlpTransport =
      std::function<bool(const std::string& url,
                         const std::map<std::string, std::string>& headers,
                         const std::string& body)>;

  // Inject a transport implementation (e.g. libcurl). When unset OTLP
  // export is a no-op and console output remains the active sink.
  void set_otlp_transport(OtlpTransport transport);

  const std::map<std::string, std::string>& resource_attributes() const noexcept;
  const std::unordered_set<LogLevel>&        enabled_levels() const noexcept;

 private:
  void                  init();
  std::string           render_entry(const LogEntry& entry) const;
  std::string           build_otlp_payload(const std::vector<LogEntry>& entries) const;

  std::map<std::string, std::string>   resource_attributes_;
  std::unordered_set<LogLevel>         enabled_levels_;
  std::vector<std::string>             exporters_;
  std::string                          logger_name_;
  bool                                 use_console_{false};
  bool                                 use_otel_{false};
  std::string                          otel_url_;
  std::map<std::string, std::string>   otel_headers_;
  std::unique_ptr<LogSampler>          sampler_;
  std::string                          previous_trace_id_;
  std::string                          unique_id_;
  std::vector<LogEntry>                pending_;
  OtlpTransport                        transport_;
  mutable std::mutex                   mu_;
};

// Module-level logger, mirroring the other libraries.
CloudOpsLogger& logger();

}  // namespace cloudops::otel::logs

#endif  // CLOUDOPS_OTEL_LOGS_HPP
