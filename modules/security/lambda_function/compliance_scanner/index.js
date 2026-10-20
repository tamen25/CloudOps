// This file contains index logic for lambda function compliance scanner.
'use strict';

const { EC2Client, DescribeSecurityGroupsCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');
const {
  S3Client,
  GetPublicAccessBlockCommand,
  GetBucketEncryptionCommand,
  GetBucketVersioningCommand,
} = require('@aws-sdk/client-s3');
const {
  IAMClient,
  ListPoliciesCommand,
  GetPolicyVersionCommand,
  ListRolesCommand,
  GetRoleCommand,
  GetAccountSummaryCommand,
} = require('@aws-sdk/client-iam');
const { EKSClient, DescribeClusterCommand, DescribeClusterVersionsCommand } = require('@aws-sdk/client-eks');
const {
  SecretsManagerClient,
  ListSecretsCommand,
} = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const crypto = require('crypto');

// ── Environment ───────────────────────────────────────────────────────────────

const REGION           = process.env.AWS_REGION        || 'us-east-1';
const ENVIRONMENT      = process.env.ENVIRONMENT       || 'dev';
const PROJECT_NAME     = process.env.PROJECT_NAME      || 'cloudops';
const VPC_ID           = process.env.VPC_ID            || '';
const RDS_INSTANCE_ID  = process.env.RDS_INSTANCE_ID   || '';
const EKS_CLUSTER_NAME = process.env.EKS_CLUSTER_NAME  || '';
const STATE_BUCKET     = process.env.STATE_BUCKET_NAME || '';
const LOKI_BUCKET      = process.env.LOKI_BUCKET_NAME  || '';
const TEMPO_BUCKET     = process.env.TEMPO_BUCKET_NAME || '';
const FINDINGS_TABLE   = process.env.FINDINGS_TABLE    || 'cloudops-security-findings';
const SNS_TOPIC_ARN    = process.env.SNS_TOPIC_ARN     || '';

// ── AWS clients — initialised once per container, reused across warm invocations ─

const ec2            = new EC2Client({ region: REGION });
const rds            = new RDSClient({ region: REGION });
const s3             = new S3Client({ region: REGION });
const iam            = new IAMClient({ region: REGION });
const eks            = new EKSClient({ region: REGION });
const secretsManager = new SecretsManagerClient({ region: REGION });
const ddbClient      = new DynamoDBClient({ region: REGION });
const ddb            = DynamoDBDocumentClient.from(ddbClient);
const sns            = new SNSClient({ region: REGION });
const cw             = new CloudWatchClient({ region: REGION });

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
}

// incomplete records that a check in this suite could not be evaluated
// (an API error), so the suite's open findings are not resolved this run.
function incomplete(ctx, msg, err) {
  ctx.incomplete = true;
  log('warn', { msg, error: err.message });
}

// Creates finding.
function createFinding({ checkName, resource, severity, description, recommendation, evidence = {} }) {
  return { findingId: crypto.randomUUID(), checkName, resource, severity, description, recommendation, evidence };
}

// ── S3 checks ─────────────────────────────────────────────────────────────────
// Checks: public access block, SSE, versioning (state bucket only).

async function checkS3(ctx) {
  const findings = [];
  const buckets = [
    { name: STATE_BUCKET, checkVersioning: true  },
    { name: LOKI_BUCKET,  checkVersioning: false },
    { name: TEMPO_BUCKET, checkVersioning: false },
  ].filter(b => b.name);

  for (const bucket of buckets) {
    // Public access block
    try {
      const r = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket.name }));
      const cfg = r.PublicAccessBlockConfiguration || {};
      if (!cfg.BlockPublicAcls || !cfg.IgnorePublicAcls || !cfg.BlockPublicPolicy || !cfg.RestrictPublicBuckets) {
        findings.push(createFinding({
          checkName:      's3_public_access_block_disabled',
          resource:       `s3:::${bucket.name}`,
          severity:       'HIGH',
          description:    `S3 bucket ${bucket.name} has one or more public access block flags disabled.`,
          recommendation: 'Set BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, and RestrictPublicBuckets to true.',
          evidence:       { bucket: bucket.name, config: cfg },
        }));
      }
    } catch (err) {
      // NoSuchPublicAccessBlockConfiguration means the block config is absent — equivalent to disabled.
      if (err.name === 'NoSuchPublicAccessBlockConfiguration') {
        findings.push(createFinding({
          checkName:      's3_public_access_block_disabled',
          resource:       `s3:::${bucket.name}`,
          severity:       'HIGH',
          description:    `S3 bucket ${bucket.name} has no public access block configuration set.`,
          recommendation: 'Configure S3 Block Public Access settings on the bucket.',
          evidence:       { bucket: bucket.name },
        }));
      } else {
        incomplete(ctx, `s3 public access check failed for ${bucket.name}`, err);
      }
    }

    // Server-side encryption
    try {
      await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.name }));
    } catch (err) {
      if (err.name === 'ServerSideEncryptionConfigurationNotFoundError') {
        findings.push(createFinding({
          checkName:      's3_encryption_disabled',
          resource:       `s3:::${bucket.name}`,
          severity:       'HIGH',
          description:    `S3 bucket ${bucket.name} has no default server-side encryption configured.`,
          recommendation: 'Enable default SSE (SSE-S3 or SSE-KMS) on the bucket.',
          evidence:       { bucket: bucket.name },
        }));
      } else {
        incomplete(ctx, `s3 encryption check failed for ${bucket.name}`, err);
      }
    }

    // Versioning (state bucket only)
    if (bucket.checkVersioning) {
      try {
        const r = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket.name }));
        if (r.Status !== 'Enabled') {
          findings.push(createFinding({
            checkName:      's3_versioning_disabled',
            resource:       `s3:::${bucket.name}`,
            severity:       'MEDIUM',
            description:    `Terraform state bucket ${bucket.name} does not have versioning enabled.`,
            recommendation: 'Enable versioning on the state bucket to recover from accidental state corruption.',
            evidence:       { bucket: bucket.name, status: r.Status || 'not configured' },
          }));
        }
      } catch (err) {
        incomplete(ctx, `s3 versioning check failed for ${bucket.name}`, err);
      }
    }
  }

  return findings;
}

// ── RDS checks ────────────────────────────────────────────────────────────────

async function checkRDS(ctx) {
  if (!RDS_INSTANCE_ID) return [];

  const r = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: RDS_INSTANCE_ID }));
  const db = r.DBInstances?.[0];
  if (!db) return [];

  const findings = [];

  if (db.PubliclyAccessible) {
    findings.push(createFinding({
      checkName:      'rds_publicly_accessible',
      resource:       `rds:db:${RDS_INSTANCE_ID}`,
      severity:       'CRITICAL',
      description:    `RDS instance ${RDS_INSTANCE_ID} is publicly accessible from the internet.`,
      recommendation: 'Set PubliclyAccessible to false and restrict access via security groups.',
      evidence:       { instanceId: RDS_INSTANCE_ID },
    }));
  }

  if (!db.StorageEncrypted) {
    findings.push(createFinding({
      checkName:      'rds_storage_not_encrypted',
      resource:       `rds:db:${RDS_INSTANCE_ID}`,
      severity:       'CRITICAL',
      description:    `RDS instance ${RDS_INSTANCE_ID} storage is not encrypted at rest.`,
      recommendation: 'Create an encrypted snapshot and restore to a new encrypted instance.',
      evidence:       { instanceId: RDS_INSTANCE_ID },
    }));
  }

  if (!db.DeletionProtection && ENVIRONMENT === 'prod') {
    findings.push(createFinding({
      checkName:      'rds_deletion_protection_disabled',
      resource:       `rds:db:${RDS_INSTANCE_ID}`,
      severity:       'HIGH',
      description:    `RDS instance ${RDS_INSTANCE_ID} has deletion protection disabled in production.`,
      recommendation: 'Enable deletion protection on all production RDS instances.',
      evidence:       { instanceId: RDS_INSTANCE_ID, environment: ENVIRONMENT },
    }));
  }

  if ((db.BackupRetentionPeriod ?? 0) < 7) {
    findings.push(createFinding({
      checkName:      'rds_backup_retention_low',
      resource:       `rds:db:${RDS_INSTANCE_ID}`,
      severity:       'MEDIUM',
      description:    `RDS instance ${RDS_INSTANCE_ID} backup retention is ${db.BackupRetentionPeriod} days (minimum recommended: 7).`,
      recommendation: 'Set BackupRetentionPeriod to at least 7 days.',
      evidence:       { instanceId: RDS_INSTANCE_ID, retentionDays: db.BackupRetentionPeriod },
    }));
  }

  if (!db.MultiAZ) {
    findings.push(createFinding({
      checkName:      'rds_multi_az_disabled',
      resource:       `rds:db:${RDS_INSTANCE_ID}`,
      severity:       'LOW',
      description:    `RDS instance ${RDS_INSTANCE_ID} is not configured with Multi-AZ (informational in non-prod).`,
      recommendation: 'Enable Multi-AZ for production instances to ensure automatic failover.',
      evidence:       { instanceId: RDS_INSTANCE_ID },
    }));
  }

  if (!db.PerformanceInsightsEnabled) {
    findings.push(createFinding({
      checkName:      'rds_performance_insights_disabled',
      resource:       `rds:db:${RDS_INSTANCE_ID}`,
      severity:       'LOW',
      description:    `RDS instance ${RDS_INSTANCE_ID} does not have Performance Insights enabled.`,
      recommendation: 'Enable Performance Insights for better database query visibility.',
      evidence:       { instanceId: RDS_INSTANCE_ID },
    }));
  }

  return findings;
}

// ── EKS checks ────────────────────────────────────────────────────────────────

async function checkEKS(ctx) {
  if (!EKS_CLUSTER_NAME) return [];

  const r = await eks.send(new DescribeClusterCommand({ name: EKS_CLUSTER_NAME }));
  const cluster = r.cluster;
  if (!cluster) return [];

  const findings = [];

  // All 5 control-plane log types must be enabled
  const requiredTypes = ['api', 'audit', 'authenticator', 'controllerManager', 'scheduler'];
  const enabledTypes  = (cluster.logging?.clusterLogging || [])
    .filter(l => l.enabled)
    .flatMap(l => l.types || []);
  const missing = requiredTypes.filter(t => !enabledTypes.includes(t));

  if (missing.length > 0) {
    findings.push(createFinding({
      checkName:      'eks_logging_incomplete',
      resource:       `eks:cluster:${EKS_CLUSTER_NAME}`,
      severity:       'MEDIUM',
      description:    `EKS cluster ${EKS_CLUSTER_NAME} is missing control plane log types: ${missing.join(', ')}.`,
      recommendation: 'Enable all five control plane log types: api, audit, authenticator, controllerManager, scheduler.',
      evidence:       { cluster: EKS_CLUSTER_NAME, enabled: enabledTypes, missing },
    }));
  }

  // Public endpoint without IP whitelist
  const isPublic  = cluster.resourcesVpcConfig?.endpointPublicAccess;
  const cidrs     = cluster.resourcesVpcConfig?.publicAccessCidrs || [];
  const openToAll = cidrs.length === 0 || cidrs.includes('0.0.0.0/0');

  if (isPublic && openToAll) {
    findings.push(createFinding({
      checkName:      'eks_public_endpoint_open',
      resource:       `eks:cluster:${EKS_CLUSTER_NAME}`,
      severity:       'HIGH',
      description:    `EKS cluster ${EKS_CLUSTER_NAME} has a public API endpoint accessible from 0.0.0.0/0.`,
      recommendation: 'Restrict publicAccessCidrs to known CIDR ranges or disable public endpoint access.',
      evidence:       { cluster: EKS_CLUSTER_NAME, publicAccessCidrs: cidrs },
    }));
  }

  // OIDC provider configured?
  if (!cluster.identity?.oidc?.issuer) {
    findings.push(createFinding({
      checkName:      'eks_no_oidc_provider',
      resource:       `eks:cluster:${EKS_CLUSTER_NAME}`,
      severity:       'HIGH',
      description:    `EKS cluster ${EKS_CLUSTER_NAME} has no OIDC provider — IRSA is unavailable.`,
      recommendation: 'Associate an IAM OIDC identity provider with the cluster to enable IRSA.',
      evidence:       { cluster: EKS_CLUSTER_NAME },
    }));
  }

  // Kubernetes version: EKS says whether it is still in standard support.
  // Out of it, the version is in extended support (the control plane costs
  // six times as much) or unsupported. A hardcoded "latest" went stale.
  try {
    const v = await eks.send(new DescribeClusterVersionsCommand({ clusterVersions: [cluster.version] }));
    const info = v.clusterVersions?.[0];
    if (info && info.versionStatus !== 'STANDARD_SUPPORT') {
      findings.push(createFinding({
        checkName:      'eks_version_outdated',
        resource:       `eks:cluster:${EKS_CLUSTER_NAME}`,
        severity:       'HIGH',
        description:    `EKS cluster ${EKS_CLUSTER_NAME} runs Kubernetes ${cluster.version}, which is out of standard support (${info.versionStatus}).`,
        recommendation: 'Upgrade the EKS cluster to a version in standard support.',
        evidence:       { cluster: EKS_CLUSTER_NAME, currentVersion: cluster.version, versionStatus: info.versionStatus, endOfStandardSupportDate: info.endOfStandardSupportDate },
      }));
    }
  } catch (err) {
    incomplete(ctx, `eks version check failed for ${EKS_CLUSTER_NAME}`, err);
  }

  return findings;
}

// ── Security group checks ─────────────────────────────────────────────────────

// Protocols whose rules have port ranges: TCP, UDP, and -1 (all traffic).
const PORT_PROTOCOLS = new Set(['tcp', 'udp', '6', '17', '-1']);

async function checkSecurityGroups(ctx) {
  if (!VPC_ID) return [];

  // Paginate all SGs in the project VPC
  const sgs = [];
  let nextToken;
  do {
    const r = await ec2.send(new DescribeSecurityGroupsCommand({
      Filters:   [{ Name: 'vpc-id', Values: [VPC_ID] }],
      NextToken: nextToken,
    }));
    sgs.push(...(r.SecurityGroups || []));
    nextToken = r.NextToken;
  } while (nextToken);

  const findings = [];

  for (const sg of sgs) {
    const sgRef = `ec2:security-group:${sg.GroupId}`;

    for (const rule of (sg.IpPermissions || [])) {
      // For ICMP, FromPort and ToPort hold the ICMP type and code, not ports:
      // "type 3, code 4" (fragmentation needed) read as "ports 3-4".
      if (!PORT_PROTOCOLS.has(String(rule.IpProtocol))) continue;
      const fromPort = rule.FromPort ?? 0;
      const toPort   = rule.ToPort   ?? 65535;

      const hasOpenCidr =
        (rule.IpRanges  || []).some(r => r.CidrIp   === '0.0.0.0/0') ||
        (rule.Ipv6Ranges || []).some(r => r.CidrIpv6 === '::/0');

      if (!hasOpenCidr) continue;

      // Handles port in range.
      const portInRange = (p) => p >= fromPort && p <= toPort;
      const evidence = { groupId: sg.GroupId, groupName: sg.GroupName, fromPort, toPort };

      if (portInRange(22)) {
        findings.push(createFinding({
          checkName:      'sg_ssh_open_to_world',
          resource:       sgRef,
          severity:       'CRITICAL',
          description:    `Security group ${sg.GroupId} (${sg.GroupName}) allows SSH (22) ingress from 0.0.0.0/0.`,
          recommendation: 'Restrict SSH to known CIDR ranges or use AWS Systems Manager Session Manager.',
          evidence,
        }));
      }

      if (portInRange(3389)) {
        findings.push(createFinding({
          checkName:      'sg_rdp_open_to_world',
          resource:       sgRef,
          severity:       'CRITICAL',
          description:    `Security group ${sg.GroupId} (${sg.GroupName}) allows RDP (3389) ingress from 0.0.0.0/0.`,
          recommendation: 'Restrict RDP to known CIDR ranges or use AWS Systems Manager Session Manager.',
          evidence,
        }));
      }

      if (portInRange(5432)) {
        findings.push(createFinding({
          checkName:      'sg_postgres_open_to_world',
          resource:       sgRef,
          severity:       'CRITICAL',
          description:    `Security group ${sg.GroupId} (${sg.GroupName}) allows PostgreSQL (5432) ingress from 0.0.0.0/0. Database is directly reachable from the internet.`,
          recommendation: 'Restrict port 5432 to application security groups only.',
          evidence,
        }));
      }

      // Any other privileged port (1–1024) that is not 80 or 443 → HIGH
      const privFrom = Math.max(1, fromPort);
      const privTo   = Math.min(1024, toPort);
      if (privTo >= privFrom) {
        const webOnly = fromPort === 80 && toPort === 80
                     || fromPort === 443 && toPort === 443;
        if (!webOnly) {
          findings.push(createFinding({
            checkName:      'sg_privileged_port_open_to_world',
            resource:       sgRef,
            severity:       'HIGH',
            description:    `Security group ${sg.GroupId} (${sg.GroupName}) allows ingress from 0.0.0.0/0 on privileged port range ${fromPort}–${toPort} (excluding 80/443).`,
            recommendation: 'Restrict ingress on privileged ports to specific known CIDR ranges.',
            evidence,
          }));
        }
      }
    }
  }

  return findings;
}

// ── IAM checks ────────────────────────────────────────────────────────────────

async function checkIAM(ctx) {
  const findings = [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Custom policies with Action: * and Resource: *
  let policyMarker;
  do {
    const r = await iam.send(new ListPoliciesCommand({ Scope: 'Local', Marker: policyMarker }));
    for (const policy of (r.Policies || [])) {
      try {
        const pv  = await iam.send(new GetPolicyVersionCommand({
          PolicyArn: policy.Arn,
          VersionId: policy.DefaultVersionId,
        }));
        const doc   = JSON.parse(decodeURIComponent(pv.PolicyVersion?.Document || '{}'));
        const stmts = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement].filter(Boolean);

        const isWildcardAdmin = stmts.some(s => {
          const actions   = Array.isArray(s.Action)   ? s.Action   : [s.Action];
          const resources = Array.isArray(s.Resource) ? s.Resource : [s.Resource];
          return s.Effect === 'Allow' && actions.includes('*') && resources.includes('*');
        });

        if (isWildcardAdmin) {
          findings.push(createFinding({
            checkName:      'iam_wildcard_admin_policy',
            resource:       `iam:policy:${policy.PolicyName}`,
            severity:       'CRITICAL',
            description:    `IAM policy ${policy.PolicyName} grants Action: * on Resource: * — equivalent to full administrator access.`,
            recommendation: 'Replace wildcard permissions with least-privilege policy statements.',
            evidence:       { policyName: policy.PolicyName, policyArn: policy.Arn },
          }));
        }
      } catch (err) {
        incomplete(ctx, `Failed to inspect policy ${policy.PolicyName}`, err);
      }
    }
    policyMarker = r.IsTruncated ? r.Marker : undefined;
  } while (policyMarker);

  // IAM roles unused for more than 90 days
  let roleMarker;
  do {
    const r = await iam.send(new ListRolesCommand({ Marker: roleMarker }));
    for (const role of (r.Roles || [])) {
      try {
        const detail   = await iam.send(new GetRoleCommand({ RoleName: role.RoleName }));
        const lastUsed = detail.Role?.RoleLastUsed?.LastUsedDate;
        if (lastUsed && new Date(lastUsed) < ninetyDaysAgo) {
          findings.push(createFinding({
            checkName:      'iam_role_unused_90_days',
            resource:       `iam:role:${role.RoleName}`,
            severity:       'MEDIUM',
            description:    `IAM role ${role.RoleName} has not been used since ${new Date(lastUsed).toISOString().slice(0, 10)}. Unused roles expand the blast radius of a credential compromise.`,
            recommendation: 'Review and remove unused IAM roles, or document their intended use.',
            evidence:       { roleName: role.RoleName, lastUsedDate: lastUsed },
          }));
        }
      } catch (err) {
        incomplete(ctx, `Failed to check role ${role.RoleName}`, err);
      }
    }
    roleMarker = r.IsTruncated ? r.Marker : undefined;
  } while (roleMarker);

  // Root account active access keys
  const summary = await iam.send(new GetAccountSummaryCommand({}));
  if ((summary.SummaryMap?.AccountAccessKeysPresent ?? 0) > 0) {
    findings.push(createFinding({
      checkName:      'iam_root_access_keys_active',
      resource:       'iam:root',
      severity:       'CRITICAL',
      description:    'The AWS root account has active access keys. Root credentials must never be used programmatically.',
      recommendation: 'Delete all root account access keys immediately. Use IAM roles for programmatic access.',
      evidence:       { rootAccessKeysPresent: summary.SummaryMap.AccountAccessKeysPresent },
    }));
  }

  return findings;
}

// ── Secrets Manager checks ────────────────────────────────────────────────────

async function checkSecretsManager(ctx) {
  const findings = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let nextToken;
  do {
    const r = await secretsManager.send(new ListSecretsCommand({ NextToken: nextToken }));
    for (const secret of (r.SecretList || [])) {
      if (secret.DeletedDate) continue; // skip scheduled-deletion secrets

      const lastAccessed = secret.LastAccessedDate;
      if (lastAccessed && new Date(lastAccessed) < thirtyDaysAgo) {
        findings.push(createFinding({
          checkName:      'secrets_manager_not_accessed_30d',
          resource:       `secretsmanager:secret:${secret.Name}`,
          severity:       'MEDIUM',
          description:    `Secret ${secret.Name} has not been accessed since ${new Date(lastAccessed).toISOString().slice(0, 10)}. This may be an orphaned secret.`,
          recommendation: 'Verify whether this secret is still needed. Delete it or schedule rotation if unused.',
          evidence:       { secretName: secret.Name, lastAccessedDate: lastAccessed },
        }));
      }

      if (!secret.RotationEnabled) {
        findings.push(createFinding({
          checkName:      'secrets_manager_rotation_disabled',
          resource:       `secretsmanager:secret:${secret.Name}`,
          severity:       'LOW',
          description:    `Secret ${secret.Name} does not have automatic rotation configured.`,
          recommendation: 'Enable automatic rotation for secrets that contain credentials.',
          evidence:       { secretName: secret.Name },
        }));
      }
    }
    nextToken = r.NextToken;
  } while (nextToken);

  return findings;
}

// ── DynamoDB deduplication ────────────────────────────────────────────────────

async function loadOpenFindings() {
  // Returns a Map keyed by `${checkName}::${resource}` → existing DynamoDB item.
  const openFindings = new Map();
  let lastKey;

  do {
    const r = await ddb.send(new QueryCommand({
      TableName:                 FINDINGS_TABLE,
      IndexName:                 'status-index',
      KeyConditionExpression:    '#s = :open',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: { ':open': 'OPEN' },
      ExclusiveStartKey:         lastKey,
    }));
    for (const item of (r.Items || [])) {
      openFindings.set(`${item.check_name}::${item.resource}`, item);
    }
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  return openFindings;
}

// Handles persist finding.
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
        description:      finding.description,
        recommendation:   finding.recommendation,
        evidence:         finding.evidence,
        last_seen_at:     now,
        occurrence_count: 1,
        ttl,
      },
    }));
  } else {
    // Refresh last_seen_at and bump occurrence count; preserve the original timestamp (creation time).
    await ddb.send(new UpdateCommand({
      TableName:                 FINDINGS_TABLE,
      Key:                       { finding_id: existing.finding_id, timestamp: existing.timestamp },
      UpdateExpression:          'SET last_seen_at = :ts, occurrence_count = occurrence_count + :one, #ttl = :ttl',
      ExpressionAttributeNames:  { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ts': now, ':one': 1, ':ttl': ttl },
    }));
  }
}

// resolveFinding closes an open finding the latest complete scan did not
// report. The condition keeps it from reopening or overwriting a finding
// auto-remediation closed in the meantime.
async function resolveFinding(item) {
  await ddb.send(new UpdateCommand({
    TableName:                 FINDINGS_TABLE,
    Key:                       { finding_id: item.finding_id, timestamp: item.timestamp },
    UpdateExpression:          'SET #s = :resolved, resolved_at = :ts, resolved_by = :by',
    ConditionExpression:       '#s = :open',
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: { ':resolved': 'RESOLVED', ':open': 'OPEN', ':ts': new Date().toISOString(), ':by': 'compliance-scanner' },
  }));
}

// ── SNS notification ──────────────────────────────────────────────────────────

async function notifyFinding(finding) {
  if (!SNS_TOPIC_ARN) return;

  await sns.send(new PublishCommand({
    TopicArn: SNS_TOPIC_ARN,
    Subject:  `[${finding.severity}] CloudOps Security: ${finding.checkName}`,
    Message:  JSON.stringify({
      severity:       finding.severity,
      checkName:      finding.checkName,
      resource:       finding.resource,
      description:    finding.description,
      recommendation: finding.recommendation,
      evidence:       finding.evidence,
      environment:    ENVIRONMENT,
      projectName:    PROJECT_NAME,
      timestamp:      new Date().toISOString(),
    }, null, 2),
    // MessageAttributes drive the HIGH/CRITICAL filter policy on the SNS subscription.
    MessageAttributes: {
      severity: { DataType: 'String', StringValue: finding.severity },
    },
  }));
}

// ── CloudWatch metrics ────────────────────────────────────────────────────────

async function publishMetrics(allFindings, newCount) {
  const dims      = [{ Name: 'Environment', Value: ENVIRONMENT }];
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const metricData = [];

  for (const sev of severities) {
    metricData.push({
      MetricName: 'SecurityFindingsOpen',
      Value:      allFindings.filter(f => f.severity === sev).length,
      Unit:       'Count',
      Timestamp:  new Date(),
      Dimensions: [...dims, { Name: 'Severity', Value: sev }],
    });
  }

  metricData.push({
    MetricName: 'NewFindingsDetected',
    Value:      newCount,
    Unit:       'Count',
    Timestamp:  new Date(),
    Dimensions: dims,
  });

  // CloudWatch accepts at most 20 metrics per PutMetricData call.
  for (let i = 0; i < metricData.length; i += 20) {
    await cw.send(new PutMetricDataCommand({
      Namespace:  'CloudOps/Security',
      MetricData: metricData.slice(i, i + 20),
    }));
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler() {
  const runId     = crypto.randomUUID();
  const startTime = Date.now();
  log('info', { msg: 'Compliance scan started', runId, environment: ENVIRONMENT, projectName: PROJECT_NAME });

  // 1. Load existing OPEN findings for deduplication.
  let openFindings;
  let openFindingsLoaded = false;
  try {
    openFindings = await loadOpenFindings();
    openFindingsLoaded = true;
    log('info', { msg: `Loaded ${openFindings.size} existing open findings`, runId });
  } catch (err) {
    log('error', { msg: 'Failed to load open findings from DynamoDB — proceeding without dedup', error: err.message, runId });
    openFindings = new Map();
  }

  // 2. Run all check suites concurrently. Individual suite failures are caught
  //    so a single failing check (e.g. RDS not deployed) does not abort the run.
  // prefix: the check names a suite reports, to know which open findings in
  // the shared table are its own (kube-bench writes there too).
  const suites = [
    { name: 's3',              fn: checkS3,             prefix: 's3_' },
    { name: 'rds',             fn: checkRDS,            prefix: 'rds_' },
    { name: 'eks',             fn: checkEKS,            prefix: 'eks_' },
    { name: 'security-groups', fn: checkSecurityGroups, prefix: 'sg_' },
    { name: 'iam',             fn: checkIAM,            prefix: 'iam_' },
    { name: 'secrets-manager', fn: checkSecretsManager, prefix: 'secrets_manager_' },
  ].map(s => ({ ...s, ctx: { incomplete: false } }));

  const settled = await Promise.allSettled(
    suites.map(s => s.fn(s.ctx).then(findings => ({ suite: s.name, findings })))
  );

  let allFindings  = [];
  let checksRun    = 0;
  const suiteErrors = [];

  const completeSuites = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      checksRun++;
      if (!suites[i].ctx.incomplete) completeSuites.push(suites[i]);
      allFindings = allFindings.concat(result.value.findings);
    } else {
      suiteErrors.push(result.reason?.message || String(result.reason));
      log('error', { msg: 'Check suite failed', error: result.reason?.message, runId });
    }
  });

  // 3. Deduplicate, persist, and alert.
  let newCount      = 0;
  let existingCount = 0;

  for (const finding of allFindings) {
    const key      = `${finding.checkName}::${finding.resource}`;
    const existing = openFindings.get(key);
    const isNew    = !existing;

    try {
      await persistFinding(finding, isNew, existing);

      if (isNew) {
        newCount++;
        if (finding.severity === 'CRITICAL' || finding.severity === 'HIGH') {
          await notifyFinding(finding).catch(err =>
            log('warn', { msg: 'SNS publish failed', error: err.message, checkName: finding.checkName })
          );
        }
      } else {
        existingCount++;
      }
    } catch (err) {
      log('error', { msg: 'Failed to persist finding', error: err.message, findingId: finding.findingId });
    }
  }

  // 4. Resolve what a complete suite no longer reports. A suite that failed,
  //    or could not evaluate one of its checks, resolves nothing: an API
  //    error is not a pass.
  const seen = new Set(allFindings.map(f => `${f.checkName}::${f.resource}`));
  let resolvedCount = 0;
  if (openFindingsLoaded) {
    for (const [key, item] of openFindings) {
      if (seen.has(key) || !completeSuites.some(s => item.check_name?.startsWith(s.prefix))) continue;
      try {
        await resolveFinding(item);
        resolvedCount++;
      } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') {
          log('error', { msg: 'Failed to resolve finding', error: err.message, findingId: item.finding_id });
        }
      }
    }
  }

  // 5. Publish CloudWatch metrics.
  try {
    await publishMetrics(allFindings, newCount);
  } catch (err) {
    log('warn', { msg: 'Failed to publish CloudWatch metrics', error: err.message });
  }

  // 6. Structured summary log.
  const bySeverity = {};
  for (const f of allFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  const summary = {
    runId,
    environment:     ENVIRONMENT,
    durationMs:      Date.now() - startTime,
    suiteCount:      checksRun,
    totalFindings:   allFindings.length,
    newFindings:     newCount,
    existingFindings: existingCount,
    resolvedFindings: resolvedCount,
    bySeverity,
    ...(suiteErrors.length > 0 && { suiteErrors }),
  };

  log('info', { msg: 'Compliance scan complete', ...summary });

  return { statusCode: 200, body: JSON.stringify(summary) };
};
