// This file contains test sampler logic for logs tests.
#include <cstdio>

#include "cloudops/otel/logs.hpp"

namespace logs = cloudops::otel::logs;

namespace {
// Checks the requested work.
int check(bool condition, const char* msg) {
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", msg);
    return 1;
  }
  return 0;
}
}  // namespace

// Runs sampler tests.
int run_sampler_tests() {
  int failures = 0;

  // Build a fresh logger and exercise the public surface — error paths must
  // never throw and `export_logs` is safe to call with no transport wired.
  logs::CloudOpsLogger l{"test-svc"};
  l.info("hello", {{logs::LogValue{std::string{"order_id"}}}});
  l.error("boom");
  l.export_logs();

  failures += check(l.resource_attributes().count("service.name") > 0, "service.name attr");
  failures += check(l.enabled_levels().size() > 0, "enabled levels populated");
  return failures;
}
