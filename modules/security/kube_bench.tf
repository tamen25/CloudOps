# kube-bench CIS Kubernetes Benchmark — EKS daily runner
#
# Architecture:
#   CronJob (3 am UTC) ─► init container: kube-bench → /tmp/results/output.json
#                       ─► main container: Node.js dispatcher → Lambda invoke
#                       ─► kube_bench_processor Lambda → DynamoDB + CloudWatch
#
# The CronJob pod uses IRSA so the processor container can invoke the Lambda
# without any static credentials.  The ClusterRole gives kube-bench read-only
# access to the Kubernetes API resources needed for the EKS 1.4 benchmark.
#
# Note on privileges: EKS managed-node controls that require host-level file
# access (kubelet config files, etc.) will be reported as NOT_CHECKED when the
# pod runs without hostPID or privileged mode.  All API-checkable controls run
# normally.  This is the correct trade-off for clusters protected by OPA
# Gatekeeper's no-privileged policy.
#
# Pin the kube-bench image to an immutable digest before deploying to production:
#   docker pull aquasec/kube-bench:v0.8.0
#   docker inspect aquasec/kube-bench:v0.8.0 --format='{{index .RepoDigests 0}}'
# Then replace the image value below with aquasec/kube-bench@sha256:<digest>.

# ── Namespace ─────────────────────────────────────────────────────────────────

resource "kubernetes_namespace" "security" {
  metadata {
    name = "security"
    labels = {
      "kubernetes.io/metadata.name" = "security"
      managed-by                    = "terraform"
    }
  }
}

# ── RBAC ──────────────────────────────────────────────────────────────────────

resource "kubernetes_cluster_role" "kube_bench" {
  metadata {
    name = "kube-bench"
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  # Core API — nodes, pods, configmaps, namespaces, service accounts
  rule {
    api_groups = [""]
    resources  = ["nodes", "pods", "configmaps", "namespaces", "serviceaccounts", "secrets", "endpoints", "services", "persistentvolumes", "persistentvolumeclaims"]
    verbs      = ["get", "list"]
  }

  # Workload controllers
  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "daemonsets", "replicasets", "statefulsets"]
    verbs      = ["get", "list"]
  }

  # Batch jobs
  rule {
    api_groups = ["batch"]
    resources  = ["jobs", "cronjobs"]
    verbs      = ["get", "list"]
  }

  # RBAC objects — kube-bench audits role bindings and cluster admin usage
  rule {
    api_groups = ["rbac.authorization.k8s.io"]
    resources  = ["clusterroles", "clusterrolebindings", "roles", "rolebindings"]
    verbs      = ["get", "list"]
  }

  # Network policies and ingresses
  rule {
    api_groups = ["networking.k8s.io"]
    resources  = ["networkpolicies", "ingresses", "ingressclasses"]
    verbs      = ["get", "list"]
  }

  # Pod security policies (deprecated in 1.25 but still checked by CIS)
  rule {
    api_groups = ["policy"]
    resources  = ["podsecuritypolicies"]
    verbs      = ["get", "list"]
  }

  # Storage classes
  rule {
    api_groups = ["storage.k8s.io"]
    resources  = ["storageclasses"]
    verbs      = ["get", "list"]
  }
}

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
    namespace = kubernetes_namespace.security.metadata[0].name
  }
}

# ── IRSA — kube-bench pod IAM role ────────────────────────────────────────────
# The processor container (node:alpine) uses this role to invoke the
# kube_bench_processor Lambda. IRSA is the only credential path — no static keys.

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
      values   = ["system:serviceaccount:${kubernetes_namespace.security.metadata[0].name}:kube-bench"]
    }

    condition {
      test     = "StringEquals"
      variable = "${var.oidc_provider_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "kube_bench" {
  name               = "${var.project_name}-kube-bench"
  assume_role_policy = data.aws_iam_policy_document.kube_bench_assume_role.json
  description        = "IRSA role for the kube-bench CronJob pod — allows Lambda invoke"

  tags = var.tags
}

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

resource "aws_iam_role_policy" "kube_bench_pod" {
  name   = "${var.project_name}-kube-bench-pod"
  role   = aws_iam_role.kube_bench.id
  policy = data.aws_iam_policy_document.kube_bench_pod_permissions.json
}

# ── ServiceAccount — annotated with IRSA role ARN ─────────────────────────────

resource "kubernetes_service_account" "kube_bench" {
  metadata {
    name      = "kube-bench"
    namespace = kubernetes_namespace.security.metadata[0].name
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.kube_bench.arn
    }
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

# ── ConfigMap — dispatcher script for the main container ──────────────────────
# Runs inside node:22-alpine, reads kube-bench JSON output, invokes the Lambda.

resource "kubernetes_config_map" "kube_bench_script" {
  metadata {
    name      = "kube-bench-processor-script"
    namespace = kubernetes_namespace.security.metadata[0].name
  }

  data = {
    "process.js" = <<-JS
      'use strict';
      // Installed at pod startup via npm install --prefix /tmp/deps
      const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
      const fs = require('fs');

      const REGION        = process.env.AWS_REGION           || 'us-east-1';
      const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || '';
      const CLUSTER_NAME  = process.env.EKS_CLUSTER_NAME     || '';
      const OUTPUT_FILE   = '/tmp/results/kube-bench-output.json';

      function log(level, data) {
        console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
      }

      async function main() {
        log('info', { msg: 'kube-bench dispatcher starting', functionName: FUNCTION_NAME, clusterName: CLUSTER_NAME });

        if (!fs.existsSync(OUTPUT_FILE)) {
          log('error', { msg: 'kube-bench output file not found — init container may have failed', path: OUTPUT_FILE });
          process.exit(1);
        }

        let kubeBenchOutput;
        try {
          kubeBenchOutput = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        } catch (err) {
          log('error', { msg: 'Failed to parse kube-bench JSON output', error: err.message });
          process.exit(1);
        }

        const totals = kubeBenchOutput.Totals || {};
        log('info', { msg: 'kube-bench results loaded', totals });

        const client  = new LambdaClient({ region: REGION });
        const payload = Buffer.from(JSON.stringify({ kubeBenchOutput, clusterName: CLUSTER_NAME }));

        const response = await client.send(new InvokeCommand({
          FunctionName:   FUNCTION_NAME,
          InvocationType: 'RequestResponse',
          Payload:        payload,
        }));

        const responseBody = Buffer.from(response.Payload).toString('utf8');

        if (response.FunctionError) {
          log('error', { msg: 'Lambda invocation returned function error', error: responseBody.slice(0, 500) });
          process.exit(1);
        }

        const result = JSON.parse(responseBody);
        log('info', { msg: 'Processing complete', result });
      }

      main().catch(err => {
        console.error(JSON.stringify({ level: 'error', msg: 'Fatal error in kube-bench dispatcher', error: err.message }));
        process.exit(1);
      });
    JS
  }
}

# ── kube_bench_processor Lambda ───────────────────────────────────────────────

# Install Lambda dependencies BEFORE terraform apply via:
#   ./scripts/build-lambdas.sh
# Closes backlog #20.

data "archive_file" "kube_bench_processor" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/kube_bench_processor"
  output_path = "${path.module}/lambda_function/kube_bench_processor.zip"
}

resource "aws_cloudwatch_log_group" "kube_bench_processor" {
  #checkov:skip=CKV_AWS_158:AWS managed encryption is acceptable - KMS CMK adds cost for log data
  name              = "/aws/lambda/${var.project_name}-kube-bench-processor"
  retention_in_days = 365

  tags = var.tags
}

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

resource "aws_iam_role" "kube_bench_processor" {
  name               = "${var.project_name}-kube-bench-processor"
  assume_role_policy = data.aws_iam_policy_document.kube_bench_processor_assume_role.json
  description        = "Execution role for the kube-bench processor Lambda"

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "kube_bench_processor_basic_execution" {
  role       = aws_iam_role.kube_bench_processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

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

resource "aws_iam_role_policy" "kube_bench_processor_permissions" {
  name   = "${var.project_name}-kube-bench-processor-permissions"
  role   = aws_iam_role.kube_bench_processor.id
  policy = data.aws_iam_policy_document.kube_bench_processor_permissions.json
}

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

# ── CronJob ───────────────────────────────────────────────────────────────────

resource "kubernetes_cron_job_v1" "kube_bench" {
  metadata {
    name      = "kube-bench"
    namespace = kubernetes_namespace.security.metadata[0].name
    labels = {
      "app.kubernetes.io/name"       = "kube-bench"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  spec {
    # 3 am UTC daily
    schedule = "0 3 * * *"

    # If a previous job is still running at 3 am, skip the new run
    concurrency_policy = "Forbid"

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

            # ── Init container — runs kube-bench, saves JSON to shared volume ──
            # Image should be pinned to an immutable SHA256 digest in production.
            # Run: docker pull aquasec/kube-bench:v0.8.0 && docker inspect aquasec/kube-bench:v0.8.0 --format='{{index .RepoDigests 0}}'
            init_container {
              name  = "kube-bench"
              image = "aquasec/kube-bench:v0.8.0"

              # Run the EKS-1.4 benchmark; redirect JSON stdout to the shared volume
              command = ["/bin/sh", "-c"]
              args    = ["kube-bench run --benchmark eks-1.4 --json > /tmp/results/kube-bench-output.json 2>&1; echo \"Exit: $?\""]

              volume_mount {
                name       = "results"
                mount_path = "/tmp/results"
              }

              resources {
                requests = {
                  cpu    = "100m"
                  memory = "128Mi"
                }
                limits = {
                  cpu    = "500m"
                  memory = "256Mi"
                }
              }

              security_context {
                run_as_non_root = false
                run_as_user     = 0
              }
            }

            # ── Main container — Node.js dispatcher → Lambda invoke ────────────
            container {
              name  = "processor"
              image = "node:22-alpine"

              # Install @aws-sdk/client-lambda at runtime, then run the dispatcher
              command = ["/bin/sh", "-c"]
              args    = ["npm install --prefix /tmp/deps @aws-sdk/client-lambda@3 --no-fund --no-audit --quiet && NODE_PATH=/tmp/deps/node_modules node /scripts/process.js"]

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

              volume_mount {
                name       = "results"
                mount_path = "/tmp/results"
                read_only  = true
              }

              volume_mount {
                name       = "scripts"
                mount_path = "/scripts"
                read_only  = true
              }

              resources {
                requests = {
                  cpu    = "100m"
                  memory = "128Mi"
                }
                limits = {
                  cpu    = "500m"
                  memory = "256Mi"
                }
              }

              security_context {
                run_as_non_root            = true
                run_as_user                = 1000
                allow_privilege_escalation = false
                read_only_root_filesystem  = false
              }
            }

            # Shared emptyDir between init container and main container
            volume {
              name = "results"
              empty_dir {}
            }

            # ConfigMap containing the dispatcher Node.js script
            volume {
              name = "scripts"
              config_map {
                name = kubernetes_config_map.kube_bench_script.metadata[0].name
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
    kubernetes_config_map.kube_bench_script,
  ]
}
