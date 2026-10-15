data "aws_caller_identity" "current" {}

#ServiceAccount created separately so Helm can reference it with serviceAccount.create=false.
#The IRSA annotation links it to the IAM role in iam.tf.
resource "kubernetes_service_account" "lb_controller" {
  metadata {
    name      = "aws-load-balancer-controller"
    namespace = "kube-system"

    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.lb_controller.arn
    }

    labels = {
      "app.kubernetes.io/name"      = "aws-load-balancer-controller"
      "app.kubernetes.io/component" = "controller"
    }
  }
}

#AWS Load Balancer Controller — watches Ingress/Service resources and provisions ALBs/NLBs.
#Chart version is pinned (closes backlog #29 — supply-chain reproducibility).
#Bumping requires a coordinated test of LBC behavior + matching app image tag.
resource "helm_release" "lb_controller" {
  name            = "aws-load-balancer-controller"
  repository      = "https://aws.github.io/eks-charts"
  chart           = "aws-load-balancer-controller"
  version         = "1.8.4"
  namespace       = "kube-system"
  timeout         = 600
  cleanup_on_fail = true

  #Pull the image through the ECR pull-through cache (prefix: ecr-public) so
  #nodes in private subnets don't need a NAT gateway to reach public.ecr.aws.
  set {
    name  = "image.repository"
    value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com/ecr-public/eks/aws-load-balancer-controller"
  }

  set {
    name  = "clusterName"
    value = var.cluster_name
  }

  set {
    name  = "region"
    value = var.region
  }

  set {
    name  = "vpcId"
    value = var.vpc_id
  }

  set {
    name  = "serviceAccount.create"
    value = "false"
  }

  set {
    name  = "serviceAccount.name"
    value = kubernetes_service_account.lb_controller.metadata[0].name
  }

  depends_on = [kubernetes_service_account.lb_controller]
}
