output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

#Exposes the cluster endpoint output value.
output "cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = aws_eks_cluster.main.endpoint
}

#Exposes the cluster ca certificate output value.
output "cluster_ca_certificate" {
  description = "Base64-encoded cluster CA certificate"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

#Exposes the node group arn output value.
output "node_group_arn" {
  description = "Managed node group ARN"
  value       = aws_eks_node_group.main.arn
}

#Exposes the OIDC provider arn output value.
output "oidc_provider_arn" {
  description = "OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.main.arn
}

#Exposes the OIDC provider URL output value.
output "oidc_provider_url" {
  description = "OIDC provider URL (without https://)"
  value       = local.oidc_issuer
}

#Exposes the order API irsa role arn output value.
output "order_api_irsa_role_arn" {
  description = "IRSA role ARN for order-api — set as eks.amazonaws.com/role-arn on the service account"
  value       = aws_iam_role.order_api.arn
}

#Exposes the EKS cluster role arn output value.
output "eks_cluster_role_arn" {
  description = "EKS cluster IAM role ARN"
  value       = aws_iam_role.eks_cluster.arn
}

#Exposes the EKS node role arn output value.
output "eks_node_role_arn" {
  description = "EKS node IAM role ARN"
  value       = aws_iam_role.eks_node.arn
}
