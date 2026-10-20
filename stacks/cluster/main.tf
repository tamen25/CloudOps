#Cluster stack — closes backlog #16 (layer 2 of 3).
#
#Owns: EKS control plane + node group + addons + IRSA roles.
#Reads foundation outputs (VPC, subnets, SGs).

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
    Stack       = "cluster"
  }

  #Order-api Secrets Manager scoping (mirrors the legacy root logic).
  order_api_secret_arns = compact([
    local.database_secret_arn_pattern,
    var.order_api_api_key_secret_arn != "" ? var.order_api_api_key_secret_arn : "",
  ])
}

#Wires the EKS module into this stack.
module "eks" {
  source = "../../modules/eks"

  permissions_boundary_arn = local.permissions_boundary_arn

  name_prefix  = local.name_prefix
  environment  = var.environment
  cluster_name = local.eks_cluster_name

  private_subnet_ids = local.private_subnet_ids
  public_subnet_ids  = local.public_subnet_ids
  node_sg_id         = local.node_sg_id

  kubernetes_version = var.eks_kubernetes_version

  node_instance_types = var.eks_node_instance_types
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size
  node_desired_size   = var.eks_node_desired_size
  node_capacity_type  = var.eks_node_capacity_type

  order_api_namespace       = var.order_api_namespace
  order_api_service_account = var.order_api_service_account
  order_api_secret_arns     = local.order_api_secret_arns

  endpoint_private_access      = var.eks_endpoint_private_access
  endpoint_public_access       = var.eks_endpoint_public_access
  endpoint_public_access_cidrs = var.eks_endpoint_public_access_cidrs

  tags = local.common_tags
}
