cmake_minimum_required(VERSION 3.16)
project(cloudops_otel_traces LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CLOUDOPS_TRACES_BUILD_TESTS "Build cloudops-otel-traces tests" ON)
option(CLOUDOPS_TRACES_ENABLE_COVERAGE "Build cloudops-otel-traces with coverage instrumentation" OFF)

add_library(cloudops_otel_traces STATIC
  src/tracer.cpp
  src/config.cpp
)

target_include_directories(cloudops_otel_traces PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)

target_compile_options(cloudops_otel_traces PRIVATE -Wall -Wextra -Wpedantic)
if(CLOUDOPS_TRACES_ENABLE_COVERAGE)
  if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(cloudops_otel_traces PUBLIC -O0 -g --coverage)
    target_link_options(cloudops_otel_traces PUBLIC --coverage)
  else()
    message(WARNING "CLOUDOPS_TRACES_ENABLE_COVERAGE requires GCC or Clang")
  endif()
endif()
if(WIN32)
  target_compile_definitions(cloudops_otel_traces PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

if(CLOUDOPS_TRACES_BUILD_TESTS)
  enable_testing()
  add_executable(cloudops_otel_traces_tests
    tests/test_main.cpp
    tests/test_config.cpp
    tests/test_tracer.cpp
  )
  target_link_libraries(cloudops_otel_traces_tests PRIVATE cloudops_otel_traces)
  add_test(NAME cloudops_otel_traces_tests COMMAND cloudops_otel_traces_tests)

  add_executable(cloudops_otel_traces_smoke examples/smoke.cpp)
  target_link_libraries(cloudops_otel_traces_smoke PRIVATE cloudops_otel_traces)
  add_test(NAME cloudops_otel_traces_smoke COMMAND cloudops_otel_traces_smoke)
endif()
