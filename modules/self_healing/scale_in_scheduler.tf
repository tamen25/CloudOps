# Self-Healing — Scale-In Scheduler
#
# A lightweight Lambda that resets the order-api HPA minReplicas back to its
# baseline after the self-healing controller temporarily scaled out.
#
# The scale-in Lambda is invoked by a one-time EventBridge rule created
# dynamically by the controller (30 minutes after a scale-out action).
# This file provisions the Lambda and its execution role so the controller
# can reference the function ARN when creating that transient rule.

locals {
  scale_in_src_dir = "${path.module}/lambda_function_scale_in"
  scale_in_zip     = "${path.module}/lambda_function_scale_in/scale_in_scheduler.zip"
}

# Inline the scale-in handler — it is tiny and has no npm dependencies.
resource "local_file" "scale_in_index" {
  filename = "${local.scale_in_src_dir}/index.js"
  content  = <<-JS
'use strict';

const { EKSClient, DescribeClusterCommand } = require('@aws-sdk/client-eks');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { SignatureV4 }           = require('@smithy/signature-v4');
const { HttpRequest }           = require('@smithy/protocol-http');
const { Sha256 }                = require('@aws-crypto/sha256-js');
const fetch = require('node-fetch');

const REGION          = process.env.AWS_REGION      || 'us-east-1';
const EKS_CLUSTER     = process.env.EKS_CLUSTER_NAME || '';
const BASELINE_PODS   = parseInt(process.env.BASELINE_MIN_PODS || '2', 10);
const ENVIRONMENT     = process.env.ENVIRONMENT      || 'dev';
const DRY_RUN         = process.env.DRY_RUN === 'true';

const eks = new EKSClient({ region: REGION });
const cw  = new CloudWatchClient({ region: REGION });

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), dryRun: DRY_RUN, ...data }));
}

async function getEKSBearerToken(clusterName) {
  const credentials = await fromNodeProviderChain()();
  const signer      = new SignatureV4({ credentials, region: REGION, service: 'sts', sha256: Sha256 });
  const request = new HttpRequest({
    method:   'GET',
    hostname: `sts.$${REGION}.amazonaws.com`,
    path:     '/',
    query:    { Action: 'GetCallerIdentity', Version: '2011-06-15' },
    headers:  { host: `sts.$${REGION}.amazonaws.com`, 'x-k8s-aws-id': clusterName },
  });
  const { hostname, path, query } = await signer.presign(request, { expiresIn: 60 });
  const qs = Object.entries(query).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return 'k8s-aws-v1.' + Buffer.from('https://' + hostname + path + '?' + qs).toString('base64url');
}

exports.handler = async function handler(event) {
  const namespace   = event.namespace   || 'cloudops';
  const hpaName     = event.hpaName     || 'order-api';
  const targetMin   = event.targetMin   || BASELINE_PODS;

  log('info', { action: 'scale_in_start', namespace, hpaName, targetMin });

  if (!EKS_CLUSTER) {
    log('warn', { action: 'scale_in_skip', reason: 'EKS_CLUSTER_NAME not set' });
    return;
  }

  const clusterInfo = await eks.send(new DescribeClusterCommand({ name: EKS_CLUSTER }));
  const endpoint    = clusterInfo.cluster.endpoint;
  const caData      = clusterInfo.cluster.certificateAuthority.data;
  if (!endpoint || !caData) {
    log('error', { action: 'scale_in_error', reason: 'missing cluster endpoint or CA' });
    return;
  }

  const token = await getEKSBearerToken(EKS_CLUSTER);
  const hpaUrl = endpoint + '/apis/autoscaling/v2/namespaces/' + namespace + '/horizontalpodautoscalers/' + hpaName;

  if (!DRY_RUN) {
    const patchRes = await fetch(hpaUrl, {
      method:  'PATCH',
      headers: {
        Authorization:  'Bearer ' + token,
        'Content-Type': 'application/strategic-merge-patch+json',
        Accept:         'application/json',
      },
      body: JSON.stringify({ spec: { minReplicas: targetMin } }),
    });
    if (!patchRes.ok) {
      const txt = await patchRes.text();
      throw new Error('K8s PATCH HPA failed ' + patchRes.status + ': ' + txt.slice(0, 200));
    }
    log('info', { action: 'scale_in_complete', namespace, hpaName, targetMin, result: 'hpa_patched' });
  } else {
    log('info', { action: 'scale_in_dry_run', namespace, hpaName, targetMin });
  }

  await cw.send(new PutMetricDataCommand({
    Namespace:  'CloudOps/SelfHealing',
    MetricData: [{
      MetricName: 'ScaleInActions',
      Value:      1,
      Unit:       'Count',
      Timestamp:  new Date(),
      Dimensions: [{ Name: 'Environment', Value: ENVIRONMENT }],
    }],
  }));
};
JS
}

resource "local_file" "scale_in_package" {
  filename = "${local.scale_in_src_dir}/package.json"
  content = jsonencode({
    name        = "scale-in-scheduler"
    version     = "1.0.0"
    description = "CloudOps self-healing scale-in scheduler — resets HPA minReplicas after a scale-out event"
    main        = "index.js"
    dependencies = {
      "@aws-sdk/client-eks"           = "^3.600.0"
      "@aws-sdk/client-cloudwatch"    = "^3.600.0"
      "@aws-sdk/credential-providers" = "^3.600.0"
      "@smithy/signature-v4"          = "^3.0.0"
      "@smithy/protocol-http"         = "^3.0.0"
      "@aws-crypto/sha256-js"         = "^5.0.0"
      "node-fetch"                    = "^2.7.0"
    }
  })
}

resource "null_resource" "scale_in_build" {
  triggers = {
    pkg_hash = sha256(local_file.scale_in_package.content)
  }

  provisioner "local-exec" {
    working_dir = local.scale_in_src_dir
    command     = "npm install --omit=dev --quiet"
  }

  depends_on = [local_file.scale_in_index, local_file.scale_in_package]
}

data "archive_file" "scale_in_scheduler" {
  type        = "zip"
  source_dir  = local.scale_in_src_dir
  output_path = local.scale_in_zip
  excludes    = ["*.zip"]

  depends_on = [null_resource.scale_in_build]
}

resource "aws_lambda_function" "scale_in_scheduler" {
  function_name    = "${var.project_name}-scale-in-scheduler"
  role             = aws_iam_role.scale_in_scheduler.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  timeout          = 60
  memory_size      = 128
  filename         = data.archive_file.scale_in_scheduler.output_path
  source_code_hash = data.archive_file.scale_in_scheduler.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT       = var.environment
      EKS_CLUSTER_NAME  = var.eks_cluster_name
      BASELINE_MIN_PODS = tostring(var.min_healthy_pods)
      DRY_RUN           = tostring(var.dry_run)
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "scale_in_scheduler" {
  name              = "/aws/lambda/${var.project_name}-scale-in-scheduler"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_lambda_permission" "eventbridge_invoke_scale_in" {
  statement_id  = "AllowEventBridgeScaleIn"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scale_in_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:${var.region}:${var.aws_account_id}:rule/${var.project_name}-scale-in-*"
}
