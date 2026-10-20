#Cluster outputs — consumed by the platform stack via terraform_remote_state.

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_ca_certificate" {
  value     = module.eks.cluster_ca_certificate
  sensitive = true
}

output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "oidc_provider_url" {
  value = module.eks.oidc_provider_url
}

output "order_api_irsa_role_arn" {
  value = module.eks.order_api_irsa_role_arn
}

output "order_api_api_key_secret_arn" {
  value = var.order_api_api_key_secret_arn
}

#Passthroughs from foundation that the platform stack also needs but does
#not need to re-read from the foundation state.
output "vpc_id" {
  value = local.vpc_id
}

output "name_prefix" {
  value = local.name_prefix
}

output "account_id" {
  value = local.account_id
}
