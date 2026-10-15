#vpc-cni — AWS VPC CNI plugin, assigns VPC IPs directly to pods.
#Network policy enforcement is enabled via configuration_values (closes
#backlog #26 — chose AWS VPC CNI over Cilium to avoid a CNI swap). With
#enableNetworkPolicy=true, the CNI runs an eBPF-based enforcer per node and
#honors standard kubernetes.io/v1 NetworkPolicy resources. Required CNI
#version: v1.14+ (the EKS-managed addon resolves a recent default).
resource "aws_eks_addon" "vpc_cni" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "vpc-cni"
  resolve_conflicts_on_update = "OVERWRITE"

  configuration_values = jsonencode({
    enableNetworkPolicy = "true"
  })

  depends_on = [aws_eks_node_group.main]

  tags = merge(local.common_tags, { Name = "${local.name}-addon-vpc-cni" })
}

#coredns — cluster DNS
resource "aws_eks_addon" "coredns" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "coredns"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]

  tags = merge(local.common_tags, { Name = "${local.name}-addon-coredns" })
}

#kube-proxy — maintains network rules on nodes
resource "aws_eks_addon" "kube_proxy" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "kube-proxy"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.main]

  tags = merge(local.common_tags, { Name = "${local.name}-addon-kube-proxy" })
}

#aws-ebs-csi-driver — enables PersistentVolume provisioning via EBS
resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name                = aws_eks_cluster.main.name
  addon_name                  = "aws-ebs-csi-driver"
  resolve_conflicts_on_update = "OVERWRITE"
  service_account_role_arn    = aws_iam_role.ebs_csi_driver.arn

  depends_on = [aws_eks_node_group.main]

  tags = merge(local.common_tags, { Name = "${local.name}-addon-ebs-csi" })
}
