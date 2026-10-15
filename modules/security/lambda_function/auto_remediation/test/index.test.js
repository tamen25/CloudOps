// Auto-remediation changes resources anywhere in the account (ADR 009), so
// these tests pin down what it changes and when. Every AWS client and
// node-fetch are replaced by fakes that record each call; nothing reaches AWS.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

const CLIENTS = {
  '@aws-sdk/client-s3': 'S3Client',
  '@aws-sdk/client-ec2': 'EC2Client',
  '@aws-sdk/client-rds': 'RDSClient',
  '@aws-sdk/client-eks': 'EKSClient',
  '@aws-sdk/client-secrets-manager': 'SecretsManagerClient',
  '@aws-sdk/lib-dynamodb': 'DynamoDBDocumentClient',
  '@aws-sdk/client-sns': 'SNSClient',
  '@aws-sdk/client-cloudwatch': 'CloudWatchClient',
};

const MUTATING_AWS = new Set([
  'PutBucketPublicAccessBlockCommand', 'PutBucketEncryptionCommand', 'RevokeSecurityGroupIngressCommand',
  'ModifyDBInstanceCommand', 'UpdateCommand',
]);

const ENV_KEYS = ['DRY_RUN', 'ENVIRONMENT', 'EKS_CLUSTER_NAME', 'GITHUB_REPO', 'GITHUB_TOKEN_SECRET_ARN'];

// load returns the Lambda's handler, freshly required with env and fakes, and
// the list every call is recorded in. aws: command name -> function(input).
function load({ env = {}, aws = {} } = {}) {
  const calls = [];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    EKS_CLUSTER_NAME: 'test-cluster', ...env,
  });
  const responders = {
    QueryCommand: () => ({ Items: [{ finding_id: 'f-1', timestamp: '2026-10-16T00:00:00Z' }] }),
    DescribeClusterCommand: () => ({ cluster: { endpoint: 'https://k8s.test', certificateAuthority: { data: 'Y2E=' } } }),
    GetSecretValueCommand: () => ({ SecretString: 'token' }),
    ...aws,
  };
  for (const [mod, cls] of Object.entries(CLIENTS)) {
    const Client = require(require.resolve(mod, { paths: [DIR] }))[cls];
    Client.prototype.send = async function send(command) {
      const name = command.constructor.name;
      calls.push({ kind: 'aws', name, input: command.input });
      return responders[name] ? responders[name](command.input) : {};
    };
  }
  const fetchPath = require.resolve('node-fetch', { paths: [DIR] });
  require.cache[fetchPath] = {
    id: fetchPath, filename: fetchPath, loaded: true,
    exports: async (url, opts = {}) => {
      calls.push({ kind: 'http', method: opts.method || 'GET', url, body: opts.body && JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ number: 1, html_url: 'https://github.test/1' }), text: async () => '' };
    },
  };
  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const finding = (f) => ({ Records: [{ Sns: { Message: JSON.stringify({ severity: 'HIGH', ...f }) } }] });

const mutations = (calls) => calls.filter((c) =>
  (c.kind === 'aws' && MUTATING_AWS.has(c.name)) || (c.kind === 'http' && c.method !== 'GET' && !c.url.includes('api.github.com')));

const FINDINGS = [
  { checkName: 's3_public_access_block_disabled', resource: 's3:::logs-bucket' },
  { checkName: 's3_encryption_disabled', resource: 's3:::logs-bucket' },
  { checkName: 'sg_ssh_open_to_world', resource: 'ec2:security-group:sg-0abc (web)' },
  { checkName: 'rds_deletion_protection_disabled', resource: 'rds:db:orders' },
  { checkName: 'x', findingSource: 'falco', severity: 'CRITICAL', resource: 'k8s:pod:cloudops/order-api-1', description: 'shell spawned' },
];

// DRY_RUN changes nothing, and marks nothing remediated: a finding that was
// not fixed stays open. It used to be marked REMEDIATED and counted anyway.
test('DRY_RUN changes nothing and leaves findings open', async () => {
  for (const f of FINDINGS) {
    const { handler, calls } = load({ env: { DRY_RUN: 'true', ENVIRONMENT: 'prod' } });
    await handler(finding(f));
    assert.deepEqual(mutations(calls), [], `${f.checkName} changed something in DRY_RUN`);
    assert.ok(!calls.some((c) => c.name === 'PutMetricDataCommand' && JSON.stringify(c.input).includes('AutoRemediations')),
      `${f.checkName} counted a remediation in DRY_RUN`);
  }
});

test('an open SSH rule is revoked, and only rules open to the world on that port', async () => {
  const rules = [
    { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
    { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '10.0.0.0/16' }] },
    { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] },
  ];
  const { handler, calls } = load({ aws: { DescribeSecurityGroupsCommand: () => ({ SecurityGroups: [{ IpPermissions: rules }] }) } });
  await handler(finding({ checkName: 'sg_ssh_open_to_world', resource: 'ec2:security-group:sg-0abc (web)' }));
  const revoke = calls.find((c) => c.name === 'RevokeSecurityGroupIngressCommand');
  assert.deepEqual(revoke?.input, { GroupId: 'sg-0abc', IpPermissions: [rules[0]] });
  assert.ok(calls.some((c) => c.name === 'UpdateCommand'), 'finding marked remediated');
});

test('RDS deletion protection is switched on in prod only', async () => {
  for (const [environment, expected] of [['prod', 1], ['dev', 0]]) {
    const { handler, calls } = load({ env: { ENVIRONMENT: environment } });
    await handler(finding({ checkName: 'rds_deletion_protection_disabled', resource: 'rds:db:orders' }));
    assert.equal(calls.filter((c) => c.name === 'ModifyDBInstanceCommand').length, expected, environment);
  }
});

// ADR 009: a Falco CRITICAL finding quarantines the pod (label plus a
// NetworkPolicy) and never deletes it, so the evidence survives.
test('a Falco CRITICAL finding quarantines the pod without deleting it', async () => {
  const { handler, calls } = load();
  await handler(finding(FINDINGS[4]));
  const http = calls.filter((c) => c.kind === 'http' && !c.url.includes('api.github.com'));
  assert.deepEqual(http.map((c) => c.method), ['PATCH', 'POST']);
  assert.deepEqual(http[0].body, { metadata: { labels: { quarantine: 'true' } } });
  assert.equal(http[1].body.kind, 'NetworkPolicy');
  assert.ok(!calls.some((c) => c.method === 'DELETE'), 'nothing deleted');
});

test('a finding with no handler changes nothing', async () => {
  const { handler, calls } = load();
  await handler(finding({ checkName: 'something_new', resource: 's3:::x' }));
  assert.deepEqual(mutations(calls), []);
});
