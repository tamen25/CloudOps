#include "cloudops/otel/detail/sampler.hpp"

#include <chrono>

namespace cloudops::otel::logs {

LogSampler::LogSampler(CloudOpsLogger& logger, double rate)
    : logger_(logger),
      rate_(rate),
      rng_(static_cast<std::mt19937::result_type>(
          std::chrono::system_clock::now().time_since_epoch().count())),
      // Handles dist.
      dist_(0.0, 1.0) {}

void LogSampler::add(LogEntry entry) {
  if (rate_ == 0.0) {
    logger_.process_log(entry);
    return;
  }
  if (entry.invocation_id.empty() || entry.invocation_id == "unknown") {
    logger_.process_log(entry);
    return;
  }

  {
    std::lock_guard<std::mutex> lk(mu_);
    auto it = batch_.find(entry.invocation_id);
    if (it != batch_.end()) {
      it->second.logs.push_back(std::move(entry));
      return;
    }
  }

  flush_one_batch();

  std::lock_guard<std::mutex> lk(mu_);
  batch_[entry.invocation_id].logs.push_back(std::move(entry));
}

void LogSampler::flush_one_batch() {
  std::map<std::string, LogBatch> current;
  {
    std::lock_guard<std::mutex> lk(mu_);
    current.swap(batch_);
  }

  for (auto& [_, batch] : current) {
    bool has_error = false;
    for (const auto& e : batch.logs) {
      if (e.level == LogLevel::Error) {
        has_error = true;
        break;
      }
    }
    if (has_error || should_sample()) {
      for (const auto& e : batch.logs) logger_.process_log(e);
    }
  }
}

// Decides whether to sample.
bool LogSampler::should_sample() {
  double threshold = rate_;
  if (threshold < 0.0)   threshold = 0.0;
  if (threshold > 100.0) threshold = 100.0;
  return dist_(rng_) <= threshold / 100.0;
}

}  // namespace cloudops::otel::logs
