#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>

#include "cloudops/otel/detail/tracer.hpp"

namespace traces = cloudops::otel::traces;

namespace {
int check(bool condition, const char* msg) {
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", msg);
    return 1;
  }
  return 0;
}

void set_env(const char* key, const char* value) {
#ifdef _WIN32
  _putenv_s(key, value);
#else
  if (value[0] == '\0') {
    unsetenv(key);
  } else {
    setenv(key, value, 1);
  }
#endif
}
}  // namespace

// Runs config tests.
int run_config_tests() {
  int failures = 0;

  // parse_string_list — JSON array + CSV + fallback.
  auto list_json = traces::detail::parse_string_list("[\"console\",\"otel\"]", {});
  failures += check(list_json.size() == 2 && list_json[1] == "otel", "parse_string_list json");
  auto list_csv = traces::detail::parse_string_list(" console , otel ", {});
  failures += check(list_csv.size() == 2 && list_csv[0] == "console", "parse_string_list csv");
  auto list_default = traces::detail::parse_string_list("", {"console"});
  failures += check(list_default.size() == 1 && list_default[0] == "console", "parse_string_list fallback");

  // normalize_endpoint adds the traces suffix once.
  failures += check(traces::detail::normalize_endpoint("https://otel.example.com/") == "https://otel.example.com/v1/traces", "normalize_endpoint trailing");
  failures += check(traces::detail::normalize_endpoint("https://otel.example.com/v1/traces") == "https://otel.example.com/v1/traces", "normalize_endpoint already-suffixed");

  // sampler_ratio default + explicit.
  set_env("TRACEID_RATIO_BASED_SAMPLER", "");
  failures += check(traces::detail::sampler_ratio() == 1.0, "sampler_ratio default");
  set_env("TRACEID_RATIO_BASED_SAMPLER", "0.25");
  failures += check(traces::detail::sampler_ratio() == 0.25, "sampler_ratio explicit");
  set_env("TRACEID_RATIO_BASED_SAMPLER", "");

  // OTEL_SSM_PARAMETERS JSON path.
  set_env("OTEL_SSM_PARAMETERS", "{\"otel\":{\"trace\":{\"url\":\"https://collector.example.com/v1/traces\",\"api_key\":\"secret\"}}}");
  set_env("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  set_env("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  set_env("OTEL_API_KEY", "");
  set_env("OTEL_EXPORTER_OTLP_HEADERS", "");
  auto ssm = traces::detail::read_ssm_parameters();
  failures += check(!ssm.is_empty(), "ssm parameters parsed");
  failures += check(ssm.otel_trace.has_value() && ssm.otel_trace->url.value_or("") == "https://collector.example.com/v1/traces", "ssm url");
  failures += check(ssm.otel_trace.has_value() && ssm.otel_trace->api_key.value_or("") == "secret", "ssm api key");

  // Params file path takes precedence over direct env fallback.
  auto params_file = std::filesystem::temp_directory_path() / "cloudops-otel-traces-otelExporterParams.json";
  {
    std::ofstream out(params_file);
    out << "{\"otel\":{\"trace\":{\"url\":\"https://file.example.com/v1/traces\",\"api_key\":\"file-secret\"}}}";
  }
  set_env("OTEL_SSM_PARAMETERS", "");
  set_env("OTEL_SSM_PARAMETERS_FILE", params_file.string().c_str());
  set_env("OTEL_EXPORTER_OTLP_ENDPOINT", "https://fallback.example.com");
  set_env("OTEL_API_KEY", "fallback-secret");
  ssm = traces::detail::read_ssm_parameters();
  failures += check(ssm.otel_trace.has_value() && ssm.otel_trace->url.value_or("") == "https://file.example.com/v1/traces", "ssm file url");

  // Invalid file falls back to direct OTEL env vars.
  {
    std::ofstream out(params_file);
    out << "{not-json";
  }
  set_env("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "https://fallback.example.com/v1/traces");
  set_env("OTEL_API_KEY", "fallback-secret");
  ssm = traces::detail::read_ssm_parameters();
  failures += check(ssm.otel_trace.has_value() && ssm.otel_trace->url.value_or("") == "https://fallback.example.com/v1/traces", "ssm invalid file fallback url");

  set_env("OTEL_SSM_PARAMETERS_FILE", "");
  set_env("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  set_env("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  set_env("OTEL_API_KEY", "");
  std::filesystem::remove(params_file);

  // Lambda resource attributes + trace version tag.
  set_env("AWS_LAMBDA_FUNCTION_NAME", "fn-test");
  set_env("OTEL_SERVICE_NAME", "fn-svc");
  auto attrs = traces::detail::runtime_resource_attributes();
  failures += check(attrs["cloud.platform"] == "aws_lambda", "lambda cloud.platform");
  failures += check(attrs["faas.name"] == "fn-test", "lambda faas.name");
  failures += check(attrs["service.name"] == "fn-svc", "lambda service.name");
  failures += check(attrs["cloudops-trace-ver"] == "0.1.0", "trace version attr");
  set_env("AWS_LAMBDA_FUNCTION_NAME", "");
  set_env("OTEL_SERVICE_NAME", "");

  // OTEL_SERVICE_NAME overrides service.name from OTEL_RESOURCE_ATTRIBUTES.
  set_env("OTEL_RESOURCE_ATTRIBUTES", "service.name=from-resource,deployment.environment=dev");
  set_env("OTEL_SERVICE_NAME", "from-env");
  attrs = traces::detail::runtime_resource_attributes();
  failures += check(attrs["service.name"] == "from-env", "service.name override");
  failures += check(attrs["deployment.environment"] == "dev", "resource attr preserved");
  set_env("OTEL_RESOURCE_ATTRIBUTES", "");
  set_env("OTEL_SERVICE_NAME", "");

  return failures;
}
