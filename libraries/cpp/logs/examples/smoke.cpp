// Smoke-test consumer for cloudops-otel-logs (C++). Exercises every public
// surface and exits 0 when the library wires up correctly. Built ad-hoc by
// CMake's `examples` target wiring; can also be compiled standalone:
//
//   clang++ -std=c++17 -I ../include examples/smoke.cpp src/*.cpp -o smoke

#include <cstdio>
#include <cstdlib>
#include <stdexcept>

#include "cloudops/otel/logs.hpp"

namespace logs = cloudops::otel::logs;

int main() {
#ifdef _WIN32
  _putenv_s("OTEL_SERVICE_NAME", "smoke-test");
  _putenv_s("OTEL_LOGS_SAMPLING_RATE", "0");
#else
  setenv("OTEL_SERVICE_NAME", "smoke-test", 1);
  setenv("OTEL_LOGS_SAMPLING_RATE", "0", 1);
#endif

  logs::CloudOpsLogger logger{"smoke-test"};

  logger.info("info line", {{ logs::LogValue{ std::string{"k=v"} } }});
  logger.warn("warn line");
  logger.debug("debug line");

  try {
    throw std::runtime_error("boom");
  } catch (const std::exception& ex) {
    logger.error(ex.what());
  }

  // Wire a no-op transport so export_logs still runs the OTel branch when
  // OTEL_BACKEND_EXPORTERS=otel is set in CI; harmless for console runs.
  logger.set_otlp_transport([](const std::string&,
                               const std::map<std::string, std::string>&,
                               const std::string&) { return true; });
  logger.export_logs();

  const auto& attrs = logger.resource_attributes();
  if (attrs.find("service.name") == attrs.end() || attrs.at("service.name") != "smoke-test") {
    std::fprintf(stderr, "service.name not propagated\n");
    return EXIT_FAILURE;
  }
  if (logger.enabled_levels().find(logs::LogLevel::Error) == logger.enabled_levels().end()) {
    std::fprintf(stderr, "error level not enabled by default\n");
    return EXIT_FAILURE;
  }

  std::printf("ok — c++ smoke\n");
  return EXIT_SUCCESS;
}
