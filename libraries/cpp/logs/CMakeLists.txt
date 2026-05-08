cmake_minimum_required(VERSION 3.16)
project(cloudops_otel_logs LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CLOUDOPS_LOGS_BUILD_TESTS "Build cloudops-otel-logs tests" ON)
option(CLOUDOPS_LOGS_ENABLE_COVERAGE "Build cloudops-otel-logs with coverage instrumentation" OFF)

add_library(cloudops_otel_logs STATIC
  src/logger.cpp
  src/sampler.cpp
  src/resource_attributes.cpp
)

target_include_directories(cloudops_otel_logs PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
)

target_compile_options(cloudops_otel_logs PRIVATE -Wall -Wextra -Wpedantic)
if(CLOUDOPS_LOGS_ENABLE_COVERAGE)
  if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(cloudops_otel_logs PUBLIC -O0 -g --coverage)
    target_link_options(cloudops_otel_logs PUBLIC --coverage)
  else()
    message(WARNING "CLOUDOPS_LOGS_ENABLE_COVERAGE requires GCC or Clang")
  endif()
endif()
if(WIN32)
  target_compile_definitions(cloudops_otel_logs PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

if(CLOUDOPS_LOGS_BUILD_TESTS)
  enable_testing()
  add_executable(cloudops_otel_logs_tests
    tests/test_main.cpp
    tests/test_resource_attributes.cpp
    tests/test_sampler.cpp
  )
  target_link_libraries(cloudops_otel_logs_tests PRIVATE cloudops_otel_logs)
  add_test(NAME cloudops_otel_logs_tests COMMAND cloudops_otel_logs_tests)

  add_executable(cloudops_otel_logs_smoke examples/smoke.cpp)
  target_link_libraries(cloudops_otel_logs_smoke PRIVATE cloudops_otel_logs)
  add_test(NAME cloudops_otel_logs_smoke COMMAND cloudops_otel_logs_smoke)
endif()
