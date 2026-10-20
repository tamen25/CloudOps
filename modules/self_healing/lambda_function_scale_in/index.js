// This file contains index logic for self healing lambda function scale in.
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
const K8S_NAME        = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/; // DNS-1123 label

const eks = new EKSClient({ region: REGION });
const cw  = new CloudWatchClient({ region: REGION });

// Logs the requested work.
function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), dryRun: DRY_RUN, ...data }));
}

// Gets eksbearer token.
async function getEKSBearerToken(clusterName) {
  const credentials = await fromNodeProviderChain()();
  const signer      = new SignatureV4({ credentials, region: REGION, service: 'sts', sha256: Sha256 });
  const request = new HttpRequest({
    method:   'GET',
    hostname: `sts.${REGION}.amazonaws.com`,
    path:     '/',
    query:    { Action: 'GetCallerIdentity', Version: '2011-06-15' },
    headers:  { host: `sts.${REGION}.amazonaws.com`, 'x-k8s-aws-id': clusterName },
  });
  const { hostname, path, query } = await signer.presign(request, { expiresIn: 60 });
  const qs = Object.entries(query).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  return 'k8s-aws-v1.' + Buffer.from('https://' + hostname + path + '?' + qs).toString('base64url');
}

exports.handler = async function handler(event) {
  const namespace   = event.namespace   || 'cloudops';
  const hpaName     = event.hpaName     || 'order-api';
  const targetMin   = event.targetMin   ?? BASELINE_PODS;

  // The event names what to patch, and the names go into the API URL: only
  // Kubernetes object names (so "../x" cannot reach another object), and a
  // minimum of at least one pod (0 would scale the service away).
  if (!K8S_NAME.test(namespace) || !K8S_NAME.test(hpaName)) {
    throw new Error(`invalid namespace or HPA name: ${JSON.stringify({ namespace, hpaName })}`);
  }
  if (!Number.isInteger(targetMin) || targetMin < 1) {
    throw new Error(`targetMin must be a positive integer, got ${JSON.stringify(targetMin)}`);
  }

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
