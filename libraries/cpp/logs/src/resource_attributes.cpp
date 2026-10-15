// This file contains resource attributes logic for logs src.
#include "cloudops/otel/detail/sampler.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

namespace cloudops::otel::logs {

namespace {
constexpr const char* default_ssm_parameters_file = "/tmp/otelExporterParams.json";

// Handles trim.
std::string trim(std::string s) {
  auto not_space = [](unsigned char c) { return !std::isspace(c); };
  s.erase(s.begin(), std::find_if(s.begin(), s.end(), not_space));
  s.erase(std::find_if(s.rbegin(), s.rend(), not_space).base(), s.end());
  return s;
}

// Handles getenv str.
std::string getenv_str(const char* name) {
  const char* v = std::getenv(name);
  return v == nullptr ? std::string{} : std::string{v};
}

// Finds first env.
std::string first_env(std::initializer_list<const char*> names) {
  for (const char* n : names) {
    auto v = getenv_str(n);
    if (!v.empty()) return v;
  }
  return {};
}

// Converts lower.
std::string to_lower(std::string s) {
  // Handles transform.
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return std::tolower(c); });
  return s;
}

// Handles JSON string field.
std::optional<std::string> json_string_field(const std::string& raw, const std::string& field) {
  const std::string needle = "\"" + field + "\"";
  auto pos = raw.find(needle);
  if (pos == std::string::npos) return std::nullopt;

  pos = raw.find(':', pos + needle.size());
  if (pos == std::string::npos) return std::nullopt;
  ++pos;
  while (pos < raw.size() && std::isspace(static_cast<unsigned char>(raw[pos]))) ++pos;
  if (pos >= raw.size() || raw[pos] != '"') return std::nullopt;
  ++pos;

  std::string out;
  bool escaped = false;
  for (; pos < raw.size(); ++pos) {
    char c = raw[pos];
    if (escaped) {
      switch (c) {
        case '"': out.push_back('"'); break;
        case '\\': out.push_back('\\'); break;
        case '/': out.push_back('/'); break;
        case 'b': out.push_back('\b'); break;
        case 'f': out.push_back('\f'); break;
        case 'n': out.push_back('\n'); break;
        case 'r': out.push_back('\r'); break;
        case 't': out.push_back('\t'); break;
        default: out.push_back(c); break;
      }
      escaped = false;
      continue;
    }
    if (c == '\\') {
      escaped = true;
      continue;
    }
    if (c == '"') return out;
    out.push_back(c);
  }
  return std::nullopt;
}

// Handles SSM parameters from JSON.
SsmParameters ssm_parameters_from_json(const std::string& raw) {
  SsmParameters params;
  LogsExporterConfig cfg;
  auto url = json_string_field(raw, "url");
  auto api_key = json_string_field(raw, "api_key");
  if (url.has_value() && !url.value().empty()) cfg.url = url.value();
  if (api_key.has_value() && !api_key.value().empty()) cfg.api_key = api_key.value();
  if (cfg.url.has_value() || cfg.api_key.has_value()) {
    params.otel_logs = cfg;
  }
  return params;
}
}  // namespace

namespace detail {

// Parses resource attributes.
std::map<std::string, std::string> parse_resource_attributes(const std::string& raw) {
  std::map<std::string, std::string> out;
  if (raw.empty()) return out;

  std::stringstream ss(raw);
  std::string item;
  while (std::getline(ss, item, ',')) {
    auto eq = item.find('=');
    if (eq == std::string::npos) continue;
    auto k = trim(item.substr(0, eq));
    auto v = trim(item.substr(eq + 1));
    if (!k.empty() && !v.empty()) out[k] = v;
  }
  return out;
}

std::vector<std::string> parse_string_list(const std::string& raw,
                                           const std::vector<std::string>& fallback) {
  std::string trimmed = trim(raw);
  if (trimmed.empty()) return fallback;

  // Best-effort JSON-array detection without bringing in a JSON dep.
  if (!trimmed.empty() && trimmed.front() == '[' && trimmed.back() == ']') {
    std::vector<std::string> out;
    std::string body = trimmed.substr(1, trimmed.size() - 2);
    std::stringstream ss(body);
    std::string item;
    while (std::getline(ss, item, ',')) {
      auto t = trim(item);
      if (t.size() >= 2 && t.front() == '"' && t.back() == '"') {
        t = t.substr(1, t.size() - 2);
      }
      if (!t.empty()) out.push_back(t);
    }
    if (!out.empty()) return out;
  }

  std::vector<std::string> out;
  std::stringstream ss(trimmed);
  std::string item;
  while (std::getline(ss, item, ',')) {
    auto t = trim(item);
    if (!t.empty()) out.push_back(t);
  }
  return out.empty() ? fallback : out;
}

std::unordered_set<LogLevel> parse_level_set(const std::string& raw,
                                             const std::unordered_set<LogLevel>& fallback) {
  if (trim(raw).empty()) return fallback;
  auto items = parse_string_list(raw, {});
  if (items.empty()) return fallback;

  std::unordered_set<LogLevel> out;
  for (const auto& item : items) {
    auto level = to_lower(item);
    if (level == "info" || level == "error" || level == "debug" || level == "warn") {
      out.insert(log_level_from_string(level));
    }
  }
  return out.empty() ? fallback : out;
}

// Normalizes endpoint.
std::string normalize_endpoint(const std::string& endpoint) {
  if (endpoint.empty()) return {};
  std::string e = endpoint;
  while (!e.empty() && e.back() == '/') e.pop_back();
  const std::string suffix = "/v1/logs";
  if (e.size() >= suffix.size() && e.compare(e.size() - suffix.size(), suffix.size(), suffix) == 0) {
    return e;
  }
  return e + suffix;
}

// Reads SSM parameters.
SsmParameters read_ssm_parameters() {
  std::string configured = getenv_str("OTEL_SSM_PARAMETERS");
  if (!configured.empty()) {
    auto params = ssm_parameters_from_json(configured);
    if (!params.is_empty()) return params;
  }

  auto file_params = read_ssm_parameters_file();
  if (!file_params.is_empty()) {
    return file_params;
  }

  SsmParameters params;
  std::string logs_url = getenv_str("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT");
  if (logs_url.empty()) {
    logs_url = normalize_endpoint(getenv_str("OTEL_EXPORTER_OTLP_ENDPOINT"));
  }
  std::string api_key = getenv_str("OTEL_API_KEY");
  if (api_key.empty()) api_key = getenv_str("OTEL_EXPORTER_OTLP_HEADERS");

  if (!logs_url.empty() || !api_key.empty()) {
    LogsExporterConfig cfg;
    if (!logs_url.empty()) cfg.url = logs_url;
    if (!api_key.empty()) cfg.api_key = api_key;
    params.otel_logs = cfg;
  }

  return params;
}

// Reads SSM parameters file.
SsmParameters read_ssm_parameters_file(const std::string& file_path) {
  auto resolved_path = file_path;
  if (resolved_path.empty()) {
    resolved_path = first_env({"OTEL_SSM_PARAMETERS_FILE"});
  }
  if (resolved_path.empty()) {
    resolved_path = default_ssm_parameters_file;
  }

  std::ifstream input(resolved_path);
  if (!input) return {};

  std::stringstream buffer;
  buffer << input.rdbuf();
  return ssm_parameters_from_json(buffer.str());
}

// Handles runtime resource attributes.
std::map<std::string, std::string> runtime_resource_attributes() {
  auto attrs = parse_resource_attributes(getenv_str("OTEL_RESOURCE_ATTRIBUTES"));

  auto svc = getenv_str("OTEL_SERVICE_NAME");
  if (!svc.empty()) {
    attrs["service.name"] = svc;
  } else if (attrs.find("service.name") == attrs.end()) {
    svc = getenv_str("AWS_LAMBDA_FUNCTION_NAME");
    if (svc.empty()) svc = "unknown_service";
    attrs["service.name"] = svc;
  }
  attrs["cloudops-log-ver"] = library_version;

  auto lambda_name = getenv_str("AWS_LAMBDA_FUNCTION_NAME");
  if (!lambda_name.empty()) {
    attrs["cloud.platform"] = "aws_lambda";
    attrs["faas.name"]      = lambda_name;
    return attrs;
  }

  if (!first_env({"ECS_CONTAINER_METADATA_URI_V4", "ECS_CONTAINER_METADATA_URI"}).empty() ||
      !getenv_str("ECS_CONTAINER_METADATA_FILE").empty()) {
    attrs["cloud.platform"] = "aws_ecs";
  }

  bool running_on_k8s = !getenv_str("KUBERNETES_SERVICE_HOST").empty();
  auto cluster        = first_env({"K8S_CLUSTER_NAME", "EKS_CLUSTER_NAME"});
  auto namespace_name = first_env({"K8S_NAMESPACE_NAME", "POD_NAMESPACE"});
  auto node_name      = first_env({"K8S_NODE_NAME", "NODE_NAME"});
  auto pod_name       = first_env({"K8S_POD_NAME", "POD_NAME"});
  if (pod_name.empty() && running_on_k8s) pod_name = getenv_str("HOSTNAME");

  if (running_on_k8s || !cluster.empty() || !namespace_name.empty() || !pod_name.empty()) {
    attrs["cloud.platform"] = "aws_eks";
  }

  auto add_if = [&](const char* key, const std::string& value) {
    if (!value.empty()) attrs[key] = value;
  };
  add_if("k8s.cluster.name", cluster);
  add_if("k8s.namespace.name", namespace_name);
  add_if("k8s.node.name", node_name);
  add_if("k8s.pod.name", pod_name);
  add_if("container.id", getenv_str("CONTAINER_ID"));
  add_if("container.name", first_env({"CONTAINER_NAME", "ECS_CONTAINER_NAME"}));
  return attrs;
}

// Gets sampling rate.
double sampling_rate() {
  auto raw = getenv_str("OTEL_LOGS_SAMPLING_RATE");
  if (raw.empty()) return 100.0;
  try {
    return std::stod(raw);
  } catch (...) {
    return 100.0;
  }
}

}  // namespace detail

// Logs level to string.
std::string log_level_to_string(LogLevel level) {
  switch (level) {
    case LogLevel::Info:  return "info";
    case LogLevel::Error: return "error";
    case LogLevel::Debug: return "debug";
    case LogLevel::Warn:  return "warn";
  }
  return "info";
}

// Logs level from string.
LogLevel log_level_from_string(const std::string& s) {
  if (s == "error") return LogLevel::Error;
  if (s == "debug") return LogLevel::Debug;
  if (s == "warn")  return LogLevel::Warn;
  return LogLevel::Info;
}

// Checks whether empty.
bool SsmParameters::is_empty() const {
  if (!otel_logs.has_value()) return true;
  const auto& cfg = otel_logs.value();
  return !cfg.url.has_value() && !cfg.api_key.has_value();
}

}  // namespace cloudops::otel::logs
