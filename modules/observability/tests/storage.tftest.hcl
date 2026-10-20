# Plans the observability module against mocked providers and checks its
# storage. EKS 1.30 and later create clusters without a default
# StorageClass; Loki's and Mimir's charts create claims that name none, so
# without a default those pods never schedule and the apply times out.
#
#   cd modules/observability && terraform init -backend=false && terraform test

mock_provider "aws" {}
mock_provider "helm" {}
mock_provider "kubernetes" {}
mock_provider "random" {}
mock_provider "null" {}

variables {
  name_prefix       = "cloudops-dev"
  environment       = "dev"
  region            = "us-east-1"
  aws_account_id    = "123456789012"
  eks_cluster_name  = "cloudops-dev-cluster"
  oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE"
  oidc_provider_url = "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE"
  acm_cert_arn      = "arn:aws:acm:us-east-1:123456789012:certificate/example"
  domain            = "example.com"
}

run "gp3_is_the_default_storage_class" {
  command = plan

  assert {
    condition     = kubernetes_storage_class.gp3.metadata[0].annotations["storageclass.kubernetes.io/is-default-class"] == "true"
    error_message = "gp3 must be the default StorageClass: charts that name no class would otherwise leave their claims Pending on EKS 1.30+."
  }

  assert {
    condition     = kubernetes_storage_class.gp3.storage_provisioner == "ebs.csi.aws.com"
    error_message = "gp3 must be provisioned by the EBS CSI driver."
  }
}
