// The compliance scanner reads the account and keeps the findings table in
// step with it: new findings are written and alerted on, ones seen again
// are refreshed, and ones no longer reported are resolved. Every AWS client
// is replaced by a fake that records each call; nothing reaches AWS.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

const CLIENTS = {
  '@aws-sdk/client-ec2': 'EC2Client',
  '@aws-sdk/client-rds': 'RDSClient',
  '@aws-sdk/client-s3': 'S3Client',
  '@aws-sdk/client-iam': 'IAMClient',
  '@aws-sdk/client-eks': 'EKSClient',
  '@aws-sdk/client-secrets-manager': 'SecretsManagerClient',
  '@aws-sdk/lib-dynamodb': 'DynamoDBDocumentClient',
  '@aws-sdk/client-sns': 'SNSClient',
  '@aws-sdk/client-cloudwatch': 'CloudWatchClient',
};

// An account that passes every check.
const CLEAN = {
  GetPublicAccessBlockCommand: () => ({
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
  }),
  GetBucketEncryptionCommand: () => ({}),
  GetBucketVersioningCommand: () => ({ Status: 'Enabled' }),
  DescribeDBInstancesCommand: () => ({
    DBInstances: [{ StorageEncrypted: true, DeletionProtection: true, BackupRetentionPeriod: 7, MultiAZ: true, PerformanceInsightsEnabled: true }],
  }),
  DescribeClusterCommand: () => ({
    cluster: {
      version: '1.33',
      logging: { clusterLogging: [{ enabled: true, types: ['api', 'audit', 'authenticator', 'controllerManager', 'scheduler'] }] },
      resourcesVpcConfig: { endpointPublicAccess: false },
      identity: { oidc: { issuer: 'https://oidc.eks.test/id/X' } },
    },
  }),
  DescribeClusterVersionsCommand: () => ({ clusterVersions: [{ clusterVersion: '1.33', versionStatus: 'STANDARD_SUPPORT' }] }),
  DescribeSecurityGroupsCommand: () => ({ SecurityGroups: [] }),
  ListPoliciesCommand: () => ({ Policies: [] }),
  ListRolesCommand: () => ({ Roles: [] }),
  GetAccountSummaryCommand: () => ({ SummaryMap: { AccountAccessKeysPresent: 0 } }),
  ListSecretsCommand: () => ({ SecretList: [] }),
  QueryCommand: () => ({ Items: [] }),
};

// load returns the scanner's handler, freshly required with fakes, and the
// list every call is recorded in. aws: command name -> function(input),
// over CLEAN; a function may throw to simulate an API error.
function load(aws = {}) {
  const calls = [];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    ENVIRONMENT: 'prod', VPC_ID: 'vpc-1', RDS_INSTANCE_ID: 'orders', EKS_CLUSTER_NAME: 'c1',
    STATE_BUCKET_NAME: 'cloudops-tfstate', SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:findings',
  });
  const responders = { ...CLEAN, ...aws };
  for (const [mod, cls] of Object.entries(CLIENTS)) {
    const Client = require(require.resolve(mod, { paths: [DIR] }))[cls];
    Client.prototype.send = async function send(command) {
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      return responders[name] ? responders[name](command.input) : {};
    };
  }
  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const fail = (name) => () => { const e = new Error(name); e.name = name; throw e; };
const written = (calls) => calls.filter((c) => c.name === 'PutCommand').map((c) => c.input.Item.check_name);
const resolved = (calls) => calls.filter((c) => c.name === 'UpdateCommand' && c.input.ExpressionAttributeValues?.[':resolved'])
  .map((c) => c.input.Key.finding_id);
const open = (...items) => () => ({
  Items: items.map(([id, check, resource]) => ({ finding_id: id, timestamp: 't0', check_name: check, resource, status: 'OPEN' })),
});

test('an account that passes every check produces no findings', async () => {
  const { handler, calls } = load();
  const res = JSON.parse((await handler()).body);
  assert.equal(res.totalFindings, 0);
  assert.deepEqual(written(calls), []);
});

// The runbook (compliance-critical-finding.md) says a finding is resolved
// when the next scan passes the check. It was never resolved.
test('an open finding the scan no longer reports is resolved', async () => {
  const { handler, calls } = load({ QueryCommand: open(['f-1', 's3_encryption_disabled', 's3:::cloudops-tfstate']) });
  await handler();
  assert.deepEqual(resolved(calls), ['f-1']);
  const update = calls.find((c) => c.name === 'UpdateCommand');
  assert.equal(update.input.ConditionExpression, '#s = :open', 'only an OPEN finding is resolved');
});

test('an API error is not a pass: that suite resolves nothing', async () => {
  const { handler, calls } = load({
    QueryCommand: open(['f-1', 's3_encryption_disabled', 's3:::cloudops-tfstate'], ['f-2', 'rds_multi_az_disabled', 'rds:db:orders']),
    GetBucketEncryptionCommand: fail('AccessDenied'),
    DescribeDBInstancesCommand: fail('Throttling'),
  });
  await handler();
  assert.deepEqual(resolved(calls), []);
});

test('findings other writers put in the table are left alone', async () => {
  const { handler, calls } = load({ QueryCommand: open(['kb-1', 'kube_bench', 'k8s:node:n1:4.2.1']) });
  await handler();
  assert.deepEqual(resolved(calls), []);
});

test('a new HIGH finding is written and alerted on; one seen again is refreshed only', async () => {
  const { handler, calls } = load({
    QueryCommand: open(['f-1', 'rds_multi_az_disabled', 'rds:db:orders']),
    DescribeDBInstancesCommand: () => ({
      DBInstances: [{ StorageEncrypted: true, DeletionProtection: false, BackupRetentionPeriod: 7, MultiAZ: false, PerformanceInsightsEnabled: true }],
    }),
  });
  await handler();
  assert.deepEqual(written(calls), ['rds_deletion_protection_disabled']);
  const refresh = calls.find((c) => c.name === 'UpdateCommand' && c.input.Key.finding_id === 'f-1');
  assert.match(refresh.input.UpdateExpression, /occurrence_count = occurrence_count \+ :one/);
  const alerts = calls.filter((c) => c.name === 'PublishCommand').map((c) => JSON.parse(c.input.Message).checkName);
  assert.deepEqual(alerts, ['rds_deletion_protection_disabled']);
});

test('security groups: ports open to the world are found; ICMP type and code are not ports', async () => {
  const rule = (IpProtocol, FromPort, ToPort) => ({ IpProtocol, FromPort, ToPort, IpRanges: [{ CidrIp: '0.0.0.0/0' }] });
  const sg = (id, ...rules) => ({ GroupId: id, GroupName: id, IpPermissions: rules });
  const { handler, calls } = load({
    DescribeSecurityGroupsCommand: () => ({
      SecurityGroups: [
        sg('sg-icmp', rule('icmp', 3, 4), rule('icmp', -1, -1)),
        sg('sg-web', rule('tcp', 443, 443), rule('tcp', 80, 80)),
        sg('sg-ssh', rule('tcp', 22, 22)),
        sg('sg-all', { IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }),
      ],
    }),
  });
  await handler();
  const found = calls.filter((c) => c.name === 'PutCommand').map((c) => `${c.input.Item.resource.split(':').pop()} ${c.input.Item.check_name}`);
  assert.deepEqual(found.sort(), [
    'sg-all sg_postgres_open_to_world', 'sg-all sg_privileged_port_open_to_world', 'sg-all sg_rdp_open_to_world', 'sg-all sg_ssh_open_to_world',
    'sg-ssh sg_privileged_port_open_to_world', 'sg-ssh sg_ssh_open_to_world',
  ]);
});

// The check called GetBucketPublicAccessBlockCommand, which the SDK does not
// export; it threw on every run and was logged as a warning, so a public
// bucket was never found.
test('a bucket without a full public access block is a finding', async () => {
  for (const [why, responder] of [
    ['one flag off', () => ({ PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: false, RestrictPublicBuckets: true } })],
    ['no configuration', fail('NoSuchPublicAccessBlockConfiguration')],
  ]) {
    const { handler, calls } = load({ GetPublicAccessBlockCommand: responder });
    await handler();
    assert.deepEqual(written(calls), ['s3_public_access_block_disabled'], why);
  }
});

test('an EKS version out of standard support is a finding', async () => {
  for (const [status, expected] of [['STANDARD_SUPPORT', []], ['EXTENDED_SUPPORT', ['eks_version_outdated']]]) {
    const { handler, calls } = load({ DescribeClusterVersionsCommand: () => ({ clusterVersions: [{ versionStatus: status }] }) });
    await handler();
    assert.deepEqual(written(calls), expected, status);
  }
});

test('an IAM policy granting * on * is found', async () => {
  const doc = encodeURIComponent(JSON.stringify({ Statement: { Effect: 'Allow', Action: '*', Resource: '*' } }));
  const { handler, calls } = load({
    ListPoliciesCommand: () => ({ Policies: [{ PolicyName: 'too-much', Arn: 'arn:aws:iam::1:policy/too-much', DefaultVersionId: 'v1' }] }),
    GetPolicyVersionCommand: () => ({ PolicyVersion: { Document: doc } }),
  });
  await handler();
  assert.deepEqual(written(calls), ['iam_wildcard_admin_policy']);
});
