'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const crypto = require('crypto');

// ── Environment ───────────────────────────────────────────────────────────────

const REGION         = process.env.AWS_REGION     || 'us-east-1';
const FINDINGS_TABLE = process.env.FINDINGS_TABLE || 'cloudops-security-findings';
const ENVIRONMENT    = process.env.ENVIRONMENT    || 'dev';

// ── AWS clients ───────────────────────────────────────────────────────────────

const ddbClient = new DynamoDBClient({ region: REGION });
const ddb       = DynamoDBDocumentClient.from(ddbClient);
const cw        = new CloudWatchClient({ region: REGION });

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
}

// ── kube-bench severity mapping ───────────────────────────────────────────────
// kube-bench statuses: PASS, FAIL, WARN, INFO, NOT_CHECKED
// CloudOps severities: CRITICAL, HIGH, MEDIUM, LOW
// Spec: filter to FAIL and WARN only

const STATUS_TO_SEVERITY = {
  FAIL: 'HIGH',
  WARN: 'MEDIUM',
};

// ── kube-bench output parsing ─────────────────────────────────────────────────
//
// kube-bench JSON schema:
// {
//   "Controls": [{
//     "id": "4",
//     "text": "Worker Node Security Configuration",
//     "tests": [{
//       "section": "4.2",
//       "desc": "Kubelet Configuration",
//       "results": [{
//         "test_number": "4.2.1",
//         "test_desc": "Ensure that --anonymous-auth argument is set to false",
//         "status": "FAIL",           // PASS | FAIL | WARN | INFO | NOT_CHECKED
//         "remediation": "Edit the Kubelet config...",
//         "reason": ""
//       }]
//     }]
//   }],
//   "Totals": { "total_pass": 45, "total_fail": 5, "total_warn": 3, "total_info": 0 }
// }

function extractFindings(kubeBenchOutput, clusterName, nodeName) {
  const findings = [];

  for (const control of (kubeBenchOutput.Controls || [])) {
    for (const test of (control.tests || [])) {
      for (const result of (test.results || [])) {
        const severity = STATUS_TO_SEVERITY[result.status];
        if (!severity) continue; // skip PASS, INFO, NOT_CHECKED

        findings.push({
          findingId:  crypto.randomUUID(),
          checkName:  'kube_bench',
          // Resource is unique per (cluster, CIS check ID) — enables dedup across runs
          resource:   `eks:benchmark:${clusterName}:${result.test_number}`,
          severity,
          checkId:    result.test_number,
          description: `[${result.test_number}] ${result.test_desc}`,
          recommendation: (result.remediation || 'See CIS Kubernetes Benchmark for remediation steps').trim(),
          evidence: {
            source:      'kube-bench',
            node:        nodeName || null,
            status:      result.status,
            testNumber:  result.test_number,
            testDesc:    result.test_desc,
            benchmarkId: control.id,
            section:     test.section,
            sectionDesc: test.desc,
            reason:      result.reason || '',
            scored:      result.scored ?? true,
          },
        });
      }
    }
  }

  return findings;
}

// passedChecks returns the check IDs kube-bench reported as PASS. Only those
// resolve an open finding: a check reported INFO or NOT_CHECKED this run was
// not evaluated, which is not a pass.
function passedChecks(kubeBenchOutput) {
  const passed = new Set();
  for (const control of (kubeBenchOutput.Controls || [])) {
    for (const test of (control.tests || [])) {
      for (const result of (test.results || [])) {
        if (result.status === 'PASS') passed.add(result.test_number);
      }
    }
  }
  return passed;
}

// ── DynamoDB deduplication ────────────────────────────────────────────────────
//
// Queries status-index GSI for all OPEN kube_bench findings for this cluster.
// Returns Map<resource, existingItem> for O(1) dedup lookup during persist loop.

async function loadOpenKubeBenchFindings(clusterName) {
  const openFindings = new Map();
  const resourcePrefix = `eks:benchmark:${clusterName}:`;
  let lastKey;

  do {
    const r = await ddb.send(new QueryCommand({
      TableName:                 FINDINGS_TABLE,
      IndexName:                 'status-index',
      KeyConditionExpression:    '#s = :open',
      FilterExpression:          'check_name = :cn AND begins_with(#res, :prefix)',
      ExpressionAttributeNames:  { '#s': 'status', '#res': 'resource' },
      ExpressionAttributeValues: { ':open': 'OPEN', ':cn': 'kube_bench', ':prefix': resourcePrefix },
      ExclusiveStartKey:         lastKey,
    }));

    for (const item of (r.Items || [])) {
      openFindings.set(item.resource, item);
    }
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  return openFindings;
}

async function persistFinding(finding, isNew, existing) {
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

  if (isNew) {
    await ddb.send(new PutCommand({
      TableName: FINDINGS_TABLE,
      Item: {
        finding_id:       finding.findingId,
        timestamp:        now,
        check_name:       finding.checkName,
        resource:         finding.resource,
        severity:         finding.severity,
        status:           'OPEN',
        source:           'kube-bench',
        check_id:         finding.checkId,
        description:      finding.description,
        recommendation:   finding.recommendation,
        evidence:         finding.evidence,
        last_seen_at:     now,
        occurrence_count: 1,
        ttl,
      },
    }));
  } else {
    // Refresh last_seen_at and extend TTL without changing the creation timestamp (sort key)
    await ddb.send(new UpdateCommand({
      TableName:                 FINDINGS_TABLE,
      Key:                       { finding_id: existing.finding_id, timestamp: existing.timestamp },
      UpdateExpression:          'SET last_seen_at = :ts, occurrence_count = occurrence_count + :one, #ttl = :ttl',
      ExpressionAttributeNames:  { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ts': now, ':one': 1, ':ttl': ttl },
    }));
  }
}

// resolveFinding closes an open finding whose check now passes. The
// condition keeps it from overwriting a finding closed in the meantime.
async function resolveFinding(item) {
  await ddb.send(new UpdateCommand({
    TableName:                 FINDINGS_TABLE,
    Key:                       { finding_id: item.finding_id, timestamp: item.timestamp },
    UpdateExpression:          'SET #s = :resolved, resolved_at = :ts, resolved_by = :by',
    ConditionExpression:       '#s = :open',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: { ':resolved': 'RESOLVED', ':open': 'OPEN', ':ts': new Date().toISOString(), ':by': 'kube-bench-processor' },
  }));
}

// ── CloudWatch metrics ────────────────────────────────────────────────────────

async function publishMetrics({ failures, warnings, clusterName }) {
  const dims = [
    { Name: 'Environment',  Value: ENVIRONMENT },
    { Name: 'ClusterName',  Value: clusterName },
  ];

  await cw.send(new PutMetricDataCommand({
    Namespace:  'CloudOps/Security',
    MetricData: [
      {
        MetricName: 'KubeBenchFailures',
        Value:      failures,
        Unit:       'Count',
        Timestamp:  new Date(),
        Dimensions: dims,
      },
      {
        MetricName: 'KubeBenchWarnings',
        Value:      warnings,
        Unit:       'Count',
        Timestamp:  new Date(),
        Dimensions: dims,
      },
    ],
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler(event) {
  const { kubeBenchOutput, clusterName, nodeName } = event;

  if (!kubeBenchOutput) {
    throw new Error('Event is missing required field: kubeBenchOutput');
  }
  if (!clusterName) {
    throw new Error('Event is missing required field: clusterName');
  }

  log('info', { msg: 'kube-bench processor started', clusterName, environment: ENVIRONMENT });

  // 1. Extract FAIL and WARN findings from the kube-bench JSON tree.
  const findings = extractFindings(kubeBenchOutput, clusterName, nodeName);
  log('info', { msg: 'Findings extracted', total: findings.length, clusterName });

  // 2. Load existing open findings for this cluster to deduplicate.
  let openFindings;
  let openFindingsLoaded = false;
  try {
    openFindings = await loadOpenKubeBenchFindings(clusterName);
    openFindingsLoaded = true;
    log('info', { msg: `Loaded ${openFindings.size} existing open kube-bench findings`, clusterName });
  } catch (err) {
    log('error', { msg: 'Failed to load existing findings — proceeding without dedup', error: err.message });
    openFindings = new Map();
  }

  // 3. Persist findings with deduplication.
  let newCount      = 0;
  let existingCount = 0;

  for (const finding of findings) {
    const existing = openFindings.get(finding.resource);
    const isNew    = !existing;

    try {
      await persistFinding(finding, isNew, existing);
      if (isNew) newCount++;
      else existingCount++;
    } catch (err) {
      log('error', { msg: 'Failed to persist finding', checkId: finding.checkId, error: err.message });
    }
  }

  // 4. Resolve open findings whose check passed this run.
  let resolvedCount = 0;
  if (openFindingsLoaded) {
    const passed = passedChecks(kubeBenchOutput);
    for (const item of openFindings.values()) {
      if (!passed.has(item.check_id)) continue;
      try {
        await resolveFinding(item);
        resolvedCount++;
      } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') {
          log('error', { msg: 'Failed to resolve finding', checkId: item.check_id, error: err.message });
        }
      }
    }
  }

  // 5. Publish CW metrics using the kube-bench Totals field for accurate counts
  //    (includes controls that were NOT_CHECKED, which extractFindings skips).
  const totals = kubeBenchOutput.Totals || {};
  try {
    await publishMetrics({
      failures:    totals.total_fail  || 0,
      warnings:    totals.total_warn  || 0,
      clusterName,
    });
  } catch (err) {
    log('warn', { msg: 'Failed to publish CloudWatch metrics', error: err.message });
  }

  // 6. Structured summary log.
  const bySeverity = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  const summary = {
    clusterName,
    environment:      ENVIRONMENT,
    totalFindings:    findings.length,
    newFindings:      newCount,
    existingFindings: existingCount,
    resolvedFindings: resolvedCount,
    bySeverity,
    kubeBenchTotals: {
      pass:       totals.total_pass    || 0,
      fail:       totals.total_fail    || 0,
      warn:       totals.total_warn    || 0,
      info:       totals.total_info    || 0,
    },
  };

  log('info', { msg: 'kube-bench processing complete', ...summary });

  return { statusCode: 200, body: JSON.stringify(summary) };
};
