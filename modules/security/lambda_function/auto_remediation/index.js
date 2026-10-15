// This file contains index logic for lambda function auto remediation.
'use strict';

const {
  S3Client,
  PutBucketPublicAccessBlockCommand,
  PutBucketEncryptionCommand,
} = require('@aws-sdk/client-s3');
const {
  EC2Client,
  DescribeSecurityGroupsCommand,
  RevokeSecurityGroupIngressCommand,
} = require('@aws-sdk/client-ec2');
const { RDSClient, ModifyDBInstanceCommand }    = require('@aws-sdk/client-rds');
const { EKSClient, DescribeClusterCommand }     = require('@aws-sdk/client-eks');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient }                        = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand }             = require('@aws-sdk/client-sns');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { fromNodeProviderChain }                 = require('@aws-sdk/credential-providers');
const { SignatureV4 }                           = require('@smithy/signature-v4');
const { HttpRequest }                           = require('@smithy/protocol-http');
const { Sha256 }                                = require('@aws-crypto/sha256-js');
const fetch                                     = require('node-fetch');

// ── Environment ───────────────────────────────────────────────────────────────

const REGION                  = process.env.AWS_REGION               || 'us-east-1';
const FINDINGS_TABLE          = process.env.FINDINGS_TABLE           || 'cloudops-security-findings';
const GITHUB_TOKEN_SECRET_ARN = process.env.GITHUB_TOKEN_SECRET_ARN  || '';
const GITHUB_REPO             = process.env.GITHUB_REPO              || '';
const EKS_CLUSTER_NAME        = process.env.EKS_CLUSTER_NAME         || '';
const ENVIRONMENT             = process.env.ENVIRONMENT              || 'dev';
const DRY_RUN                 = process.env.DRY_RUN === 'true';

// ── AWS clients ───────────────────────────────────────────────────────────────

const s3        = new S3Client({ region: REGION });
const ec2       = new EC2Client({ region: REGION });
const rds       = new RDSClient({ region: REGION });
const eks       = new EKSClient({ region: REGION });
const sm        = new SecretsManagerClient({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddb       = DynamoDBDocumentClient.from(ddbClient);
const sns       = new SNSClient({ region: REGION });
const cw        = new CloudWatchClient({ region: REGION });

// ── Module-scope caches (survive warm invocations) ────────────────────────────

let cachedGitHubToken = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), dryRun: DRY_RUN, ...data }));
}

// Gets git hub token.
async function getGitHubToken() {
  if (cachedGitHubToken) return cachedGitHubToken;
  if (!GITHUB_TOKEN_SECRET_ARN) throw new Error('GITHUB_TOKEN_SECRET_ARN is not set');
  const r = await sm.send(new GetSecretValueCommand({ SecretId: GITHUB_TOKEN_SECRET_ARN }));
  cachedGitHubToken = r.SecretString;
  return cachedGitHubToken;
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

// Look up an OPEN finding by checkName + resource via the status-index GSI.
// The compliance scanner writes DDB before publishing to SNS, so the item
// is guaranteed to exist by the time this Lambda fires.
async function findOpenFinding(checkName, resource) {
  let lastKey;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName:                 FINDINGS_TABLE,
      IndexName:                 'status-index',
      KeyConditionExpression:    '#s = :open',
      FilterExpression:          'check_name = :cn AND #res = :res',
      ExpressionAttributeNames:  { '#s': 'status', '#res': 'resource' },
      ExpressionAttributeValues: { ':open': 'OPEN', ':cn': checkName, ':res': resource },
      ExclusiveStartKey:         lastKey,
    }));
    if (r.Items?.length > 0) return r.Items[0];
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return null;
}

// Handles mark remediated.
async function markRemediated(item, remediationAction) {
  if (!item) return;
  await ddb.send(new UpdateCommand({
    TableName:                 FINDINGS_TABLE,
    Key:                       { finding_id: item.finding_id, timestamp: item.timestamp },
    UpdateExpression:          'SET #status = :r, remediated_at = :ts, remediation_action = :action, remediated_by = :by',
    ExpressionAttributeNames:  { '#status': 'status' },
    ExpressionAttributeValues: {
      ':r':      'REMEDIATED',
      ':ts':     new Date().toISOString(),
      ':action': remediationAction,
      ':by':     'auto-remediation-lambda',
    },
  }));
}

// ── CloudWatch metrics ────────────────────────────────────────────────────────

async function publishMetric(metricName, severity, value = 1) {
  await cw.send(new PutMetricDataCommand({
    Namespace:  'CloudOps/Security',
    MetricData: [{
      MetricName: metricName,
      Value:      value,
      Unit:       'Count',
      Timestamp:  new Date(),
      Dimensions: [
        { Name: 'Environment', Value: ENVIRONMENT },
        { Name: 'Severity',    Value: severity },
      ],
    }],
  }));
}

// ── GitHub issue creation ─────────────────────────────────────────────────────

async function createGitHubIssue({ title, body, labels = [] }) {
  const token = await getGitHubToken();
  const url   = `https://api.github.com/repos/${GITHUB_REPO}/issues`;

  log('info', { action: 'github_issue_create', title, labels, dryRun: DRY_RUN });
  if (DRY_RUN) return { number: 0, url: 'DRY_RUN' };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:        `token ${token}`,
      Accept:               'application/vnd.github+json',
      'Content-Type':       'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Handles evidence block.
function evidenceBlock(evidence) {
  return `\`\`\`json\n${JSON.stringify(evidence, null, 2)}\n\`\`\``;
}

// Handles finding issue body.
function findingIssueBody(finding, extraSteps = '') {
  return [
    `## Security Finding`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| **Check** | \`${finding.checkName}\` |`,
    `| **Resource** | \`${finding.resource}\` |`,
    `| **Severity** | **${finding.severity}** |`,
    `| **Environment** | ${ENVIRONMENT} |`,
    ``,
    `## Description`,
    ``,
    finding.description,
    ``,
    `## Recommendation`,
    ``,
    finding.recommendation,
    ``,
    ...(extraSteps ? [`## Investigation Steps`, ``, extraSteps, ``] : []),
    `## Evidence`,
    ``,
    evidenceBlock(finding.evidence || {}),
    ``,
    `---`,
    `*Detected by CloudOps auto-remediation Lambda. This issue requires human review.*`,
  ].join('\n');
}

// ── Issue handlers — findings that require human approval ─────────────────────

const ISSUE_HANDLERS = {
  // Handles IAM wildcard admin policy.
  async iam_wildcard_admin_policy(finding) {
    const body = findingIssueBody(finding, [
      '1. Identify all principals using this policy (`aws iam list-entities-for-policy --policy-arn <arn>`)',
      '2. Determine the minimum permissions each principal actually needs',
      '3. Create least-privilege replacement policies',
      '4. Attach new policies, detach the wildcard policy',
      '5. Delete the wildcard policy after confirming no breakage',
    ].join('\n'));
    return createGitHubIssue({
      title:  `[SECURITY] CRITICAL: Wildcard IAM policy detected on ${finding.resource}`,
      body,
      labels: ['security', 'critical', 'iam'],
    });
  },

  // Handles RDS publicly accessible.
  async rds_publicly_accessible(finding) {
    const body = findingIssueBody(finding, [
      '1. Identify all clients connecting to the RDS endpoint',
      '2. Verify they can all reach the DB via private networking',
      '3. Schedule a maintenance window — changing PubliclyAccessible causes a brief restart',
      '4. Apply: `aws rds modify-db-instance --db-instance-identifier <id> --no-publicly-accessible --apply-immediately`',
      '5. Validate connectivity from the application after the change',
    ].join('\n'));
    return createGitHubIssue({
      title:  `[SECURITY] CRITICAL: RDS instance ${finding.resource} is publicly accessible`,
      body,
      labels: ['security', 'critical', 'rds'],
    });
  },

  // Handles EKS public endpoint open.
  async eks_public_endpoint_open(finding) {
    const body = findingIssueBody(finding, [
      '1. Collect all CIDR ranges that legitimately need API access (CI/CD IPs, bastion, VPN)',
      '2. Update EKS cluster: `aws eks update-cluster-config --name <cluster> --resources-vpc-config publicAccessCidrs=<cidr1>,<cidr2>`',
      '3. Alternatively, disable the public endpoint entirely and use a bastion or VPN',
      '4. Validate `kubectl` access from expected hosts',
    ].join('\n'));
    return createGitHubIssue({
      title:  `[SECURITY] HIGH: EKS cluster ${finding.resource} has public endpoint open to 0.0.0.0/0`,
      body,
      labels: ['security', 'high', 'eks'],
    });
  },

  // Handles IAM role unused 90 days.
  async iam_role_unused_90_days(finding) {
    const body = findingIssueBody(finding, [
      '1. Check if the role is still referenced in any Terraform or CloudFormation',
      '2. Check if any service or application was recently decommissioned that used this role',
      '3. If unused: `aws iam delete-role --role-name <name>` (detach policies first)',
      '4. If still needed: document its purpose as a tag and add to the suppression list',
    ].join('\n'));
    return createGitHubIssue({
      title:  `[SECURITY] MEDIUM: Unused IAM role detected — ${finding.resource}`,
      body,
      labels: ['security', 'medium', 'iam', 'cleanup'],
    });
  },

  // Handles secrets manager rotation disabled.
  async secrets_manager_rotation_disabled(finding) {
    const body = findingIssueBody(finding, [
      '1. Identify what service/user this secret belongs to',
      '2. Create a rotation Lambda if one does not exist for this secret type',
      '3. Enable rotation: `aws secretsmanager rotate-secret --secret-id <name>`',
      '4. Confirm the application handles rotation gracefully (reads fresh value on each request)',
    ].join('\n'));
    return createGitHubIssue({
      title:  `[SECURITY] LOW: Secret rotation not configured — ${finding.resource}`,
      body,
      labels: ['security', 'low', 'secrets-manager'],
    });
  },

  // Handles secrets manager not accessed 30d.
  async secrets_manager_not_accessed_30d(finding) {
    const body = findingIssueBody(finding, [
      '1. Check CloudTrail for the last GetSecretValue call: filter by `secretsmanager.amazonaws.com`',
      '2. Identify the service or user that should be accessing this secret',
      '3. If orphaned: schedule deletion with a 7-day recovery window',
      '4. If still needed: document the access pattern and update the suppression list',
    ].join('\n'));
    return createGitHubIssue({
      title:  `[SECURITY] MEDIUM: Possible orphaned secret not accessed in 30+ days — ${finding.resource}`,
      body,
      labels: ['security', 'medium', 'secrets-manager', 'cleanup'],
    });
  },
};

// ── Auto-remediation handlers ─────────────────────────────────────────────────

// recordRemediation marks the finding remediated and counts it, but only when
// the change was made. In DRY_RUN nothing was changed, so the finding stays
// open and is not counted; the log says what would have been recorded.
async function recordRemediation(finding, remediationAction) {
  if (DRY_RUN) {
    log('info', { action: 'dry_run_not_recorded', checkName: finding.checkName, resource: finding.resource, remediationAction });
    return;
  }
  const item = await findOpenFinding(finding.checkName, finding.resource);
  await markRemediated(item, remediationAction);
  await publishMetric('AutoRemediations', finding.severity);
}

async function remediateS3PublicAccess(finding) {
  const bucket = finding.resource.replace('s3:::', '');
  log('info', { action: 'remediate_s3_public_access', bucket });

  if (!DRY_RUN) {
    await s3.send(new PutBucketPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls:       true,
        IgnorePublicAcls:      true,
        BlockPublicPolicy:     true,
        RestrictPublicBuckets: true,
      },
    }));
  }

  await recordRemediation(finding, 'PutBucketPublicAccessBlock — all 4 flags set to true');

  log('info', { action: 'remediated', checkName: finding.checkName, resource: finding.resource, result: 'success' });
}

// Handles remediate s3 encryption.
async function remediateS3Encryption(finding) {
  const bucket = finding.resource.replace('s3:::', '');
  log('info', { action: 'remediate_s3_encryption', bucket });

  if (!DRY_RUN) {
    await s3.send(new PutBucketEncryptionCommand({
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [{
          ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
          BucketKeyEnabled: true,
        }],
      },
    }));
  }

  await recordRemediation(finding, 'PutBucketEncryption — AES256 default encryption enabled');

  log('info', { action: 'remediated', checkName: finding.checkName, resource: finding.resource, result: 'success' });
}

// Handles remediate sgingress.
async function remediateSGIngress(finding, port) {
  // Resource format: ec2:security-group:sg-XXXX (name)
  const sgId = finding.resource.match(/ec2:security-group:(sg-[a-z0-9]+)/)?.[1];
  if (!sgId) {
    log('warn', { action: 'remediate_sg_ingress', msg: 'Could not parse SG ID from resource', resource: finding.resource });
    return;
  }

  log('info', { action: 'remediate_sg_ingress', sgId, port });

  if (!DRY_RUN) {
    // Describe to find the exact matching rules (both IPv4 and IPv6)
    const desc = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }));
    const sg   = desc.SecurityGroups?.[0];
    if (!sg) return;

    const matchingRules = (sg.IpPermissions || []).filter(rule => {
      const fromPort = rule.FromPort ?? 0;
      const toPort   = rule.ToPort   ?? 65535;
      const hasPort  = port >= fromPort && port <= toPort;
      const hasOpen  =
        (rule.IpRanges  || []).some(r => r.CidrIp   === '0.0.0.0/0') ||
        (rule.Ipv6Ranges || []).some(r => r.CidrIpv6 === '::/0');
      return hasPort && hasOpen;
    });

    if (matchingRules.length === 0) {
      log('info', { action: 'remediate_sg_ingress', msg: 'No matching rules found — already remediated?', sgId, port });
      return;
    }

    await ec2.send(new RevokeSecurityGroupIngressCommand({
      GroupId:       sgId,
      IpPermissions: matchingRules,
    }));
  }

  await recordRemediation(finding, `RevokeSecurityGroupIngress — removed open ingress on port ${port} from 0.0.0.0/0`);

  log('info', { action: 'remediated', checkName: finding.checkName, resource: finding.resource, port, result: 'success' });
}

// Handles remediate rdsdeletion protection.
async function remediateRDSDeletionProtection(finding) {
  // Only auto-fix in production — other environments don't block deployment anyway
  if (ENVIRONMENT !== 'prod') {
    log('info', { action: 'skip_rds_deletion_protection', reason: 'non-production environment', environment: ENVIRONMENT });
    return;
  }

  const dbId = finding.resource.replace('rds:db:', '');
  log('info', { action: 'remediate_rds_deletion_protection', dbId });

  if (!DRY_RUN) {
    await rds.send(new ModifyDBInstanceCommand({
      DBInstanceIdentifier: dbId,
      DeletionProtection:   true,
      ApplyImmediately:     true,
    }));
  }

  await recordRemediation(finding, 'ModifyDBInstance — DeletionProtection set to true');

  log('info', { action: 'remediated', checkName: finding.checkName, resource: finding.resource, result: 'success' });
}

// ── EKS bearer token (presigned STS GetCallerIdentity) ───────────────────────

async function getEKSBearerToken(clusterName) {
  const credentials = await fromNodeProviderChain()();
  const signer      = new SignatureV4({ credentials, region: REGION, service: 'sts', sha256: Sha256 });

  const request = new HttpRequest({
    method:   'GET',
    hostname: `sts.${REGION}.amazonaws.com`,
    path:     '/',
    query:    { Action: 'GetCallerIdentity', Version: '2011-06-15' },
    headers:  {
      host:          `sts.${REGION}.amazonaws.com`,
      'x-k8s-aws-id': clusterName,
    },
  });

  const { hostname, path, query } = await signer.presign(request, { expiresIn: 60 });
  const qs        = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const signedUrl = `https://${hostname}${path}?${qs}`;
  return 'k8s-aws-v1.' + Buffer.from(signedUrl).toString('base64url');
}

// ── Pod quarantine (Falco CRITICAL findings) ──────────────────────────────────

async function quarantinePod(finding) {
  // Resource format expected from Falco findings: k8s:pod:{namespace}/{podName}
  const resourcePath = finding.resource.replace('k8s:pod:', '');
  const slashIdx     = resourcePath.indexOf('/');
  if (slashIdx === -1) {
    log('warn', { action: 'quarantine_pod', msg: 'Cannot parse namespace/podName from resource', resource: finding.resource });
    return;
  }
  const namespace = resourcePath.slice(0, slashIdx);
  const podName   = resourcePath.slice(slashIdx + 1);

  log('info', { action: 'quarantine_pod', namespace, podName, dryRun: DRY_RUN });

  if (!EKS_CLUSTER_NAME) {
    log('warn', { action: 'quarantine_pod', msg: 'EKS_CLUSTER_NAME not set — cannot quarantine pod' });
    return;
  }

  // Get cluster endpoint and CA
  const clusterInfo = await eks.send(new DescribeClusterCommand({ name: EKS_CLUSTER_NAME }));
  const endpoint    = clusterInfo.cluster?.endpoint;
  const caData      = clusterInfo.cluster?.certificateAuthority?.data;

  if (!endpoint || !caData) {
    log('warn', { action: 'quarantine_pod', msg: 'Could not retrieve EKS cluster endpoint/CA' });
    return;
  }

  const token    = await getEKSBearerToken(EKS_CLUSTER_NAME);
  const caBuffer = Buffer.from(caData, 'base64');

  const k8sHeaders = {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/strategic-merge-patch+json',
    Accept:         'application/json',
  };

  if (!DRY_RUN) {
    // 1. Label the pod with quarantine=true (does NOT delete the pod — preserves for forensics)
    const patchUrl = `${endpoint}/api/v1/namespaces/${namespace}/pods/${podName}`;
    const patchRes = await fetch(patchUrl, {
      method:  'PATCH',
      headers: k8sHeaders,
      body:    JSON.stringify({ metadata: { labels: { quarantine: 'true' } } }),
      // In production, pass the CA cert via agent; simplified here for Lambda portability
    });

    if (!patchRes.ok) {
      const txt = await patchRes.text();
      throw new Error(`K8s patch pod failed ${patchRes.status}: ${txt.slice(0, 200)}`);
    }

    // 2. Apply a NetworkPolicy that blocks all ingress/egress except to forensics namespace
    const npUrl  = `${endpoint}/apis/networking.k8s.io/v1/namespaces/${namespace}/networkpolicies`;
    const npBody = {
      apiVersion: 'networking.k8s.io/v1',
      kind:       'NetworkPolicy',
      metadata:   { name: `quarantine-${podName}`, namespace },
      spec: {
        podSelector: { matchLabels: { quarantine: 'true' } },
        policyTypes: ['Ingress', 'Egress'],
        ingress:     [],   // block all ingress
        egress: [{
          to: [{
            namespaceSelector: {
              matchLabels: { 'kubernetes.io/metadata.name': 'forensics' },
            },
          }],
        }],
      },
    };

    const npRes = await fetch(npUrl, {
      method:  'POST',
      headers: { ...k8sHeaders, 'Content-Type': 'application/json' },
      body:    JSON.stringify(npBody),
    });

    if (!npRes.ok) {
      const txt = await npRes.text();
      // 409 Conflict means policy already exists — not an error
      if (npRes.status !== 409) {
        log('warn', { action: 'quarantine_network_policy', msg: `NetworkPolicy create ${npRes.status}: ${txt.slice(0, 200)}` });
      }
    }
  }

  // 3. Publish a CRITICAL CloudWatch alarm metric
  await publishMetric('FalcoCriticalQuarantine', 'CRITICAL');

  // 4. Create a GitHub issue immediately
  const issue = await createGitHubIssue({
    title:  `[SECURITY] CRITICAL: Falco pod quarantined — ${namespace}/${podName}`,
    body: [
      `## Falco Runtime Threat Detected`,
      ``,
      `A pod has been **quarantined** after a Falco CRITICAL finding. The pod has been labelled`,
      `\`quarantine=true\` and isolated by NetworkPolicy. **It has NOT been deleted** — pod state`,
      `is preserved for forensic analysis.`,
      ``,
      `| Field | Value |`,
      `|---|---|`,
      `| **Pod** | \`${namespace}/${podName}\` |`,
      `| **Check** | \`${finding.checkName}\` |`,
      `| **Environment** | ${ENVIRONMENT} |`,
      ``,
      `## Finding Details`,
      ``,
      finding.description,
      ``,
      `## Forensic Steps`,
      ``,
      `1. \`kubectl exec -n ${namespace} ${podName} -- ps aux\` — check running processes`,
      `2. \`kubectl logs -n ${namespace} ${podName} --previous\` — review container stdout`,
      `3. \`kubectl describe pod -n ${namespace} ${podName}\` — inspect events`,
      `4. Pull Falco logs from Loki: \`{namespace="falco"} |= "${podName}"\``,
      `5. Review pod's egress connections via VPC Flow Logs`,
      `6. After investigation, delete the pod: \`kubectl delete pod -n ${namespace} ${podName}\``,
      `7. Remove the quarantine NetworkPolicy: \`kubectl delete networkpolicy -n ${namespace} quarantine-${podName}\``,
      ``,
      `## Evidence`,
      ``,
      evidenceBlock(finding.evidence || {}),
    ].join('\n'),
    labels: ['security', 'critical', 'falco', 'incident'],
  });

  log('info', {
    action:    'quarantine_complete',
    namespace, podName,
    issueUrl:  issue.url,
    result:    'success',
  });
}

// ── Main router ───────────────────────────────────────────────────────────────

// Maps checkName → handler. Handlers return a promise.
const AUTO_REMEDIATE = {
  s3_public_access_block_disabled:  (f) => remediateS3PublicAccess(f),
  s3_encryption_disabled:           (f) => remediateS3Encryption(f),
  sg_ssh_open_to_world:             (f) => remediateSGIngress(f, 22),
  sg_rdp_open_to_world:             (f) => remediateSGIngress(f, 3389),
  rds_deletion_protection_disabled: (f) => remediateRDSDeletionProtection(f),
};

const GITHUB_ISSUE = {
  iam_wildcard_admin_policy:        (f) => ISSUE_HANDLERS.iam_wildcard_admin_policy(f),
  rds_publicly_accessible:          (f) => ISSUE_HANDLERS.rds_publicly_accessible(f),
  eks_public_endpoint_open:         (f) => ISSUE_HANDLERS.eks_public_endpoint_open(f),
  iam_role_unused_90_days:          (f) => ISSUE_HANDLERS.iam_role_unused_90_days(f),
  secrets_manager_rotation_disabled:(f) => ISSUE_HANDLERS.secrets_manager_rotation_disabled(f),
  secrets_manager_not_accessed_30d: (f) => ISSUE_HANDLERS.secrets_manager_not_accessed_30d(f),
};

// Handles route finding.
async function routeFinding(finding) {
  const { checkName, severity, findingSource } = finding;

  // Quarantine path — Falco CRITICAL findings
  if (findingSource === 'falco' && severity === 'CRITICAL') {
    log('info', { action: 'route', path: 'quarantine', checkName, severity });
    await quarantinePod(finding);
    return;
  }

  // Auto-remediation path
  if (AUTO_REMEDIATE[checkName]) {
    log('info', { action: 'route', path: 'auto_remediate', checkName, severity });
    try {
      await AUTO_REMEDIATE[checkName](finding);
    } catch (err) {
      log('error', { action: 'auto_remediate_failed', checkName, error: err.message });
      await publishMetric('RemediationFailures', severity);
      // Fall through to create a GitHub issue so the failure is tracked
      await createGitHubIssue({
        title: `[SECURITY] Auto-remediation failed: ${checkName} on ${finding.resource}`,
        body:  findingIssueBody(finding,
          `Auto-remediation attempted but failed with error:\n\n\`\`\`\n${err.message}\n\`\`\`\n\nManual intervention required.`
        ),
        labels: ['security', severity.toLowerCase(), 'remediation-failed'],
      }).catch(ghErr => log('warn', { action: 'github_issue_failed', error: ghErr.message }));
    }
    return;
  }

  // GitHub issue path — requires human approval
  if (GITHUB_ISSUE[checkName]) {
    log('info', { action: 'route', path: 'github_issue', checkName, severity });
    try {
      const issue = await GITHUB_ISSUE[checkName](finding);
      log('info', { action: 'github_issue_created', checkName, issueNumber: issue?.number, issueUrl: issue?.url });
    } catch (err) {
      log('error', { action: 'github_issue_failed', checkName, error: err.message });
    }
    return;
  }

  // Unknown finding — log and skip
  log('info', { action: 'route', path: 'unhandled', checkName, severity, msg: 'No handler registered for this checkName' });
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler(event) {
  const records = event.Records || [];
  log('info', { msg: 'Auto-remediation invoked', recordCount: records.length });

  const results = await Promise.allSettled(
    records.map(async (record) => {
      let finding;
      try {
        finding = JSON.parse(record.Sns?.Message || '{}');
      } catch (err) {
        log('error', { msg: 'Failed to parse SNS message', error: err.message, raw: record.Sns?.Message?.slice(0, 200) });
        return;
      }

      log('info', {
        msg:       'Processing finding',
        checkName: finding.checkName,
        resource:  finding.resource,
        severity:  finding.severity,
      });

      await routeFinding(finding);
    })
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    failures.forEach(f => log('error', { msg: 'Record processing failed', error: f.reason?.message }));
  }

  log('info', {
    msg:      'Auto-remediation complete',
    total:    records.length,
    failures: failures.length,
  });

  return { statusCode: 200, processed: records.length, failures: failures.length };
};
