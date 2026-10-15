#This file defines IAM settings for CloudOps.
#Cluster role — allows EKS service to manage AWS resources on behalf of the cluster
resource "aws_iam_role" "eks_cluster" {
  name                 = "${local.name}-eks-cluster-role"
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

#Creates the AWS IAM role policy attachment resource named EKS cluster policy.
resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

#Node role — attached to EC2 instances in the node group via instance profile
resource "aws_iam_role" "eks_node" {
  name                 = "${local.name}-eks-node-role"
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

#Creates the AWS IAM role policy attachment resource named EKS worker node policy.
resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

#Creates the AWS IAM role policy attachment resource named EKS cni policy.
resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

#Creates the AWS IAM role policy attachment resource named EKS ECR readonly.
resource "aws_iam_role_policy_attachment" "eks_ecr_readonly" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

#Creates the AWS IAM role policy attachment resource named cloudwatch agent.
resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.eks_node.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

#Allow nodes to trigger ECR pull-through cache for public.ecr.aws images.
#Without this, the first pull of a cached image fails with AccessDenied.
resource "aws_iam_role_policy" "ecr_pull_through_cache" {
  name = "${local.name}-ecr-pull-through-cache"
  role = aws_iam_role.eks_node.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ecr:BatchImportUpstreamImage",
        "ecr:CreateRepository",
      ]
      Resource = "*"
    }]
  })
}
