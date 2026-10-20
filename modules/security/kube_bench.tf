#kube-bench: the CIS Amazon EKS Benchmark, daily.
#
#CronJob (3 am UTC) -> init container: kube-bench, report to an emptyDir
#                   -> main container: aws lambda invoke with the report
#                   -> kube_bench_processor Lambda -> DynamoDB + CloudWatch
#
#kube-bench reads the node it runs on: kubelet arguments through the host's
#process table (hostPID) and its config files through read-only host mounts,
#as root. Without those it reads its own container and the node checks
#measure nothing. Running as root needs an exemption from Gatekeeper's
#no-root constraint, so the job has a namespace of its own and only that
#namespace is exempt (gatekeeper_policies.tf). It is not privileged.
#
#Each run covers the node the pod lands on, not every node.
#
#Images are pinned by digest. The main container is the AWS CLI; it signs
#the invoke with the pod's IRSA role. Nothing is installed at run time.

locals {
  kube_bench_namespace = "kube-bench"
}

#── Namespace ─────────────────────────────────────────────────────────────────

resource "kubernetes_namespace" "kube_bench" {
  metadata {
    name = local.kube_bench_namespace
    labels = {
      managed-by = "terraform"
    }
  }
}

moved {
  from = kubernetes_namespace.security
  to   = kubernetes_namespace.kube_bench
}

#── RBAC ──────────────────────────────────────────────────────────────────────

resource "kubernetes_cluster_role" "kube_bench" {
  metadata {
    name = "kube-bench"
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  #Core API — nodes, pods, configmaps, namespaces, service accounts
  rule {
    api_groups = [""]
    resources  = ["nodes", "pods", "configmaps", "namespaces", "serviceaccounts", "secrets", "endpoints", "services", "persistentvolumes", "persistentvolumeclaims"]
    verbs      = ["get", "list"]
  }

  #Workload controllers
  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "daemonsets", "replicasets", "statefulsets"]
    verbs      = ["get", "list"]
  }

  #Batch jobs
  rule {
    api_groups = ["batch"]
    resources  = ["jobs", "cronjobs"]
    verbs      = ["get", "list"]
  }

  #RBAC objects — kube-bench audits role bindings and cluster admin usage
  rule {
    api_groups = ["rbac.authorization.k8s.io"]
    resources  = ["clusterroles", "clusterrolebindings", "roles", "rolebindings"]
    verbs      = ["get", "list"]
  }

  #Network policies and ingresses
  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["networkpolicies", "ingresses", "ingressclasses"]
    verbs      = ["get", "list"]
  }

  #Pod security policies (deprecated in 1.25 but still checked by CIS)
  rule {
    api_groups = ["policy"]
    resources  = ["podsecuritypolicies"]
    verbs      = ["get", "list"]
  }

  #Storage classes
  rule {
    api_groups = ["storage.k8s.io"]
    resources  = ["storageclasses"]
    verbs      = ["get", "list"]
  }
}

#Creates the kubernetes cluster role binding resource named kube bench.
resource "kubernetes_cluster_role_binding" "kube_bench" {
  metadata {
    name = "kube-bench"
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.kube_bench.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = "kube-bench"
    namespace = kubernetes_namespace.kube_bench.metadata[0].name
  }
}

#── IRSA — kube-bench pod IAM role ────────────────────────────────────────────
#The main container (AWS CLI) uses this role to invoke the
#kube_bench_processor Lambda. IRSA is the only credential path — no static keys.

data "aws_iam_policy_document" "kube_bench_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:${kubernetes_namespace.kube_bench.metadata[0].name}:kube-bench"]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

#Creates the AWS IAM role resource named kube bench.
resource "aws_iam_role" "kube_bench" {
  name                 = "${var.project_name}-kube-bench"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.kube_bench_assume_role.json
  description          = "IRSA role for the kube-bench CronJob pod — allows Lambda invoke"

  tags = var.tags
}

#Reads the AWS IAM policy document data source named kube bench pod permissions.
data "aws_iam_policy_document" "kube_bench_pod_permissions" {
  statement {
    sid    = "InvokeKubeBenchProcessor"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction",
    ]
    resources = [aws_lambda_function.kube_bench_processor.arn]
  }
}

#Creates the AWS IAM role policy resource named kube bench pod.
resource "aws_iam_role_policy" "kube_bench_pod" {
  name   = "${var.project_name}-kube-bench-pod"
  role   = aws_iam_role.kube_bench.id
  policy = data.aws_iam_policy_document.kube_bench_pod_permissions.json
}

#── ServiceAccount — annotated with IRSA role ARN ─────────────────────────────

resource "kubernetes_service_account" "kube_bench" {
  metadata {
    name      = "kube-bench"
    namespace = kubernetes_namespace.kube_bench.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.kube_bench.arn
    }
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

#── kube_bench_processor Lambda ───────────────────────────────────────────────

#Install Lambda dependencies BEFORE terraform apply via:
#./scripts/build-lambdas.sh
#Closes backlog #20.

data "archive_file" "kube_bench_processor" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/kube_bench_processor"
  output_path = "${path.module}/lambda_function/kube_bench_processor.zip"
}

#Creates the AWS cloudwatch log group resource named kube bench processor.
resource "aws_cloudwatch_log_group" "kube_bench_processor" {
  #checkov:skip=CKV_AWS_158:AWS managed encryption is acceptable - KMS CMK adds cost for log data
  name              = "/aws/lambda/${var.project_name}-kube-bench-processor"
  retention_in_days = 365

  tags = var.tags
}

#Reads the AWS IAM policy document data source named kube bench processor assume role.
data "aws_iam_policy_document" "kube_bench_processor_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

#Creates the AWS IAM role resource named kube bench processor.
resource "aws_iam_role" "kube_bench_processor" {
  name                 = "${var.project_name}-kube-bench-processor"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.kube_bench_processor_assume_role.json
  description          = "Execution role for the kube-bench processor Lambda"

  tags = var.tags
}

#Creates the AWS IAM role policy attachment resource named kube bench processor basic execution.
resource "aws_iam_role_policy_attachment" "kube_bench_processor_basic_execution" {
  role       = aws_iam_role.kube_bench_processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

#Reads the AWS IAM policy document data source named kube bench processor permissions.
data "aws_iam_policy_document" "kube_bench_processor_permissions" {
  statement {
    sid    = "DynamoDBFindings"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.security_findings.arn,
      "${aws_dynamodb_table.security_findings.arn}/index/*",
    ]
  }

  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudOps/Security"]
    }
  }
}

#Creates the AWS IAM role policy resource named kube bench processor permissions.
resource "aws_iam_role_policy" "kube_bench_processor_permissions" {
  name   = "${var.project_name}-kube-bench-processor-permissions"
  role   = aws_iam_role.kube_bench_processor.id
  policy = data.aws_iam_policy_document.kube_bench_processor_permissions.json
}

#Creates the AWS lambda function resource named kube bench processor.
resource "aws_lambda_function" "kube_bench_processor" {
  #checkov:skip=CKV_AWS_117:Lambda intentionally runs outside VPC - calls global AWS APIs (Cost Explorer, EKS, CloudWatch)
  #checkov:skip=CKV_AWS_173:No sensitive data in environment variables - values are resource names and ARNs only
  #checkov:skip=CKV_AWS_272:Code signing not implemented - out of scope for this project
  #checkov:skip=CKV_AWS_116:DLQ not implemented - Lambda errors are surfaced via CloudWatch alarms
  function_name = "${var.project_name}-kube-bench-processor"
  description   = "Processes kube-bench CIS benchmark output and stores findings in DynamoDB"

  filename         = data.archive_file.kube_bench_processor.output_path
  source_code_hash = data.archive_file.kube_bench_processor.output_base64sha256
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  role             = aws_iam_role.kube_bench_processor.arn

  timeout     = 120
  memory_size = 256

  reserved_concurrent_executions = 10

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      FINDINGS_TABLE                      = aws_dynamodb_table.security_findings.name
      ENVIRONMENT                         = var.environment
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.kube_bench_processor_basic_execution,
    aws_cloudwatch_log_group.kube_bench_processor,
    data.archive_file.kube_bench_processor,
  ]

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambda_function/kube_bench_processor/node_modules/.package-lock.json")
      error_message = "modules/security/lambda_function/kube_bench_processor/node_modules is missing — run ./scripts/build-lambdas.sh before terraform apply."
    }
  }

  tags = merge(var.tags, { Name = "${var.project_name}-kube-bench-processor" })
}

#── CronJob ───────────────────────────────────────────────────────────────────

resource "kubernetes_cron_job_v1" "kube_bench" {
  metadata {
    name      = "kube-bench"
    namespace = kubernetes_namespace.kube_bench.metadata[0].name
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  spec {
    schedule                      = "0 3 * * *"
    concurrency_policy            = "Forbid"
    failed_jobs_history_limit     = 3
    successful_jobs_history_limit = 3

    job_template {
      metadata {
        labels = { "app.kubernetes.io/name" = "kube-bench" }
      }

      spec {
        backoff_limit = 2

        template {
          metadata {
            labels = { "app.kubernetes.io/name" = "kube-bench" }
          }

          spec {
            restart_policy       = "Never"
            service_account_name = kubernetes_service_account.kube_bench.metadata[0].name
            host_pid             = true

            #kube-bench writes the report; a failed run fails the init
            #container, so a broken report never reaches the Lambda.
            init_container {
              name    = "kube-bench"
              image   = "aquasec/kube-bench:v0.16.0@sha256:75506f222d1eb6ce2a751a5533bdc0a3b54c898e2e49e7751d0ee22cfb862679"
              command = ["kube-bench"]
              args = [
                "run",
                "--targets", "node,policies,managedservices,controlplane",
                "--benchmark", "eks-1.8.0",
                "--json",
                "--outputfile", "/results/kube-bench-output.json",
              ]

              volume_mount {
                name       = "results"
                mount_path = "/results"
              }
              volume_mount {
                name       = "var-lib-kubelet"
                mount_path = "/var/lib/kubelet"
                read_only  = true
              }
              volume_mount {
                name       = "etc-systemd"
                mount_path = "/etc/systemd"
                read_only  = true
              }
              volume_mount {
                name       = "etc-kubernetes"
                mount_path = "/etc/kubernetes"
                read_only  = true
              }

              resources {
                requests = { cpu = "100m", memory = "128Mi" }
                limits   = { cpu = "500m", memory = "256Mi" }
              }

              #Root to read the node's files; not privileged, no added
              #capabilities, read-only root filesystem.
              security_context {
                run_as_user                = 0
                allow_privilege_escalation = false
                read_only_root_filesystem  = true
                capabilities {
                  drop = ["ALL"]
                }
              }
            }

            #Sends the report to the processor Lambda and fails the job if
            #the Lambda fails. The cluster name is the module's own input.
            container {
              name    = "processor"
              image   = "amazon/aws-cli:2.37.10@sha256:3dacc5db57c923c4223e949795f538ecf1f2212b2b7d5a028b47b97f91564c0d"
              command = ["/bin/sh", "-c"]
              args = [<<-SH
                set -eu
                {
                  printf '{"clusterName":"%s","kubeBenchOutput":' "$EKS_CLUSTER_NAME"
                  cat /results/kube-bench-output.json
                  printf '}'
                } > /work/payload.json
                err=$(aws lambda invoke --function-name "$LAMBDA_FUNCTION_NAME" \
                  --cli-binary-format raw-in-base64-out --payload fileb:///work/payload.json \
                  --query FunctionError --output text /work/response.json)
                cat /work/response.json; echo
                [ "$err" = "None" ]
              SH
              ]

              env {
                name  = "LAMBDA_FUNCTION_NAME"
                value = aws_lambda_function.kube_bench_processor.function_name
              }
              env {
                name  = "EKS_CLUSTER_NAME"
                value = var.eks_cluster_name
              }
              env {
                name  = "AWS_REGION"
                value = var.region
              }
              env {
                name  = "HOME"
                value = "/work"
              }

              volume_mount {
                name       = "results"
                mount_path = "/results"
                read_only  = true
              }
              volume_mount {
                name       = "work"
                mount_path = "/work"
              }

              resources {
                requests = { cpu = "50m", memory = "128Mi" }
                limits   = { cpu = "250m", memory = "256Mi" }
              }

              security_context {
                run_as_non_root            = true
                run_as_user                = 1000
                allow_privilege_escalation = false
                read_only_root_filesystem  = true
                capabilities {
                  drop = ["ALL"]
                }
              }
            }

            volume {
              name = "results"
              empty_dir {}
            }
            volume {
              name = "work"
              empty_dir {}
            }
            volume {
              name = "var-lib-kubelet"
              host_path {
                path = "/var/lib/kubelet"
              }
            }
            volume {
              name = "etc-systemd"
              host_path {
                path = "/etc/systemd"
              }
            }
            volume {
              name = "etc-kubernetes"
              host_path {
                path = "/etc/kubernetes"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [
    kubernetes_cluster_role_binding.kube_bench,
    aws_lambda_function.kube_bench_processor,
  ]
}
