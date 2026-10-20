// The idle detector estimates what idle capacity costs and alerts over $5 a
// day. It only reads; these tests pin down when something counts as idle and
// what it is said to cost. Every AWS client is a fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

const CLIENTS = {
  '@aws-sdk/client-cloudwatch': 'CloudWatchClient',
  '@aws-sdk/client-rds': 'RDSClient',
  '@aws-sdk/client-eks': 'EKSClient',
  '@aws-sdk/lib-dynamodb': 'DynamoDBDocumentClient',
  '@aws-sdk/client-sns': 'SNSClient',
};

// load returns the handler and recorded calls.
//   node:   { cpu, mem } cluster averages (null = no data)
//   groups: [[desiredSize, instanceType], ...]
//   pods:   [[label, avg], ...] for the pod rightsizing search
function load({ node = { cpu: null, mem: null }, groups = [], pods = [], rds = {} } = {}) {
  const calls = [];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    EKS_CLUSTER_NAME: 'c1', RDS_INSTANCE_ID: 'orders', SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:finops', ENVIRONMENT: 'dev',
  });
  const series = (v) => (v === null ? [] : [v]);
  const responders = {
    GetMetricDataCommand: (input) => {
      const q = input.MetricDataQueries;
      if (q[0].Id === 'avg_cpu') return { MetricDataResults: [{ Id: 'avg_cpu', Values: series(node.cpu) }, { Id: 'avg_mem', Values: series(node.mem) }] };
      return { MetricDataResults: pods.map(([label, avg], i) => ({ Id: `pod_cpu_${i}`, Label: label, Values: [avg] })) };
    },
    GetMetricStatisticsCommand: (input) => {
      const v = rds[input.MetricName];
      return { Datapoints: v === undefined ? [] : [{ Average: v }] };
    },
    DescribeDBInstancesCommand: () => ({ DBInstances: [{ DBInstanceClass: rds.class || 'db.t3.medium' }] }),
    ListNodegroupsCommand: () => ({ nodegroups: groups.map((_, i) => `ng-${i}`) }),
    DescribeNodegroupCommand: (input) => {
      const [size, type] = groups[Number(input.nodegroupName.split('-')[1])];
      return { nodegroup: { scalingConfig: { desiredSize: size }, instanceTypes: [type] } };
    },
  };
  for (const [mod, cls] of Object.entries(CLIENTS)) {
    require(require.resolve(mod, { paths: [DIR] }))[cls].prototype.send = async function send(command) {
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      return responders[name] ? responders[name](command.input) : {};
    };
  }
  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const run = async (opts) => {
  const { handler, calls } = load(opts);
  const summary = JSON.parse((await handler()).body);
  const stored = calls.find((c) => c.name === 'PutCommand')?.input.Item.idle_resources || [];
  return { summary, stored, calls };
};

// CPU busy and memory light is not idle: the nodes are needed for the CPU.
test('nodes are idle only when every measured resource is under the threshold', async () => {
  for (const [node, idle] of [[{ cpu: 80, mem: 5 }, false], [{ cpu: 5, mem: 80 }, false], [{ cpu: 5, mem: 8 }, true], [{ cpu: 5, mem: null }, true]]) {
    const { summary } = await run({ node, groups: [[2, 't3.large']] });
    assert.equal(summary.eksNodeIdle, idle, JSON.stringify(node));
  }
});

// Every node used to be priced at the last group's instance type.
test('waste is priced per node group, and an unpriced type is named, not guessed', async () => {
  const { stored } = await run({ node: { cpu: 0, mem: 0 }, groups: [[2, 't3.large'], [1, 'm5.xlarge'], [3, 'g5.xlarge']] });
  const eks = stored.find((f) => f.resourceType === 'EKS_NODES');
  // (2 x 0.0832 + 1 x 0.192) x 24, fully idle; the g5 group is not priced.
  assert.ok(Math.abs(eks.wastedDailyCostUsd - (2 * 0.0832 + 0.192) * 24) < 1e-9);
  assert.equal(eks.nodeCount, 6);
  assert.match(eks.recommendation, /Not priced \(instance type not in the table\): g5\.xlarge/);
});

// A failed describe used to become "2 nodes".
test('a node group that cannot be described fails the check instead of inventing a count', async () => {
  const { handler, calls } = load({ node: { cpu: 1, mem: 1 }, groups: [[2, 't3.large']] });
  require(require.resolve('@aws-sdk/client-eks', { paths: [DIR] })).EKSClient.prototype.send = async () => { throw new Error('AccessDenied'); };
  const summary = JSON.parse((await handler()).body);
  assert.equal(summary.eksNodeIdle, false);
  assert.ok(!calls.some((c) => c.name === 'PublishCommand'));
});

test('an idle RDS instance of a class with no price has no cost, not a micro price', async () => {
  const { stored } = await run({ rds: { CPUUtilization: 1, DatabaseConnections: 0, class: 'db.m7g.large' } });
  assert.equal(stored.find((f) => f.resourceType === 'RDS_INSTANCE').wastedDailyCostUsd, 0);
});

test('pods are read against their own limit and named by their label', async () => {
  const { stored, calls } = await run({ pods: [['order-api', 7], ['pricing', 55]] });
  const query = calls.find((c) => c.name === 'GetMetricDataCommand' && c.input.MetricDataQueries[0].Id === 'pod_cpu').input.MetricDataQueries[0];
  assert.match(query.Expression, /MetricName="pod_cpu_utilization_over_pod_limit"/);
  assert.equal(query.Label, "${PROP('Dim.PodName')}");
  assert.deepEqual(stored.filter((f) => f.resourceType === 'EKS_POD').map((f) => f.podName), ['order-api']);
});

test('an alert goes out only over $5 a day of waste', async () => {
  for (const [groups, alerted] of [[[[1, 't3.nano']], false], [[[10, 'm5.xlarge']], true]]) {
    const { calls } = await run({ node: { cpu: 1, mem: 1 }, groups });
    assert.equal(calls.some((c) => c.name === 'PublishCommand'), alerted, JSON.stringify(groups));
  }
});
