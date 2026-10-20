// The kube-bench processor turns a CIS benchmark report into findings: FAIL
// and WARN results open or refresh one, and a check that passes again
// closes it. DynamoDB and CloudWatch are fakes; nothing reaches AWS.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

function load({ open = [] } = {}) {
  const calls = [];
  Object.assign(process.env, { AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test' });
  for (const [mod, cls] of [['@aws-sdk/lib-dynamodb', 'DynamoDBDocumentClient'], ['@aws-sdk/client-cloudwatch', 'CloudWatchClient']]) {
    require(require.resolve(mod, { paths: [DIR] }))[cls].prototype.send = async function send(command) {
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      if (name === 'QueryCommand') {
        return { Items: open.map(([id, checkId]) => ({ finding_id: id, timestamp: 't0', check_name: 'kube_bench', check_id: checkId, resource: `eks:benchmark:c1:${checkId}`, status: 'OPEN' })) };
      }
      return {};
    };
  }
  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const report = (...results) => ({
  Controls: [{ id: '3', tests: [{ section: '3.2', desc: 'Kubelet', results: results.map(([n, status]) => ({ test_number: n, test_desc: `check ${n}`, status })) }] }],
  Totals: { total_fail: results.filter(([, s]) => s === 'FAIL').length },
});
const put = (calls) => calls.filter((c) => c.name === 'PutCommand').map((c) => [c.input.Item.check_id, c.input.Item.severity]);
const resolved = (calls) => calls.filter((c) => c.name === 'UpdateCommand' && c.input.ExpressionAttributeValues[':resolved'])
  .map((c) => c.input.Key.finding_id);

test('FAIL and WARN results become findings; PASS, INFO and NOT_CHECKED do not', async () => {
  const { handler, calls } = load();
  await handler({ clusterName: 'c1', kubeBenchOutput: report(['3.2.1', 'FAIL'], ['3.2.2', 'WARN'], ['3.2.3', 'PASS'], ['3.2.4', 'INFO'], ['3.2.5', 'NOT_CHECKED']) });
  assert.deepEqual(put(calls), [['3.2.1', 'HIGH'], ['3.2.2', 'MEDIUM']]);
});

test('a check that still fails refreshes its open finding instead of adding one', async () => {
  const { handler, calls } = load({ open: [['f-1', '3.2.1']] });
  await handler({ clusterName: 'c1', kubeBenchOutput: report(['3.2.1', 'FAIL']) });
  assert.deepEqual(put(calls), []);
  assert.match(calls.find((c) => c.name === 'UpdateCommand').input.UpdateExpression, /occurrence_count/);
});

// Findings never closed: a fixed check stayed OPEN until its TTL.
test('a check that passes again closes its finding; one not evaluated does not', async () => {
  const { handler, calls } = load({ open: [['f-1', '3.2.1'], ['f-2', '3.2.2']] });
  await handler({ clusterName: 'c1', kubeBenchOutput: report(['3.2.1', 'PASS'], ['3.2.2', 'NOT_CHECKED']) });
  assert.deepEqual(resolved(calls), ['f-1']);
  assert.equal(calls.find((c) => c.name === 'UpdateCommand').input.ConditionExpression, '#s = :open');
});

test('an event without the report or the cluster name is refused', async () => {
  const { handler } = load();
  await assert.rejects(handler({ clusterName: 'c1' }), /kubeBenchOutput/);
  await assert.rejects(handler({ kubeBenchOutput: report() }), /clusterName/);
});

// A run checks one node; the finding says which.
test('a finding records the node kube-bench read', async () => {
  const { handler, calls } = load();
  await handler({ clusterName: 'c1', nodeName: 'ip-10-0-1-5.ec2.internal', kubeBenchOutput: report(['3.2.1', 'FAIL']) });
  assert.equal(calls.find((c) => c.name === 'PutCommand').input.Item.evidence.node, 'ip-10-0-1-5.ec2.internal');
});
