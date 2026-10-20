variable "github_config_url" {
  description = "Repository (or organisation) the runners register with, e.g. https://github.com/owner/repo"
  type        = string

  validation {
    condition     = can(regex("^https://github\\.com/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$", var.github_config_url))
    error_message = "github_config_url must be https://github.com/<owner> or https://github.com/<owner>/<repo>."
  }
}

variable "github_app_secret_arn" {
  description = "Secrets Manager secret holding the GitHub App as JSON: github_app_id, github_app_installation_id, github_app_private_key. Created by hand (docs/runbooks/ci-runner.md)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:secretsmanager:", var.github_app_secret_arn))
    error_message = "github_app_secret_arn must be a Secrets Manager secret ARN."
  }
}

variable "runner_image" {
  description = "Runner image (ci/runner/Dockerfile, pushed to ECR by runner-image.yml), pinned by digest"
  type        = string

  # A tag can be moved; the runner holds deploy credentials for a whole job,
  # so the image it runs is pinned to the bytes that were scanned.
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.runner_image))
    error_message = "runner_image must be pinned by digest (<repository>@sha256:<64 hex>)."
  }
}

variable "runner_set_name" {
  description = "Runner scale set name; workflows select these runners with runs-on: <this name> (the DEPLOY_RUNNER repository variable)"
  type        = string
  default     = "cloudops-vpc"
}

variable "max_runners" {
  description = "Most runner pods at once; one job per pod"
  type        = number
  default     = 3

  validation {
    condition     = var.max_runners >= 1 && var.max_runners <= 10
    error_message = "max_runners must be between 1 and 10."
  }
}

variable "chart_version" {
  description = "Version of both ARC charts (gha-runner-scale-set-controller and gha-runner-scale-set); they are released together and must match"
  type        = string
  default     = "0.14.2"
}
