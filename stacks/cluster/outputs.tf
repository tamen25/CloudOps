#Cluster outputs — consumed by the platform stack via terraform_remote_state.

output "cluster_name" {
  value = module.eks.cluster_name
}

#Exposes the cluster endpoint output value.
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

#Exposes the cluster ca certificate output value.
output "cluster_ca_certificate" {
  value     = module.eks.cluster_ca_certificate
  sensitive = true
}

#Exposes the OIDC provider arn output value.
output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

#Exposes the OIDC provider URL output value.
output "oidc_provider_url" {
  value = module.eks.oidc_provider_url
}

#Exposes the order API irsa role arn output value.
output "order_api_irsa_role_arn" {
  value = module.eks.order_api_irsa_role_arn
}

#Exposes the order API API key secret arn output value.
output "order_api_api_key_secret_arn" {
  value = var.order_api_api_key_secret_arn
}

#Passthroughs from foundation that the platform stack also needs but does
#not need to re-read from the foundation state.
output "vpc_id" {
  value = local.vpc_id
}

#Exposes the name prefix output value.
output "name_prefix" {
  value = local.name_prefix
}

#Exposes the account ID output value.
output "account_id" {
  value = local.account_id
}
