'use strict';

const {
  CloudWatchClient,
  GetMetricDataCommand,
  PutMetricDataCommand,
} = require('@aws-sdk/client-cloudwatch');
const { EKSClient, DescribeClusterCommand, ListNodegroupsCommand } = require('@aws-sdk/client-eks');
const {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand,
  StartInstanceRefreshCommand,
} = require('@aws-sdk/client-auto-scaling');
const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { SignatureV4 }           = require('@smithy/signature-v4');
const { HttpRequest }           = require('@smithy/protocol-http');
const { Sha256 }                = require('@aws-crypto/sha256-js');
const fetch = require('node-fetch');

// ── Environment ───────────────────────────────────────────────────────────────

const REGION                 = process.env.AWS_REGION             || 'us-east-1';
const ENVIRONMENT            = process.env.ENVIRONMENT            || 'dev';
const EKS_CLUSTER_NAME       = process.env.EKS_CLUSTER_NAME       || '';
const RDS_INSTANCE_ID        = process.env.RDS_INSTANCE_ID        || '';
const MIN_HEALTHY_PODS       = parseInt(process.env.MIN_HEALTHY_PODS       || '2', 10);
const MAX_SCALE_OUT_PODS     = parseInt(process.env.MAX_SCALE_OUT_PODS     || '10', 10);
const ROLLBACK_ON_ERROR_RATE = parseFloat(process.env.ROLLBACK_ON_ERROR_RATE || '5');
const ROLLBACK_SETTLE_MS     = parseInt(process.env.ROLLBACK_SETTLE_MS || '30000', 10); // wait before checking recovery
const MIN_ERRORS_FOR_ROLLBACK = 10; // fewer 5xx than this in 5 minutes is too few to judge a rate
const SNS_TOPIC_ARN          = process.env.SNS_TOPIC_ARN          || '';
const GITHUB_REPO            = process.env.GITHUB_REPO            || '';
const GITHUB_TOKEN_SECRET_ARN = process.env.GITHUB_TOKEN_SECRET_ARN || '';
const DRY_RUN                = process.env.DRY_RUN === 'true';
const APP_NAMESPACE          = process.env.APPLICATION_NAMESPACE  || 'cloudops';
const APP_NAME               = process.env.APPLICATION_NAME       || 'order-api';

// ── AWS clients — initialised once, reused across warm invocations ────────────

const cw  = new CloudWatchClient({ region: REGION });
const eks = new EKSClient({ region: REGION });
const asg = new AutoScalingClient({ region: REGION });
const rds = new RDSClient({ region: REGION });
const sm  = new SecretsManagerClient({ region: REGION });
const sns = new SNSClient({ region: REGION });

// ── Module-scope caches ───────────────────────────────────────────────────────

let cachedGitHubToken    = null;
let cachedClusterInfo    = null; // { endpoint, caData }

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), dryRun: DRY_RUN, ...data }));
}

async function getGitHubToken() {
  if (cachedGitHubToken) return cachedGitHubToken;
  if (!GITHUB_TOKEN_SECRET_ARN) throw new Error('GITHUB_TOKEN_SECRET_ARN is not set');
  const r = await sm.send(new GetSecretValueCommand({ SecretId: GITHUB_TOKEN_SECRET_ARN }));
  cachedGitHubToken = r.SecretString;
  return cachedGitHubToken;
}

async function getClusterInfo() {
  if (cachedClusterInfo) return cachedClusterInfo;
  const r = await eks.send(new DescribeClusterCommand({ name: EKS_CLUSTER_NAME }));
  cachedClusterInfo = {
    endpoint: r.cluster.endpoint,
    caData:   r.cluster.certificateAuthority.data,
  };
  return cachedClusterInfo;
}

async function getEKSBearerToken() {
  const credentials = await fromNodeProviderChain()();
  const signer = new SignatureV4({ credentials, region: REGION, service: 'sts', sha256: Sha256 });
  const request = new HttpRequest({
    method:   'GET',
    hostname: `sts.${REGION}.amazonaws.com`,
    path:     '/',
    query:    { Action: 'GetCallerIdentity', Version: '2011-06-15' },
    headers:  { host: `sts.${REGION}.amazonaws.com`, 'x-k8s-aws-id': EKS_CLUSTER_NAME },
  });
  const { hostname, path, query } = await signer.presign(request, { expiresIn: 60 });
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return 'k8s-aws-v1.' + Buffer.from(`https://${hostname}${path}?${qs}`).toString('base64url');
}

async function k8sGet(path) {
  const { endpoint } = await getClusterInfo();
  const token = await getEKSBearerToken();
  const res = await fetch(`${endpoint}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`K8s GET ${path} failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function k8sPatch(path, body, contentType = 'application/strategic-merge-patch+json') {
  const { endpoint } = await getClusterInfo();
  const token = await getEKSBearerToken();
  const res = await fetch(`${endpoint}${path}`, {
    method:  'PATCH',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': contentType,
      Accept:         'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`K8s PATCH ${path} failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function publishHealingMetric(action) {
  await cw.send(new PutMetricDataCommand({
    Namespace:  'CloudOps/SelfHealing',
    MetricData: [{
      MetricName: 'SelfHealingActions',
      Value:      1,
      Unit:       'Count',
      Timestamp:  new Date(),
      Dimensions: [
        { Name: 'Action',      Value: action },
        { Name: 'Environment', Value: ENVIRONMENT },
      ],
    }],
  }));
}

async function publishSummary(payload) {
  if (!SNS_TOPIC_ARN) return;
  await sns.send(new PublishCommand({
    TopicArn:  SNS_TOPIC_ARN,
    Subject:   `[SelfHealing] ${payload.action} — ${ENVIRONMENT}`,
    Message:   JSON.stringify(payload, null, 2),
    MessageAttributes: {
      action:    { DataType: 'String', StringValue: payload.action },
      result:    { DataType: 'String', StringValue: payload.result || 'unknown' },
    },
  }));
}

// Creates git hub issue.
async function createGitHubIssue({ title, body, labels = [] }) {
  const token = await getGitHubToken();
  log('info', { action: 'github_issue_create', title, labels });
  if (DRY_RUN) return { number: 0, html_url: 'DRY_RUN' };
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method:  'POST',
    headers: {
      Authorization:           `token ${token}`,
      Accept:                  'application/vnd.github+json',
      'Content-Type':          'application/json',
      'X-GitHub-Api-Version':  '2022-11-28',
    },
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ── CloudWatch metric query helper ────────────────────────────────────────────

async function getMetricLast5Min(namespace, metricName, statistic, dimensions) {
  const now   = new Date();
  const start = new Date(now - 5 * 60 * 1000);

  const r = await cw.send(new GetMetricDataCommand({
    StartTime: start,
    EndTime:   now,
    MetricDataQueries: [{
      Id:         'm1',
      MetricStat: {
        Metric: { Namespace: namespace, MetricName: metricName, Dimensions: dimensions },
        Period: 300,
        Stat:   statistic,
      },
      ReturnData: true,
    }],
  }));

  const vals = r.MetricDataResults?.[0]?.Values || [];
  return vals.length > 0 ? vals[0] : 0;
}

// ── Deployment rollback helpers ───────────────────────────────────────────────

// Real "kubectl rollout undo" equivalent: find the ReplicaSet for the previous
// revision and patch the Deployment's pod template to match. Patching
// `restartedAt` only restarts the same (bad) image — it is NOT a rollback.
async function findPreviousReplicaSet(deployment) {
  const currentRevision = parseInt(
    deployment.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '0',
    10
  );
  if (!currentRevision || currentRevision < 2) return null;

  const matchLabels = deployment.spec?.selector?.matchLabels || {};
  const labelSelector = Object.entries(matchLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  const rsList = await k8sGet(
    `/apis/apps/v1/namespaces/${APP_NAMESPACE}/replicasets` +
    (labelSelector ? `?labelSelector=${encodeURIComponent(labelSelector)}` : '')
  );

  const byRevision = (rsList.items || [])
    .map(rs => ({
      rs,
      revision: parseInt(rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '0', 10),
    }))
    .filter(x => x.revision > 0 && x.revision < currentRevision)
    .sort((a, b) => b.revision - a.revision);

  return byRevision[0]?.rs || null;
}

async function rolloutUndo(deployment) {
  const prevRs = await findPreviousReplicaSet(deployment);
  if (!prevRs) {
    throw new Error('No previous ReplicaSet found — deployment has no rollback history');
  }

  const prevTemplate = prevRs.spec?.template;
  if (!prevTemplate) {
    throw new Error(`Previous ReplicaSet ${prevRs.metadata?.name} has no pod template`);
  }

  // Strategic merge patch: replace the current pod template with the previous one.
  await k8sPatch(
    `/apis/apps/v1/namespaces/${APP_NAMESPACE}/deployments/${APP_NAME}`,
    { spec: { template: prevTemplate } }
  );

  const prevImage = prevTemplate.spec?.containers?.[0]?.image || 'unknown';
  return { previousRevision: prevRs.metadata?.annotations?.['deployment.kubernetes.io/revision'], previousImage: prevImage };
}

// ── Healing actions ───────────────────────────────────────────────────────────

// 1. order-api-high-error-rate → auto rollback
async function handleHighErrorRate(alarmName) {
  const start = Date.now();
  log('info', { action: 'rollback_check', alarmName });

  if (!EKS_CLUSTER_NAME) {
    log('warn', { action: 'rollback_skip', reason: 'EKS_CLUSTER_NAME not set' });
    return;
  }

  // Get current deployment (we need the full object for rollback — not just the image)
  let deployment = null;
  let currentImage = 'unknown';
  try {
    deployment = await k8sGet(`/apis/apps/v1/namespaces/${APP_NAMESPACE}/deployments/${APP_NAME}`);
    const containers = deployment.spec?.template?.spec?.containers || [];
    currentImage = containers[0]?.image || 'unknown';
  } catch (err) {
    log('warn', { action: 'rollback_get_deployment_failed', error: err.message });
  }

  // Check current error rate from CloudWatch
  const errorCount = await getMetricLast5Min(
    'AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', 'Sum',
    [{ Name: 'LoadBalancer', Value: process.env.ALB_ARN_SUFFIX || '' }]
  ).catch(() => 0);

  const totalRequests = await getMetricLast5Min(
    'AWS/ApplicationELB', 'RequestCount', 'Sum',
    [{ Name: 'LoadBalancer', Value: process.env.ALB_ARN_SUFFIX || '' }]
  ).catch(() => 0);

  const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
  log('info', { action: 'rollback_check', errorRate, errorCount, totalRequests, threshold: ROLLBACK_ON_ERROR_RATE });

  // Both must hold: the rate is over the threshold, and there are enough
  // errors for the rate to mean something. Either alone is not a reason to
  // roll back: 10 errors in a million requests is 0.001%, and 1 error in 2
  // requests is 50%.
  if (errorRate < ROLLBACK_ON_ERROR_RATE || errorCount < MIN_ERRORS_FOR_ROLLBACK) {
    log('info', { action: 'rollback_skip', reason: 'error rate or error count below threshold', errorRate, errorCount });
    return;
  }

  // Real rollback: patch deployment pod template to previous ReplicaSet's template.
  let rolledBackTo = null;
  if (!DRY_RUN) {
    if (!deployment) {
      log('error', { action: 'rollback_failed', error: 'deployment not available — cannot roll back' });
    } else {
      try {
        const result = await rolloutUndo(deployment);
        rolledBackTo = result;
        log('info', { action: 'rollback_triggered', currentImage, ...result });
      } catch (err) {
        log('error', { action: 'rollback_failed', error: err.message, currentImage });
      }
    }
  }

  // Wait for the rollback to settle, then check recovery
  if (!DRY_RUN) {
    await new Promise(r => setTimeout(r, ROLLBACK_SETTLE_MS));
    const postErrorCount = await getMetricLast5Min(
      'AWS/ApplicationELB', 'HTTPCode_Target_5XX_Count', 'Sum',
      [{ Name: 'LoadBalancer', Value: process.env.ALB_ARN_SUFFIX || '' }]
    ).catch(() => 0);

    if (postErrorCount >= 10) {
      log('warn', { action: 'rollback_not_recovering', postErrorCount, applying_scale_out: true });
      // Secondary action: scale out 2 more pods
      try {
        const hpa = await k8sGet(`/apis/autoscaling/v2/namespaces/${APP_NAMESPACE}/horizontalpodautoscalers/${APP_NAME}`);
        const currentMin = hpa.spec?.minReplicas || MIN_HEALTHY_PODS;
        const newMin = Math.min(currentMin + 2, MAX_SCALE_OUT_PODS);
        await k8sPatch(`/apis/autoscaling/v2/namespaces/${APP_NAMESPACE}/horizontalpodautoscalers/${APP_NAME}`, { spec: { minReplicas: newMin } });
        log('info', { action: 'secondary_scale_out', from: currentMin, to: newMin });
      } catch (err) {
        log('error', { action: 'secondary_scale_out_failed', error: err.message });
      }
    }
  }

  const payload = {
    action:         'rollback',
    alarm:          alarmName,
    reason:         'high_error_rate',
    previous_image: currentImage,
    error_rate:     errorRate,
    result:         DRY_RUN ? 'dry_run' : (rolledBackTo ? 'rollback_triggered' : 'rollback_failed'),
    duration_ms:    Date.now() - start,
    timestamp:      new Date().toISOString(),
  };
  log('info', payload);
  await publishHealingMetric('rollback');
  await publishSummary(payload);

  // Create GitHub incident issue (skip when token or repo is unconfigured)
  if (GITHUB_TOKEN_SECRET_ARN && GITHUB_REPO) {
    await createGitHubIssue({
      title:  `[INCIDENT] Auto-rollback triggered for ${APP_NAME} — ${ENVIRONMENT}`,
      body: [
        `## Auto-Rollback Triggered`,
        ``,
        `The self-healing controller detected a high error rate and triggered an automatic rollback.`,
        ``,
        `| Field | Value |`,
        `|---|---|`,
        `| **Environment** | ${ENVIRONMENT} |`,
        `| **Alarm** | \`${alarmName}\` |`,
        `| **Previous Image** | \`${currentImage}\` |`,
        `| **Error Rate** | ${errorRate.toFixed(2)}% |`,
        `| **Threshold** | ${ROLLBACK_ON_ERROR_RATE}% |`,
        `| **Timestamp** | ${payload.timestamp} |`,
        `| **Dry Run** | ${DRY_RUN} |`,
        ``,
        `## Investigation Steps`,
        ``,
        `1. Check deployment rollout status: \`kubectl rollout status deployment/${APP_NAME} -n ${APP_NAMESPACE}\``,
        `2. View rollout history: \`kubectl rollout history deployment/${APP_NAME} -n ${APP_NAMESPACE}\``,
        `3. Check pod logs: \`kubectl logs -n ${APP_NAMESPACE} -l app=${APP_NAME} --tail=100\``,
        `4. Review ALB access logs for 5xx patterns`,
        `5. Verify the rollback resolved the issue before re-deploying`,
        ``,
        `*This issue was created automatically by the CloudOps self-healing controller.*`,
      ].join('\n'),
      labels: ['incident', 'auto-remediation', APP_NAME],
    }).catch(err => log('warn', { action: 'github_issue_failed', error: err.message }));
  }
}

// 2. order-api-high-latency → scale out
async function handleHighLatency(alarmName) {
  const start = Date.now();
  log('info', { action: 'scale_out_check', trigger: 'high_latency', alarmName });

  if (!EKS_CLUSTER_NAME) {
    log('warn', { action: 'scale_out_skip', reason: 'EKS_CLUSTER_NAME not set' });
    return;
  }

  let fromReplicas = MIN_HEALTHY_PODS;
  let toReplicas   = MIN_HEALTHY_PODS;

  if (!DRY_RUN) {
    try {
      const hpa = await k8sGet(`/apis/autoscaling/v2/namespaces/${APP_NAMESPACE}/horizontalpodautoscalers/${APP_NAME}`);
      fromReplicas = hpa.spec?.minReplicas || MIN_HEALTHY_PODS;
      toReplicas   = Math.min(fromReplicas + 2, MAX_SCALE_OUT_PODS);
      await k8sPatch(`/apis/autoscaling/v2/namespaces/${APP_NAMESPACE}/horizontalpodautoscalers/${APP_NAME}`, { spec: { minReplicas: toReplicas } });
      log('info', { action: 'scale_out_complete', from: fromReplicas, to: toReplicas });
    } catch (err) {
      log('error', { action: 'scale_out_failed', error: err.message });
    }
  }

  const payload = {
    action:       'scale_out',
    alarm:        alarmName,
    trigger:      'high_latency',
    from_replicas: fromReplicas,
    to_replicas:  toReplicas,
    result:       DRY_RUN ? 'dry_run' : 'hpa_patched',
    note:         'Scale-in scheduler will reset minReplicas in 30 minutes',
    duration_ms:  Date.now() - start,
    timestamp:    new Date().toISOString(),
  };
  log('info', payload);
  await publishHealingMetric('scale_out');
  await publishSummary(payload);
}

// 3. order-api-pod-count-low → ensure minimum pods
async function handlePodCountLow(alarmName) {
  const start = Date.now();
  log('info', { action: 'ensure_minimum_pods_start', alarmName });

  if (!EKS_CLUSTER_NAME) {
    log('warn', { action: 'ensure_minimum_pods_skip', reason: 'EKS_CLUSTER_NAME not set' });
    return;
  }

  let currentPods    = 0;
  let nodeCap        = false;
  let hpaFunctioning = true;

  if (!DRY_RUN) {
    try {
      const hpa = await k8sGet(`/apis/autoscaling/v2/namespaces/${APP_NAMESPACE}/horizontalpodautoscalers/${APP_NAME}`);
      const desiredReplicas  = hpa.status?.desiredReplicas  || 0;
      const currentReplicas  = hpa.status?.currentReplicas  || 0;
      currentPods = currentReplicas;
      hpaFunctioning = desiredReplicas > 0 && Math.abs(desiredReplicas - currentReplicas) <= 1;

      if (!hpaFunctioning) {
        // Directly patch deployment replicas
        await k8sPatch(`/apis/apps/v1/namespaces/${APP_NAMESPACE}/deployments/${APP_NAME}`, {
          spec: { replicas: MIN_HEALTHY_PODS },
        });
        log('info', { action: 'direct_replica_patch', target: MIN_HEALTHY_PODS });
      }
    } catch (err) {
      log('error', { action: 'ensure_minimum_pods_k8s_failed', error: err.message });
    }

    // Check node capacity
    try {
      const nodes = await k8sGet('/api/v1/nodes');
      const nodeItems   = nodes.items || [];
      const notReady    = nodeItems.filter(n => {
        const conditions = n.status?.conditions || [];
        return conditions.some(c => c.type === 'Ready' && c.status !== 'True');
      });
      if (notReady.length > 0) {
        nodeCap = true;
        log('warn', { action: 'node_capacity_issue_detected', notReadyCount: notReady.length });
        // Trigger node group scale out
        await triggerNodeGroupScaleOut();
      }
    } catch (err) {
      log('warn', { action: 'node_capacity_check_failed', error: err.message });
    }
  }

  const payload = {
    action:              'ensure_minimum_pods',
    alarm:               alarmName,
    current_pods:        currentPods,
    target_pods:         MIN_HEALTHY_PODS,
    node_capacity_issue: nodeCap,
    hpa_functioning:     hpaFunctioning,
    result:              DRY_RUN ? 'dry_run' : 'patched',
    duration_ms:         Date.now() - start,
    timestamp:           new Date().toISOString(),
  };
  log('info', payload);
  await publishHealingMetric('ensure_minimum_pods');
  await publishSummary(payload);
}

async function triggerNodeGroupScaleOut() {
  try {
    const ngs = await eks.send(new ListNodegroupsCommand({ clusterName: EKS_CLUSTER_NAME }));
    if (!ngs.nodegroups?.length) return;
    const ngName = ngs.nodegroups[0];

    const asgs = await asg.send(new DescribeAutoScalingGroupsCommand({
      Filters: [{ Name: 'tag:eks:nodegroup-name', Values: [ngName] }],
    }));
    const group = asgs.AutoScalingGroups?.[0];
    if (!group) return;

    const newDesired = Math.min(group.DesiredCapacity + 1, group.MaxSize);
    if (newDesired > group.DesiredCapacity) {
      await asg.send(new UpdateAutoScalingGroupCommand({
        AutoScalingGroupName: group.AutoScalingGroupName,
        DesiredCapacity:      newDesired,
      }));
      log('info', { action: 'node_group_scale_out', from: group.DesiredCapacity, to: newDesired });
    }
  } catch (err) {
    log('error', { action: 'node_group_scale_out_failed', error: err.message });
  }
}

// 4. rds-high-connections → connection pool alert (no auto-remediation)
async function handleRDSHighConnections(alarmName) {
  const start = Date.now();
  log('info', { action: 'rds_connection_alert', alarmName });

  // Get current connection count
  const connections = await getMetricLast5Min(
    'AWS/RDS', 'DatabaseConnections', 'Average',
    [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }]
  ).catch(() => 0);

  // Get max_connections from RDS — we can't query parameter group inline, use heuristic
  const dbInfo = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: RDS_INSTANCE_ID }))
    .catch(() => null);
  const instanceClass = dbInfo?.DBInstances?.[0]?.DBInstanceClass || 'unknown';

  const payload = {
    action:          'rds_connection_alert',
    alarm:           alarmName,
    current_connections: connections,
    instance_class:  instanceClass,
    recommendation:  'Review application connection pooling settings (PgBouncer recommended). Do NOT auto-remediate — connection spikes require human investigation.',
    result:          'alert_published',
    duration_ms:     Date.now() - start,
    timestamp:       new Date().toISOString(),
  };
  log('warn', payload);
  await publishHealingMetric('rds_connection_alert');
  await publishSummary(payload);
}

// 5. rds-high-cpu → read replica recommendation
async function handleRDSHighCPU(alarmName) {
  const start = Date.now();
  log('info', { action: 'rds_cpu_recommendation', alarmName });

  const cpuUtilization = await getMetricLast5Min(
    'AWS/RDS', 'CPUUtilization', 'Average',
    [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }]
  ).catch(() => 0);

  // Check if read replica already exists
  const dbInfo = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: RDS_INSTANCE_ID }))
    .catch(() => null);
  const replicaIds = dbInfo?.DBInstances?.[0]?.ReadReplicaDBInstanceIdentifiers || [];
  const hasReplica = replicaIds.length > 0;

  let issueUrl = null;
  if (!hasReplica && GITHUB_TOKEN_SECRET_ARN && GITHUB_REPO) {
    try {
      const issue = await createGitHubIssue({
        title:  `[ACTION REQUIRED] RDS CPU high — consider enabling read replica (${ENVIRONMENT})`,
        body: [
          `## RDS High CPU Alert`,
          ``,
          `| Field | Value |`,
          `|---|---|`,
          `| **DB Instance** | \`${RDS_INSTANCE_ID}\` |`,
          `| **CPU Utilization** | ${cpuUtilization.toFixed(1)}% |`,
          `| **Read Replicas** | None |`,
          `| **Environment** | ${ENVIRONMENT} |`,
          ``,
          `## Recommendation`,
          ``,
          `Enable a read replica to offload read traffic:`,
          `\`\`\``,
          `# In terraform.tfvars:`,
          `database_create_read_replica = true`,
          `\`\`\``,
          ``,
          `Then route read-only queries to the replica endpoint. Review application`,
          `code for queries that can use the replica (reporting, analytics, dashboards).`,
          ``,
          `*Created automatically by CloudOps self-healing controller.*`,
        ].join('\n'),
        labels: ['action-required', 'rds', 'performance'],
      });
      issueUrl = issue.html_url;
    } catch (err) {
      log('warn', { action: 'github_issue_failed', error: err.message });
    }
  }

  const payload = {
    action:           'read_replica_recommendation',
    alarm:            alarmName,
    cpu_percent:      cpuUtilization,
    has_replica:      hasReplica,
    recommendation:   hasReplica ? 'replica_exists_route_read_traffic' : 'create_read_replica',
    github_issue_url: issueUrl,
    result:           'recommendation_published',
    duration_ms:      Date.now() - start,
    timestamp:        new Date().toISOString(),
  };
  log('info', payload);
  await publishHealingMetric('rds_cpu_recommendation');
  await publishSummary(payload);
}

// 6. rds-low-storage → storage exhaustion forecast
async function handleRDSLowStorage(alarmName) {
  const start = Date.now();
  log('info', { action: 'rds_storage_alert', alarmName });

  const now        = new Date();
  const sevenAgo   = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // Current storage
  const currentStorage = await getMetricLast5Min(
    'AWS/RDS', 'FreeStorageSpace', 'Average',
    [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }]
  ).catch(() => 0);

  // 7-day-ago storage
  const r7d = await cw.send(new GetMetricDataCommand({
    StartTime: sevenAgo,
    EndTime:   new Date(sevenAgo.getTime() + 5 * 60 * 1000),
    MetricDataQueries: [{
      Id: 'm1',
      MetricStat: {
        Metric: {
          Namespace:  'AWS/RDS',
          MetricName: 'FreeStorageSpace',
          Dimensions: [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }],
        },
        Period: 300,
        Stat:   'Average',
      },
      ReturnData: true,
    }],
  })).catch(() => null);

  const storage7dAgo = r7d?.MetricDataResults?.[0]?.Values?.[0] || currentStorage;
  const consumedPer7d = storage7dAgo - currentStorage; // bytes consumed in 7 days
  const daysUntilFull = consumedPer7d > 0 ? (currentStorage / (consumedPer7d / 7)) : Infinity;

  let severity = 'INFO';
  if (daysUntilFull < 7)  severity = 'CRITICAL';
  else if (daysUntilFull < 30) severity = 'WARNING';

  const currentGB = (currentStorage / 1073741824).toFixed(2);
  const daysStr   = isFinite(daysUntilFull) ? daysUntilFull.toFixed(1) : 'N/A';

  const payload = {
    action:            'rds_storage_alert',
    alarm:             alarmName,
    severity,
    current_free_gb:   currentGB,
    days_until_full:   daysStr,
    note:              'RDS autoscaling should handle storage growth. Alert if not progressing.',
    result:            'alert_published',
    duration_ms:       Date.now() - start,
    timestamp:         new Date().toISOString(),
  };
  log(severity === 'CRITICAL' ? 'error' : 'warn', payload);
  await publishHealingMetric('rds_storage_alert');
  await publishSummary(payload);
}

// 7. eks-node-not-ready → cordon + drain + instance refresh
async function handleNodeNotReady(alarmName) {
  const start = Date.now();
  log('info', { action: 'node_replacement_start', alarmName });

  if (!EKS_CLUSTER_NAME) {
    log('warn', { action: 'node_replacement_skip', reason: 'EKS_CLUSTER_NAME not set' });
    return;
  }

  const notReadyNodes = [];
  const affectedNodeGroups = new Set(); // node groups that own a NotReady node

  if (!DRY_RUN) {
    try {
      const nodes    = await k8sGet('/api/v1/nodes');
      const allNodes = nodes.items || [];

      for (const node of allNodes) {
        const conditions = node.status?.conditions || [];
        const ready      = conditions.find(c => c.type === 'Ready');
        if (ready && ready.status !== 'True') {
          const nodeName = node.metadata?.name;
          notReadyNodes.push(nodeName);
          const nodeGroup = node.metadata?.labels?.['eks.amazonaws.com/nodegroup'];
          if (nodeGroup) affectedNodeGroups.add(nodeGroup);

          // Cordon: mark unschedulable
          await k8sPatch(`/api/v1/nodes/${nodeName}`, { spec: { unschedulable: true } });
          log('info', { action: 'node_cordoned', nodeName });

          // Evict pods from node (drain)
          const pods = await k8sGet(`/api/v1/namespaces/${APP_NAMESPACE}/pods?fieldSelector=spec.nodeName=${nodeName}`);
          for (const pod of (pods.items || [])) {
            const podName = pod.metadata?.name;
            const res = await fetch(
              `${(await getClusterInfo()).endpoint}/api/v1/namespaces/${APP_NAMESPACE}/pods/${podName}/eviction`,
              {
                method:  'POST',
                headers: {
                  Authorization:  `Bearer ${await getEKSBearerToken()}`,
                  'Content-Type': 'application/json',
                  Accept:         'application/json',
                },
                body: JSON.stringify({ apiVersion: 'policy/v1', kind: 'Eviction', metadata: { name: podName, namespace: APP_NAMESPACE } }),
              }
            );
            if (!res.ok && res.status !== 429) {
              log('warn', { action: 'pod_eviction_failed', podName, status: res.status });
            } else {
              log('info', { action: 'pod_evicted', podName });
            }
          }
        }
      }
    } catch (err) {
      log('error', { action: 'node_replacement_k8s_failed', error: err.message });
    }

    // Replace the NotReady nodes: an instance refresh of each node group that
    // owns one, and only those. Refreshing every group would replace healthy
    // nodes too. A node without the EKS node-group label is reported, not
    // refreshed.
    if (affectedNodeGroups.size > 0) {
      try {
        for (const ngName of affectedNodeGroups) {
          const asgs = await asg.send(new DescribeAutoScalingGroupsCommand({
            Filters: [{ Name: 'tag:eks:nodegroup-name', Values: [ngName] }],
          }));
          const group = asgs.AutoScalingGroups?.[0];
          if (group) {
            await asg.send(new StartInstanceRefreshCommand({
              AutoScalingGroupName: group.AutoScalingGroupName,
              Strategy:             'Rolling',
              Preferences:          { MinHealthyPercentage: 50, InstanceWarmup: 120 },
            }));
            log('info', { action: 'instance_refresh_started', asg: group.AutoScalingGroupName });
          }
        }
      } catch (err) {
        log('error', { action: 'instance_refresh_failed', error: err.message });
      }
    }
  }

  const payload = {
    action:       'node_replacement',
    alarm:        alarmName,
    not_ready_nodes: notReadyNodes,
    result:       DRY_RUN ? 'dry_run' : (notReadyNodes.length > 0 ? 'cordon_drain_refresh' : 'no_notready_nodes'),
    duration_ms:  Date.now() - start,
    timestamp:    new Date().toISOString(),
  };
  log('info', payload);
  await publishHealingMetric('node_replacement');
  await publishSummary(payload);
}

// ── EventBridge pod failure events (EKS, not alarm-based) ────────────────────

async function handlePodFailureEvent(detail) {
  const reason    = detail.reason || '';
  const namespace = detail.namespace || APP_NAMESPACE;
  const podName   = detail.podName || '';

  log('warn', { action: 'pod_failure_event', reason, namespace, podName });

  // OOMKilled → scale out
  if (reason === 'OOMKilled') {
    await handleHighLatency(`eventbridge-oom-${podName}`);
    return;
  }

  // FailedScheduling or CrashLoopBackOff → ensure minimum pods
  if (['FailedScheduling', 'BackOff', 'CrashLoopBackOff'].includes(reason)) {
    await handlePodCountLow(`eventbridge-${reason}-${podName}`);
  }
}

// ── Main alarm router ─────────────────────────────────────────────────────────

function routeAlarm(alarmName) {
  if (alarmName.includes('order-api-high-error-rate')) return handleHighErrorRate(alarmName);
  if (alarmName.includes('order-api-high-latency'))    return handleHighLatency(alarmName);
  if (alarmName.includes('order-api-pod-count-low'))   return handlePodCountLow(alarmName);
  if (alarmName.includes('rds-high-connections'))      return handleRDSHighConnections(alarmName);
  if (alarmName.includes('rds-high-cpu'))              return handleRDSHighCPU(alarmName);
  if (alarmName.includes('rds-low-storage'))           return handleRDSLowStorage(alarmName);
  if (alarmName.includes('eks-node-not-ready'))        return handleNodeNotReady(alarmName);
  return Promise.resolve();
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler(event) {
  log('info', { msg: 'Self-healing controller invoked', source: event.source, recordCount: event.Records?.length || 0 });

  // EventBridge path (EKS pod failure events)
  if (event.source === 'aws.eks' && event['detail-type'] === 'EKS Pod State Change') {
    await handlePodFailureEvent(event.detail || {});
    return { statusCode: 200, source: 'eventbridge' };
  }

  // SNS path (CloudWatch Alarm notifications)
  const records = event.Records || [];
  const results = await Promise.allSettled(
    records.map(async (record) => {
      let message;
      try {
        message = JSON.parse(record.Sns?.Message || '{}');
      } catch (err) {
        log('error', { msg: 'Failed to parse SNS message', error: err.message });
        return;
      }

      const alarmName  = message.AlarmName  || '';
      const alarmState = message.NewStateValue || '';

      log('info', { msg: 'Processing alarm', alarmName, alarmState });

      // Only act on ALARM state; OK state is informational
      if (alarmState !== 'ALARM') {
        log('info', { msg: 'Skipping non-ALARM state', alarmName, alarmState });
        return;
      }

      await routeAlarm(alarmName);
    })
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    failures.forEach(f => log('error', { msg: 'Record failed', error: f.reason?.message }));
  }

  log('info', { msg: 'Self-healing complete', total: records.length, failures: failures.length });
  return { statusCode: 200, processed: records.length, failures: failures.length };
};
