// The scale-in scheduler patches an HPA's minReplicas back to the baseline
// after a scale-out. These tests pin down what it patches and when; the AWS
// clients and node-fetch are fakes, so nothing reaches AWS or a cluster.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

function load(env = {}) {
  const calls = [];
  for (const k of ['DRY_RUN', 'BASELINE_MIN_PODS']) delete process.env[k];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    EKS_CLUSTER_NAME: 'test-cluster', ...env,
  });
  for (const [mod, cls] of [['@aws-sdk/client-eks', 'EKSClient'], ['@aws-sdk/client-cloudwatch', 'CloudWatchClient']]) {
    require(require.resolve(mod, { paths: [DIR] }))[cls].prototype.send = async function send(command) {
      calls.push({ name: command.constructor.name });
      return command.constructor.name === 'DescribeClusterCommand'
        ? { cluster: { endpoint: 'https://k8s.test', certificateAuthority: { data: 'Y2E=' } } }
        : {};
    };
  }
  const fetchPath = require.resolve('node-fetch', { paths: [DIR] });
  require.cache[fetchPath] = {
    id: fetchPath, filename: fetchPath, loaded: true,
    exports: async (url, opts = {}) => {
      calls.push({ method: opts.method, url, body: opts.body && JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    },
  };
  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const patches = (calls) => calls.filter((c) => c.method === 'PATCH');

test('the HPA minimum goes back to the baseline', async () => {
  const { handler, calls } = load({ BASELINE_MIN_PODS: '2' });
  await handler({});
  const [patch] = patches(calls);
  assert.equal(patch.url, 'https://k8s.test/apis/autoscaling/v2/namespaces/cloudops/horizontalpodautoscalers/order-api');
  assert.deepEqual(patch.body, { spec: { minReplicas: 2 } });
});

test('DRY_RUN patches nothing', async () => {
  const { handler, calls } = load({ DRY_RUN: 'true' });
  await handler({ targetMin: 3 });
  assert.deepEqual(patches(calls), []);
});

// The event's names go into the API URL, and 0 would scale the service away.
test('an event naming something other than an object, or a minimum below 1, is refused', async () => {
  for (const event of [
    { namespace: '../kube-system' }, { hpaName: 'order-api/../../x' }, { hpaName: 'Order_API' },
    { targetMin: 0 }, { targetMin: -1 }, { targetMin: 2.5 }, { targetMin: '3' },
  ]) {
    const { handler, calls } = load();
    await assert.rejects(handler(event), undefined, JSON.stringify(event));
    assert.deepEqual(patches(calls), [], `${JSON.stringify(event)} was patched`);
  }
});
