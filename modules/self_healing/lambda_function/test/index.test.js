// The self-healing controller changes live resources, so these tests pin down
// what it changes and when. Every AWS client and node-fetch are replaced by
// fakes that record each call; nothing reaches AWS or a cluster.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

const CLIENTS = {
  '@aws-sdk/client-cloudwatch': 'CloudWatchClient',
  '@aws-sdk/client-eks': 'EKSClient',
  '@aws-sdk/client-auto-scaling': 'AutoScalingClient',
  '@aws-sdk/client-rds': 'RDSClient',
  '@aws-sdk/client-secrets-manager': 'SecretsManagerClient',
  '@aws-sdk/client-sns': 'SNSClient',
};

// Calls that change something. Everything else only reads or reports.
const MUTATING_AWS = new Set([
  'UpdateAutoScalingGroupCommand', 'SetDesiredCapacityCommand', 'StartInstanceRefreshCommand', 'RebootDBInstanceCommand',
]);

const ENV_KEYS = ['DRY_RUN', 'EKS_CLUSTER_NAME', 'GITHUB_REPO', 'GITHUB_TOKEN_SECRET_ARN', 'SNS_TOPIC_ARN',
  'MAX_SCALE_OUT_PODS', 'MIN_HEALTHY_PODS', 'ROLLBACK_ON_ERROR_RATE', 'ROLLBACK_SETTLE_MS'];

// load returns the controller's handler, freshly required with env and fakes,
// and the list every call is recorded in.
//   metrics: CloudWatch metric name -> value for the last 5 minutes
//   k8s:     "GET /path" -> response body (a path not listed answers 404)
//   aws:     command name -> function(input) returning the response
function load({ env = {}, metrics = {}, k8s = {}, aws = {} } = {}) {
  const calls = [];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    EKS_CLUSTER_NAME: 'test-cluster', SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:healing',
    ROLLBACK_SETTLE_MS: '0', ...env,
  });

  const responders = {
    DescribeClusterCommand: () => ({ cluster: { endpoint: 'https://k8s.test', certificateAuthority: { data: 'Y2E=' } } }),
    GetMetricDataCommand: (input) => {
      const name = input.MetricDataQueries[0].MetricStat.Metric.MetricName;
      return { MetricDataResults: [{ Values: name in metrics ? [metrics[name]] : [] }] };
    },
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
      const method = opts.method || 'GET';
      const p = url.replace('https://k8s.test', '');
      calls.push({ kind: 'http', method, path: p, body: opts.body && JSON.parse(opts.body) });
      const body = method === 'GET' ? k8s[`GET ${p}`] : {};
      const ok = body !== undefined;
      return { ok, status: ok ? 200 : 404, json: async () => body, text: async () => 'not found' };
    },
  };

  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const alarm = (name, state = 'ALARM') => ({
  Records: [{ Sns: { Message: JSON.stringify({ AlarmName: name, NewStateValue: state }) } }],
});

const mutations = (calls) => calls.filter((c) =>
  (c.kind === 'aws' && MUTATING_AWS.has(c.name)) || (c.kind === 'http' && c.method !== 'GET'));

const DEPLOYMENT = 'GET /apis/apps/v1/namespaces/cloudops/deployments/order-api';
const HPA = 'GET /apis/autoscaling/v2/namespaces/cloudops/horizontalpodautoscalers/order-api';
const NODES = 'GET /api/v1/nodes';

const ROLLBACKABLE = {
  [DEPLOYMENT]: {
    metadata: { annotations: { 'deployment.kubernetes.io/revision': '3' } },
    spec: { selector: { matchLabels: { app: 'order-api' } }, template: { spec: { containers: [{ image: 'app:v3' }] } } },
  },
  'GET /apis/apps/v1/namespaces/cloudops/replicasets?labelSelector=app%3Dorder-api': {
    items: [{
      metadata: { name: 'order-api-2', annotations: { 'deployment.kubernetes.io/revision': '2' } },
      spec: { template: { spec: { containers: [{ image: 'app:v2' }] } } },
    }],
  },
};

const ALARMS = ['order-api-high-error-rate', 'order-api-high-latency', 'order-api-pod-count-low',
  'rds-high-connections', 'rds-high-cpu', 'rds-low-storage', 'eks-node-not-ready'];

// DRY_RUN is how a new environment is validated before the controller may act
// (ADR 009): every alarm, in its worst state, changes nothing.
test('DRY_RUN changes nothing, whatever the alarm', async () => {
  for (const name of ALARMS) {
    const { handler, calls } = load({
      env: { DRY_RUN: 'true', GITHUB_REPO: 'o/r', GITHUB_TOKEN_SECRET_ARN: 'arn:secret' },
      metrics: { HTTPCode_Target_5XX_Count: 500, RequestCount: 1000 },
      k8s: { [NODES]: { items: [{ metadata: { name: 'n1' }, status: { conditions: [{ type: 'Ready', status: 'False' }] } }] } },
      aws: { GetSecretValueCommand: () => ({ SecretString: 'token' }) },
    });
    await handler(alarm(`cloudops-dev-${name}`));
    assert.deepEqual(mutations(calls), [], `${name} changed something in DRY_RUN`);
    assert.ok(!calls.some((c) => c.kind === 'http' && c.path.includes('api.github.com')), `${name} called GitHub`);
  }
});

test('an alarm leaving the ALARM state is ignored', async () => {
  const { handler, calls } = load({ metrics: { HTTPCode_Target_5XX_Count: 500, RequestCount: 1000 } });
  await handler(alarm('cloudops-dev-order-api-high-error-rate', 'OK'));
  assert.deepEqual(calls, []);
});

// A rollback needs both a high rate and enough errors to trust it. 10 errors
// in a million requests (0.001%) used to trigger one.
test('a rollback needs the error rate over the threshold and enough errors', async () => {
  for (const [errors, requests, why] of [[10, 1_000_000, 'tiny rate, enough errors'], [3, 4, 'high rate, too few errors']]) {
    const { handler, calls } = load({ metrics: { HTTPCode_Target_5XX_Count: errors, RequestCount: requests }, k8s: ROLLBACKABLE });
    await handler(alarm('cloudops-dev-order-api-high-error-rate'));
    assert.deepEqual(mutations(calls), [], `rolled back on ${why}`);
  }
});

test('a high error rate rolls the deployment back to the previous ReplicaSet', async () => {
  const { handler, calls } = load({ metrics: { HTTPCode_Target_5XX_Count: 200, RequestCount: 1000 }, k8s: ROLLBACKABLE });
  await handler(alarm('cloudops-dev-order-api-high-error-rate'));
  const patch = mutations(calls).find((c) => c.path.endsWith('/deployments/order-api'));
  assert.equal(patch?.body.spec.template.spec.containers[0].image, 'app:v2');
  const summary = JSON.parse(calls.find((c) => c.name === 'PublishCommand').input.Message);
  assert.equal(summary.result, 'rollback_triggered');
});

// The summary says what happened: no history to roll back to is a failure,
// not "rollback_triggered".
test('a rollback that cannot happen is reported as failed', async () => {
  const { handler, calls } = load({
    metrics: { HTTPCode_Target_5XX_Count: 200, RequestCount: 1000 },
    k8s: { [DEPLOYMENT]: { metadata: { annotations: { 'deployment.kubernetes.io/revision': '1' } }, spec: { template: {} } } },
  });
  await handler(alarm('cloudops-dev-order-api-high-error-rate'));
  const summary = JSON.parse(calls.find((c) => c.name === 'PublishCommand').input.Message);
  assert.equal(summary.result, 'rollback_failed');
});

test('scale-out never goes past MAX_SCALE_OUT_PODS', async () => {
  const { handler, calls } = load({ env: { MAX_SCALE_OUT_PODS: '10' }, k8s: { [HPA]: { spec: { minReplicas: 9 } } } });
  await handler(alarm('cloudops-dev-order-api-high-latency'));
  const patch = mutations(calls).find((c) => c.path.endsWith('/horizontalpodautoscalers/order-api'));
  assert.equal(patch?.body.spec.minReplicas, 10);
});

test('a stuck HPA gets the deployment patched to MIN_HEALTHY_PODS', async () => {
  const { handler, calls } = load({
    env: { MIN_HEALTHY_PODS: '3' },
    k8s: { [HPA]: { status: { desiredReplicas: 5, currentReplicas: 1 } }, [NODES]: { items: [] } },
  });
  await handler(alarm('cloudops-dev-order-api-pod-count-low'));
  const patch = mutations(calls).find((c) => c.path.endsWith('/deployments/order-api'));
  assert.equal(patch?.body.spec.replicas, 3);
});

// One NotReady node refreshes only the node group that owns it. Refreshing
// every group would replace healthy nodes too.
test('a NotReady node refreshes only its own node group', async () => {
  const node = (name, ready, group) => ({
    metadata: { name, labels: { 'eks.amazonaws.com/nodegroup': group } },
    status: { conditions: [{ type: 'Ready', status: ready }] },
  });
  const { handler, calls } = load({
    k8s: {
      [NODES]: { items: [node('n1', 'True', 'ng-a'), node('n2', 'False', 'ng-b')] },
      'GET /api/v1/namespaces/cloudops/pods?fieldSelector=spec.nodeName=n2': { items: [] },
    },
    aws: {
      ListNodegroupsCommand: () => ({ nodegroups: ['ng-a', 'ng-b'] }),
      DescribeAutoScalingGroupsCommand: (input) => ({ AutoScalingGroups: [{ AutoScalingGroupName: `asg-${input.Filters[0].Values[0]}` }] }),
    },
  });
  await handler(alarm('cloudops-dev-eks-node-not-ready'));
  const refreshed = calls.filter((c) => c.name === 'StartInstanceRefreshCommand').map((c) => c.input.AutoScalingGroupName);
  assert.deepEqual(refreshed, ['asg-ng-b']);
  assert.ok(calls.some((c) => c.method === 'PATCH' && c.path === '/api/v1/nodes/n2'), 'n2 cordoned');
});
