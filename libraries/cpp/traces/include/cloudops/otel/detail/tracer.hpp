// Internal helpers — exposed only for the .cpp implementation files and tests.

#ifndef CLOUDOPS_OTEL_TRACES_DETAIL_TRACER_HPP
#define CLOUDOPS_OTEL_TRACES_DETAIL_TRACER_HPP

#include <map>
#include <string>
#include <vector>

#include "cloudops/otel/traces.hpp"

namespace cloudops::otel::traces::detail {

std::map<std::string, std::string> parse_resource_attributes(const std::string& raw);
std::vector<std::string>           parse_string_list(const std::string& raw,
                                                     const std::vector<std::string>& fallback);
std::string                        normalize_endpoint(const std::string& endpoint);
SsmParameters                      read_ssm_parameters();
SsmParameters                      read_ssm_parameters_file(const std::string& file_path = {});
std::map<std::string, std::string> runtime_resource_attributes();
double                             sampler_ratio();
std::string                        new_xray_trace_id();
std::string                        new_span_id();

}  // namespace cloudops::otel::traces::detail

#endif  // CLOUDOPS_OTEL_TRACES_DETAIL_TRACER_HPP
