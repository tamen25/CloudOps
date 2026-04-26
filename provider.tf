terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.15"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.33"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Partial S3 backend. Bucket is intentionally NOT set here so the same code
  # works for any fork. Pass it at init time:
  #   terraform init -backend-config="bucket=<your bucket>"
  # Workflows do this automatically by reading bootstrap_bucket_name from
  # terraform.tfvars (see scripts/tf-init.sh).
  backend "s3" {
    key          = "main/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Helm and Kubernetes providers require the EKS cluster to exist.
# Deploy order: enable_eks=true first, then enable_ingress=true on a second apply.
data "aws_eks_cluster" "this" {
  count = var.enable_eks && (var.enable_ingress || var.enable_observability) ? 1 : 0
  name  = local.eks_cluster_name
}

data "aws_eks_cluster_auth" "this" {
  count = var.enable_eks && (var.enable_ingress || var.enable_observability) ? 1 : 0
  name  = local.eks_cluster_name
}

provider "helm" {
  kubernetes {
    host                   = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster.this[0].endpoint : "https://localhost"
    cluster_ca_certificate = var.enable_eks && (var.enable_ingress || var.enable_observability) ? base64decode(data.aws_eks_cluster.this[0].certificate_authority[0].data) : ""
    token                  = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster_auth.this[0].token : ""
  }
}

provider "kubernetes" {
  host                   = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster.this[0].endpoint : "https://localhost"
  cluster_ca_certificate = var.enable_eks && (var.enable_ingress || var.enable_observability) ? base64decode(data.aws_eks_cluster.this[0].certificate_authority[0].data) : ""
  token                  = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster_auth.this[0].token : ""
}
