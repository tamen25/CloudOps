# Security integration variable
# Allows the SLO module to publish cross-alerts to the security SNS topic when
# the error budget burns critically fast (e.g., a security incident is causing
# elevated error rates).  Pass the security module's security_alerts_topic_arn
# output to wire them together.

variable "security_alerts_topic_arn" {
  description = "SNS topic ARN from the security module — used for cross-module alerts when error budget burn correlates with a security incident. Leave empty to disable cross-alerts."
  type        = string
  default     = ""
}
