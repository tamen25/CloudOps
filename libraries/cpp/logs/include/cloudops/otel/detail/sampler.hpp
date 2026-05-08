// Internal sampler — exposed only for the .cpp implementation files.

#ifndef CLOUDOPS_OTEL_LOGS_DETAIL_SAMPLER_HPP
#define CLOUDOPS_OTEL_LOGS_DETAIL_SAMPLER_HPP

#include <map>
#include <mutex>
#include <random>
#include <string>

#include "cloudops/otel/logs.hpp"

namespace cloudops::otel::logs {

class LogSampler {
 public:
  LogSampler(CloudOpsLogger& logger, double rate);

  void add(LogEntry entry);
  void flush_one_batch();

 private:
  bool                                       should_sample();

  CloudOpsLogger&                            logger_;
  double                                     rate_;
  std::mutex                                 mu_;
  std::map<std::string, LogBatch>            batch_;
  std::mt19937                               rng_;
  std::uniform_real_distribution<double>     dist_;
};

namespace detail {
std::map<std::string, std::string> parse_resource_attributes(const std::string& raw);
std::vector<std::string>           parse_string_list(const std::string& raw,
                                                     const std::vector<std::string>& fallback);
std::unordered_set<LogLevel>       parse_level_set(const std::string& raw,
                                                   const std::unordered_set<LogLevel>& fallback);
std::string                        normalize_endpoint(const std::string& endpoint);
SsmParameters                      read_ssm_parameters();
std::map<std::string, std::string> runtime_resource_attributes();
double                             sampling_rate();
}  // namespace detail

}  // namespace cloudops::otel::logs

#endif  // CLOUDOPS_OTEL_LOGS_DETAIL_SAMPLER_HPP
