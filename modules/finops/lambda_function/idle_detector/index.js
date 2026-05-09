// This file contains index logic for lambda function idle detector.
'use strict';

const {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  GetMetricDataCommand,
  PutMetricDataCommand,
} = require('@aws-sdk/client-cloudwatch');
const { RDSClient, DescribeDBInstancesCommand }                                       = require('@aws-sdk/client-rds');
const { EKSClient, ListNodegroupsCommand, DescribeNodegroupCommand }                  = require('@aws-sdk/client-eks');
const { DynamoDBClient }                                                              = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand }               = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand }                                                   = require('@aws-sdk/client-sns');

// ── Environment ───────────────────────────────────────────────────────────────

const REGION               = process.env.AWS_REGION            || 'us-east-1';
const ENVIRONMENT          = process.env.ENVIRONMENT           || 'dev';
const EKS_CLUSTER_NAME     = process.env.EKS_CLUSTER_NAME      || '';
const RDS_INSTANCE_ID      = process.env.RDS_INSTANCE_ID       || '';
const DYNAMODB_TABLE       = process.env.DYNAMODB_TABLE        || 'cloudops-cost-data';
const SNS_TOPIC_ARN        = process.env.SNS_TOPIC_ARN         || '';
const IDLE_CPU_THRESHOLD   = parseFloat(process.env.IDLE_CPU_THRESHOLD    || '10');
const IDLE_REQ_THRESHOLD   = parseFloat(process.env.IDLE_REQUEST_THRESHOLD || '1');
const WASTE_ALERT_USD      = 5; // alert threshold: $5 wasted / day
const ORDER_API_NAMESPACE  = 'cloudops';

// ── AWS clients ───────────────────────────────────────────────────────────────

const cw        = new CloudWatchClient({ region: REGION });
const rdsClient = new RDSClient({ region: REGION });
const eksClient = new EKSClient({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddb       = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({ region: REGION });

// ── On-demand pricing (us-east-1, Linux) — updated 2026 ───────────────────────

const EC2_HOURLY = {
  't3.nano':    0.0052, 't3.micro':   0.0104, 't3.small':   0.0208,
  't3.medium':  0.0416, 't3.large':   0.0832, 't3.xlarge':  0.1664,
  't3.2xlarge': 0.3328, 'm5.large':   0.0960, 'm5.xlarge':  0.1920,
  'm5.2xlarge': 0.3840, 'm5.4xlarge': 0.7680, 'c5.large':   0.0850,
  'c5.xlarge':  0.1700, 'c5.2xlarge': 0.3400,
};

const RDS_HOURLY = {
  'db.t3.micro':    0.017, 'db.t3.small':   0.034, 'db.t3.medium':  0.068,
  'db.t3.large':    0.136, 'db.r6g.large':  0.240, 'db.r6g.xlarge': 0.480,
  'db.r6g.2xlarge': 0.960,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
}

// Handles date str.
function dateStr(d = new Date()) { return d.toISOString().slice(0, 10); }

/**
 * GetMetricStatistics and return the average across all datapoints.
 * Returns null when there are no datapoints (metric not published / module not deployed).
 */
async function cwAvg(namespace, metricName, dimensions, hoursBack = 2, period = 900) {
  try {
    const r = await cw.send(new GetMetricStatisticsCommand({
      Namespace:  namespace,
      MetricName: metricName,
      Dimensions: dimensions,
      StartTime:  new Date(Date.now() - hoursBack * 3_600_000),
      EndTime:    new Date(),
      Period:     period,
      Statistics: ['Average'],
    }));
    const pts = r.Datapoints || [];
    if (pts.length === 0) return null;
    return pts.reduce((s, d) => s + d.Average, 0) / pts.length;
  } catch (err) {
    log('warn', { msg: `cwAvg failed: ${namespace}/${metricName}`, error: err.message });
    return null;
  }
}

/**
 * GetMetricData with arbitrary MetricDataQuery array.
 * Returns the raw MetricDataResults array.
 */
async function cwMetricData(queries, hoursBack = 2) {
  try {
    const r = await cw.send(new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: new Date(Date.now() - hoursBack * 3_600_000),
      EndTime:   new Date(),
    }));
    return r.MetricDataResults || [];
  } catch (err) {
    log('warn', { msg: 'GetMetricData failed', error: err.message });
    return [];
  }
}

/** Average of a MetricDataResult's Values array, or null if empty. */
function avgValues(result) {
  const vals = result?.Values || [];
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── EKS node utilization check ────────────────────────────────────────────────

async function checkEKSNodes() {
  if (!EKS_CLUSTER_NAME) return null;

  // 1. Cluster-aggregate CPU + memory from Container Insights (SEARCH → AVG)
  const results = await cwMetricData([
    {
      Id:         'avg_cpu',
      Expression: `AVG(SEARCH('{ContainerInsights,ClusterName,NodeName} MetricName="node_cpu_utilization" AND ClusterName="${EKS_CLUSTER_NAME}"', 'Average', 900))`,
      Label:      'AvgNodeCpu',
    },
    {
      Id:         'avg_mem',
      Expression: `AVG(SEARCH('{ContainerInsights,ClusterName,NodeName} MetricName="node_memory_utilization" AND ClusterName="${EKS_CLUSTER_NAME}"', 'Average', 900))`,
      Label:      'AvgNodeMemory',
    },
  ], 2);

  const avgCpu = avgValues(results.find(r => r.Id === 'avg_cpu'));
  const avgMem = avgValues(results.find(r => r.Id === 'avg_mem'));

  if (avgCpu === null && avgMem === null) {
    log('info', { msg: 'No Container Insights node metrics — EKS may not have CI enabled or cluster is not deployed' });
    return null;
  }

  // 2. Fetch nodegroups to get node count + instance type for cost calculation
  let nodeCount     = 0;
  let instanceType  = 't3.large';

  try {
    const ngs = await eksClient.send(new ListNodegroupsCommand({ clusterName: EKS_CLUSTER_NAME }));
    for (const ngName of (ngs.nodegroups || [])) {
      const ng = await eksClient.send(new DescribeNodegroupCommand({ clusterName: EKS_CLUSTER_NAME, nodegroupName: ngName }));
      nodeCount    += ng.nodegroup?.scalingConfig?.desiredSize || 0;
      instanceType  = ng.nodegroup?.instanceTypes?.[0] || instanceType;
    }
  } catch (err) {
    log('warn', { msg: 'Failed to describe EKS nodegroups', error: err.message });
    nodeCount = 2; // fallback estimate
  }

  const nodeHourlyCost = EC2_HOURLY[instanceType] ?? EC2_HOURLY['t3.large'];
  const cpuIdle        = avgCpu !== null && avgCpu < IDLE_CPU_THRESHOLD;
  const memIdle        = avgMem !== null && avgMem < IDLE_CPU_THRESHOLD;

  if (!cpuIdle && !memIdle) return null;

  // Wasted cost: fraction of cluster that is idle × node cost × 24h
  const wastedFraction  = 1 - Math.max(avgCpu ?? 0, avgMem ?? 0) / 100;
  const wastedHourlyCost = wastedFraction * nodeHourlyCost * nodeCount;
  const wastedDailyCost  = wastedHourlyCost * 24;

  return {
    resourceType:    'EKS_NODES',
    resource:        EKS_CLUSTER_NAME,
    avgCpuPercent:   avgCpu,
    avgMemPercent:   avgMem,
    nodeCount,
    instanceType,
    wastedDailyCostUsd: wastedDailyCost,
    recommendation:  `EKS cluster ${EKS_CLUSTER_NAME} nodes are ${avgCpu?.toFixed(1)}% CPU / ${avgMem?.toFixed(1)}% memory utilized over the last 2h. ` +
                     `Consider scaling down node group min/desired count from ${nodeCount} (estimated waste: $${wastedDailyCost.toFixed(2)}/day).`,
  };
}

// ── RDS utilization check ─────────────────────────────────────────────────────

async function checkRDS() {
  if (!RDS_INSTANCE_ID) return null;

  const [avgCpu, avgConns] = await Promise.all([
    cwAvg('AWS/RDS', 'CPUUtilization',     [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }]),
    cwAvg('AWS/RDS', 'DatabaseConnections', [{ Name: 'DBInstanceIdentifier', Value: RDS_INSTANCE_ID }]),
  ]);

  if (avgCpu === null) {
    log('info', { msg: 'No RDS metrics — instance may not be deployed' });
    return null;
  }

  const cpuIdle  = avgCpu < 5;
  const connIdle = avgConns !== null && avgConns < IDLE_REQ_THRESHOLD;

  if (!cpuIdle || !connIdle) return null;

  // Look up instance class for cost
  let instanceClass = 'db.t3.micro';
  try {
    const r = await rdsClient.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: RDS_INSTANCE_ID }));
    instanceClass = r.DBInstances?.[0]?.DBInstanceClass || instanceClass;
  } catch (err) {
    log('warn', { msg: 'Failed to describe RDS instance', error: err.message });
  }

  const rdsHourlyCost  = RDS_HOURLY[instanceClass] ?? RDS_HOURLY['db.t3.micro'];
  const wastedDailyCost = rdsHourlyCost * 24;

  return {
    resourceType:       'RDS_INSTANCE',
    resource:           RDS_INSTANCE_ID,
    avgCpuPercent:      avgCpu,
    avgConnections:     avgConns,
    instanceClass,
    wastedDailyCostUsd: wastedDailyCost,
    recommendation:     ENVIRONMENT === 'prod'
      ? `RDS instance ${RDS_INSTANCE_ID} is idle (${avgCpu.toFixed(1)}% CPU, ${avgConns?.toFixed(0)} connections). Review load patterns — do NOT stop in prod.`
      : `RDS instance ${RDS_INSTANCE_ID} is idle (${avgCpu.toFixed(1)}% CPU, ${avgConns?.toFixed(0)} connections). Consider stopping in ${ENVIRONMENT} to save ~$${wastedDailyCost.toFixed(2)}/day.`,
  };
}

// ── EKS pod rightsizing check ─────────────────────────────────────────────────

async function checkPodRightsizing() {
  if (!EKS_CLUSTER_NAME) return [];

  // SEARCH across all pods in cloudops namespace — each pod is a separate MetricDataResult
  const results = await cwMetricData([
    {
      Id:         'pod_cpu',
      Expression: `SEARCH('{ContainerInsights,ClusterName,Namespace,PodName} MetricName="pod_cpu_utilization" AND ClusterName="${EKS_CLUSTER_NAME}" AND Namespace="${ORDER_API_NAMESPACE}"', 'Average', 900)`,
    },
  ], 2);

  if (results.length === 0) return [];

  const overprovisioned = [];

  for (const result of results) {
    const avg = avgValues(result);
    if (avg === null || avg >= 20) continue; // ≥20% utilized — OK

    // Extract PodName from the label: "pod_cpu_utilization ClusterName=X Namespace=Y PodName=Z"
    const match   = (result.Label || '').match(/PodName=([^\s]+)/);
    const podName = match ? match[1] : result.Id;

    overprovisioned.push({
      podName,
      avgCpuUtilizationPercent: avg,
      recommendation: `Pod ${podName} in namespace ${ORDER_API_NAMESPACE} is using only ${avg.toFixed(1)}% of its CPU limit. ` +
                      `Reduce cpu.requests in apps/order-api/k8s/deployment.yaml to reclaim capacity.`,
    });
  }

  return overprovisioned;
}

// ── DynamoDB storage ──────────────────────────────────────────────────────────

async function storeFindings(findings, totalWasted) {
  const today = dateStr();
  const ttl   = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

  const existing = await ddb.send(new GetCommand({
    TableName: DYNAMODB_TABLE,
    Key:       { service: 'idle-detection', date: today },
  }));

  if (existing.Item) {
    await ddb.send(new UpdateCommand({
      TableName:                 DYNAMODB_TABLE,
      Key:                       { service: 'idle-detection', date: today },
      UpdateExpression:          'SET idle_resources = :r, wasted_cost_daily_usd = :w, #ttl = :ttl, last_updated = :ts',
      ExpressionAttributeNames:  { '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':r':   findings,
        ':w':   totalWasted,
        ':ttl': ttl,
        ':ts':  new Date().toISOString(),
      },
    }));
  } else {
    await ddb.send(new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        service:               'idle-detection',
        date:                  today,
        idle_resources:        findings,
        wasted_cost_daily_usd: totalWasted,
        environment:           ENVIRONMENT,
        created_at:            new Date().toISOString(),
        ttl,
      },
    }));
  }
}

// ── CloudWatch metrics ────────────────────────────────────────────────────────

async function publishMetrics(idleCount, totalWasted) {
  const dims = [{ Name: 'Environment', Value: ENVIRONMENT }];
  await cw.send(new PutMetricDataCommand({
    Namespace:  'CloudOps/FinOps',
    MetricData: [
      {
        MetricName: 'IdleResourcesDetected',
        Value:      idleCount,
        Unit:       'Count',
        Timestamp:  new Date(),
        Dimensions: dims,
      },
      {
        MetricName: 'EstimatedWastedCostDaily',
        Value:      totalWasted,
        Unit:       'None',
        Timestamp:  new Date(),
        Dimensions: dims,
      },
    ],
  }));
}

// ── SNS alert ─────────────────────────────────────────────────────────────────

async function publishAlert(findings, totalWasted) {
  if (!SNS_TOPIC_ARN) return;

  await snsClient.send(new PublishCommand({
    TopicArn: SNS_TOPIC_ARN,
    Subject:  `[WARNING] CloudOps FinOps: $${totalWasted.toFixed(2)}/day in idle resources detected`,
    Message:  JSON.stringify({
      environment:         ENVIRONMENT,
      estimatedWastedUsdPerDay: totalWasted,
      idleResourceCount:   findings.length,
      findings:            findings.map(f => ({
        resourceType:    f.resourceType || 'EKS_POD',
        resource:        f.resource || f.podName,
        recommendation:  f.recommendation,
        wastedDailyCost: f.wastedDailyCostUsd ?? 0,
      })),
      timestamp: new Date().toISOString(),
    }, null, 2),
    MessageAttributes: {
      severity: { DataType: 'String', StringValue: 'WARNING' },
    },
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler() {
  const startTime = Date.now();
  log('info', { msg: 'Idle resource detection started', environment: ENVIRONMENT });

  // Run all checks concurrently — failures are isolated
  const [eksNodeFinding, rdsFinding, overProvisionedPods] = await Promise.all([
    checkEKSNodes().catch(err => { log('error', { msg: 'EKS node check failed', error: err.message }); return null; }),
    checkRDS().catch(err       => { log('error', { msg: 'RDS check failed',      error: err.message }); return null; }),
    checkPodRightsizing().catch(err => { log('error', { msg: 'Pod rightsizing check failed', error: err.message }); return []; }),
  ]);

  // Flatten all findings
  const allFindings = [
    ...(eksNodeFinding ? [eksNodeFinding] : []),
    ...(rdsFinding     ? [rdsFinding]     : []),
    ...overProvisionedPods.map(p => ({ resourceType: 'EKS_POD', ...p, wastedDailyCostUsd: 0 })),
  ];

  const totalWasted = allFindings.reduce((sum, f) => sum + (f.wastedDailyCostUsd ?? 0), 0);
  const idleCount   = allFindings.filter(f => f.resourceType !== 'EKS_POD').length + overProvisionedPods.length;

  // Persist findings
  try {
    await storeFindings(allFindings, totalWasted);
  } catch (err) {
    log('warn', { msg: 'Failed to store findings in DynamoDB', error: err.message });
  }

  // Publish CloudWatch metrics
  try {
    await publishMetrics(idleCount, totalWasted);
  } catch (err) {
    log('warn', { msg: 'Failed to publish CloudWatch metrics', error: err.message });
  }

  // Alert if wasted cost exceeds threshold
  if (allFindings.length > 0 && totalWasted > WASTE_ALERT_USD) {
    try {
      await publishAlert(allFindings, totalWasted);
    } catch (err) {
      log('warn', { msg: 'Failed to publish SNS alert', error: err.message });
    }
  }

  const summary = {
    idleResourcesDetected: idleCount,
    estimatedWastedUsdPerDay: totalWasted.toFixed(2),
    eksNodeIdle:    eksNodeFinding !== null,
    rdsIdle:        rdsFinding    !== null,
    overProvisionedPodCount: overProvisionedPods.length,
    durationMs:     Date.now() - startTime,
  };

  log('info', { msg: 'Idle resource detection complete', ...summary });

  return { statusCode: 200, body: JSON.stringify(summary) };
};
