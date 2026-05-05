data "terraform_remote_state" "foundation" {
  count = var.use_remote_state_foundation ? 1 : 0

  backend = "s3"

  config = {
    bucket = var.foundation_state_bucket
    key    = var.foundation_state_key
    region = var.region
  }
}

data "terraform_remote_state" "cluster" {
  count = var.use_remote_state_cluster ? 1 : 0

  backend = "s3"

  config = {
    bucket = var.cluster_state_bucket
    key    = var.cluster_state_key
    region = var.region
  }
}
