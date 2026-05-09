#This file defines provider settings for CloudOps.
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

  #Partial S3 backend. Bucket AND key are intentionally NOT set here so the
  #same code works for any fork and any environment. Pass both at init time:
  #terraform init \
  #-backend-config="bucket=<your bucket>" \
  #-backend-config="key=<env>/terraform.tfstate"
  #scripts/tf-init.sh does this automatically: bucket from
  #bootstrap_bucket_name, key derived from `environment` in terraform.tfvars
  #(e.g. environment=dev → dev/terraform.tfstate). Override with STATE_KEY=...
  backend "s3" {
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

#Configures the AWS provider.
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

#Helm and Kubernetes providers require the EKS cluster to exist.
#Deploy order: enable_eks=true first, then enable_ingress=true on a second apply.
data "aws_eks_cluster" "this" {
  count = var.enable_eks && (var.enable_ingress || var.enable_observability) ? 1 : 0
  name  = local.eks_cluster_name
}

#Reads the AWS EKS cluster auth data source named this.
data "aws_eks_cluster_auth" "this" {
  count = var.enable_eks && (var.enable_ingress || var.enable_observability) ? 1 : 0
  name  = local.eks_cluster_name
}

#Configures the helm provider.
provider "helm" {
  kubernetes {
    host                   = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster.this[0].endpoint : "https://localhost"
    cluster_ca_certificate = var.enable_eks && (var.enable_ingress || var.enable_observability) ? base64decode(data.aws_eks_cluster.this[0].certificate_authority[0].data) : ""
    token                  = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster_auth.this[0].token : ""
  }
}

#Configures the kubernetes provider.
provider "kubernetes" {
  host                   = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster.this[0].endpoint : "https://localhost"
  cluster_ca_certificate = var.enable_eks && (var.enable_ingress || var.enable_observability) ? base64decode(data.aws_eks_cluster.this[0].certificate_authority[0].data) : ""
  token                  = var.enable_eks && (var.enable_ingress || var.enable_observability) ? data.aws_eks_cluster_auth.this[0].token : ""
}
