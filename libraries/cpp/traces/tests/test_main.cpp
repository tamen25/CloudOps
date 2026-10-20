#include <cstdio>
#include <cstdlib>

extern int run_config_tests();
extern int run_tracer_tests();

int main() {
  int failures = 0;
  failures += run_config_tests();
  failures += run_tracer_tests();

  if (failures == 0) {
    std::printf("ok — all cloudops-otel-traces tests passed\n");
    return EXIT_SUCCESS;
  }
  std::fprintf(stderr, "FAIL — %d failing tests\n", failures);
  return EXIT_FAILURE;
}
