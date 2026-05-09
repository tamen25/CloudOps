// This file contains test main logic for logs tests.
#include <cstdio>
#include <cstdlib>

extern int run_resource_attribute_tests();
extern int run_sampler_tests();

// Runs the main workflow for the requested work.
int main() {
  int failures = 0;
  failures += run_resource_attribute_tests();
  failures += run_sampler_tests();

  if (failures == 0) {
    std::printf("ok — all cloudops-otel-logs tests passed\n");
    return EXIT_SUCCESS;
  }
  std::fprintf(stderr, "FAIL — %d failing tests\n", failures);
  return EXIT_FAILURE;
}
