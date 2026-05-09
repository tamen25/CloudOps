#This file defines ECR cache settings for CloudOps.
#ECR pull-through cache for Amazon ECR Public Gallery.
#ECR (a managed AWS service) fetches images from public.ecr.aws on first request
#and caches them in the account's private ECR. EKS nodes then pull through the
#private ECR VPC endpoints — no NAT gateway required.
resource "aws_ecr_pull_through_cache_rule" "ecr_public" {
  ecr_repository_prefix = "ecr-public"
  upstream_registry_url = "public.ecr.aws"
}
