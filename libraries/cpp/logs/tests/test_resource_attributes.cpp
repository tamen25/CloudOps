#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>

#include "cloudops/otel/detail/sampler.hpp"

namespace logs = cloudops::otel::logs;

namespace {
int check(bool condition, const char* msg) {
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", msg);
    return 1;
  }
  return 0;
}
}  // namespace

// Runs resource attribute tests.
int run_resource_attribute_tests() {
  int failures = 0;

  // parse_string_list — JSON array path.
  auto list_json = logs::detail::parse_string_list("[\"console\",\"otel\"]", {});
  failures += check(list_json.size() == 2 && list_json[1] == "otel", "parse_string_list json");

  // parse_string_list — CSV path.
  auto list_csv = logs::detail::parse_string_list(" console , otel ", {});
  failures += check(list_csv.size() == 2 && list_csv[0] == "console", "parse_string_list csv");

  // parse_string_list — fallback when input is empty.
  auto list_default = logs::detail::parse_string_list("", {"console"});
  failures += check(list_default.size() == 1 && list_default[0] == "console", "parse_string_list fallback");

  // parse_level_set keeps known values and falls back when every value is bad.
  auto levels_mixed = logs::detail::parse_level_set("bad,error", {logs::LogLevel::Info});
  failures += check(levels_mixed.size() == 1 && levels_mixed.count(logs::LogLevel::Error) == 1, "parse_level_set ignores bad");
  auto levels_bad = logs::detail::parse_level_set("bad", {logs::LogLevel::Info});
  failures += check(levels_bad.size() == 1 && levels_bad.count(logs::LogLevel::Info) == 1, "parse_level_set fallback");

  // normalize_endpoint adds suffix once.
  failures += check(logs::detail::normalize_endpoint("https://otel.example.com/") == "https://otel.example.com/v1/logs", "normalize_endpoint trailing");
  failures += check(logs::detail::normalize_endpoint("https://otel.example.com/v1/logs") == "https://otel.example.com/v1/logs", "normalize_endpoint already-suffixed");

  // OTEL_SSM_PARAMETERS path.
#ifdef _WIN32
  _putenv_s("OTEL_SSM_PARAMETERS", "{\"otel\":{\"logs\":{\"url\":\"https://collector.example.com/v1/logs\",\"api_key\":\"secret\"}}}");
  _putenv_s("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "");
  _putenv_s("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  _putenv_s("OTEL_API_KEY", "");
  _putenv_s("OTEL_EXPORTER_OTLP_HEADERS", "");
#else
  setenv("OTEL_SSM_PARAMETERS", "{\"otel\":{\"logs\":{\"url\":\"https://collector.example.com/v1/logs\",\"api_key\":\"secret\"}}}", 1);
  unsetenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT");
  unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT");
  unsetenv("OTEL_API_KEY");
  unsetenv("OTEL_EXPORTER_OTLP_HEADERS");
#endif
  auto ssm = logs::detail::read_ssm_parameters();
  failures += check(!ssm.is_empty(), "ssm parameters parsed");
  failures += check(ssm.otel_logs.has_value() && ssm.otel_logs->url.value_or("") == "https://collector.example.com/v1/logs", "ssm url");
  failures += check(ssm.otel_logs.has_value() && ssm.otel_logs->api_key.value_or("") == "secret", "ssm api key");

  auto params_file = std::filesystem::temp_directory_path() / "cloudops-otel-logs-otelExporterParams.json";
  {
    std::ofstream out(params_file);
    out << "{\"otel\":{\"logs\":{\"url\":\"https://file.example.com/v1/logs\",\"api_key\":\"file-secret\"}}}";
  }
#ifdef _WIN32
  _putenv_s("OTEL_SSM_PARAMETERS", "");
  _putenv_s("OTEL_SSM_PARAMETERS_FILE", params_file.string().c_str());
  _putenv_s("OTEL_EXPORTER_OTLP_ENDPOINT", "https://fallback.example.com");
  _putenv_s("OTEL_API_KEY", "fallback-secret");
#else
  unsetenv("OTEL_SSM_PARAMETERS");
  setenv("OTEL_SSM_PARAMETERS_FILE", params_file.string().c_str(), 1);
  setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://fallback.example.com", 1);
  setenv("OTEL_API_KEY", "fallback-secret", 1);
#endif
  ssm = logs::detail::read_ssm_parameters();
  failures += check(!ssm.is_empty(), "ssm parameters file parsed");
  failures += check(ssm.otel_logs.has_value() && ssm.otel_logs->url.value_or("") == "https://file.example.com/v1/logs", "ssm file url");
  failures += check(ssm.otel_logs.has_value() && ssm.otel_logs->api_key.value_or("") == "file-secret", "ssm file api key");

  {
    std::ofstream out(params_file);
    out << "{not-json";
  }
#ifdef _WIN32
  _putenv_s("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "https://fallback.example.com/v1/logs");
  _putenv_s("OTEL_API_KEY", "fallback-secret");
#else
  setenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "https://fallback.example.com/v1/logs", 1);
  setenv("OTEL_API_KEY", "fallback-secret", 1);
#endif
  ssm = logs::detail::read_ssm_parameters();
  failures += check(!ssm.is_empty(), "ssm invalid file fallback parsed");
  failures += check(ssm.otel_logs.has_value() && ssm.otel_logs->url.value_or("") == "https://fallback.example.com/v1/logs", "ssm invalid file fallback url");
  failures += check(ssm.otel_logs.has_value() && ssm.otel_logs->api_key.value_or("") == "fallback-secret", "ssm invalid file fallback api key");

#ifdef _WIN32
  _putenv_s("OTEL_SSM_PARAMETERS_FILE", "");
  _putenv_s("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  _putenv_s("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "");
  _putenv_s("OTEL_API_KEY", "");
#else
  unsetenv("OTEL_SSM_PARAMETERS_FILE");
  unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT");
  unsetenv("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT");
  unsetenv("OTEL_API_KEY");
#endif
  std::filesystem::remove(params_file);

  // Lambda path.
#ifdef _WIN32
  _putenv_s("AWS_LAMBDA_FUNCTION_NAME", "fn-test");
  _putenv_s("OTEL_SERVICE_NAME", "fn-svc");
#else
  setenv("AWS_LAMBDA_FUNCTION_NAME", "fn-test", 1);
  setenv("OTEL_SERVICE_NAME", "fn-svc", 1);
#endif
  auto attrs = logs::detail::runtime_resource_attributes();
  failures += check(attrs["cloud.platform"] == "aws_lambda", "lambda cloud.platform");
  failures += check(attrs["faas.name"] == "fn-test", "lambda faas.name");
  failures += check(attrs["service.name"] == "fn-svc", "lambda service.name");

#ifdef _WIN32
  _putenv_s("AWS_LAMBDA_FUNCTION_NAME", "");
  _putenv_s("OTEL_SERVICE_NAME", "");
#else
  unsetenv("AWS_LAMBDA_FUNCTION_NAME");
  unsetenv("OTEL_SERVICE_NAME");
#endif

  // OTEL_SERVICE_NAME overrides service.name from OTEL_RESOURCE_ATTRIBUTES.
#ifdef _WIN32
  _putenv_s("OTEL_RESOURCE_ATTRIBUTES", "service.name=from-resource,deployment.environment=dev");
  _putenv_s("OTEL_SERVICE_NAME", "from-env");
#else
  setenv("OTEL_RESOURCE_ATTRIBUTES", "service.name=from-resource,deployment.environment=dev", 1);
  setenv("OTEL_SERVICE_NAME", "from-env", 1);
#endif
  attrs = logs::detail::runtime_resource_attributes();
  failures += check(attrs["service.name"] == "from-env", "service.name override");
  failures += check(attrs["deployment.environment"] == "dev", "resource attr preserved");

#ifdef _WIN32
  _putenv_s("OTEL_RESOURCE_ATTRIBUTES", "");
  _putenv_s("OTEL_SERVICE_NAME", "");
#else
  unsetenv("OTEL_RESOURCE_ATTRIBUTES");
  unsetenv("OTEL_SERVICE_NAME");
#endif
  return failures;
}
