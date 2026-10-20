// The SLO Lambda turns Prometheus recording rules into CloudWatch metrics.
// ErrorBudgetRemaining gates deploys (app.yml, scripts/deploy.sh), so it has
// to mean the budget over the SLO window. Prometheus, CloudWatch and
// DynamoDB are fakes; nothing leaves the process.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

// load returns the handler and the recorded calls. prometheus maps a query
// (or the start of one) to its value; 'unreachable' makes every query fail,
// and a string body is returned as the raw response.
function load({ prometheus = {}, body } = {}) {
  const calls = [];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    PROMETHEUS_URL: 'http://prometheus.test:9090', SLO_AVAILABILITY_TARGET: '0.999', ENVIRONMENT: 'dev',
  });
  for (const [mod, cls] of [['@aws-sdk/client-cloudwatch', 'CloudWatchClient'], ['@aws-sdk/lib-dynamodb', 'DynamoDBDocumentClient']]) {
    require(require.resolve(mod, { paths: [DIR] }))[cls].prototype.send = async function send(command) {
      calls.push({ name: command.constructor.name, input: command.input });
      return {};
    };
  }
  const get = (url, opts, cb) => {
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.destroy = (err) => { req.destroyed = true; process.nextTick(() => req.emit('error', err)); };
    process.nextTick(() => {
      if (prometheus === 'unreachable') return req.emit('error', new Error('ECONNREFUSED'));
      const query = decodeURIComponent(new URL(url).searchParams.get('query'));
      const key = Object.keys(prometheus).find((k) => query.startsWith(k));
      const res = new EventEmitter();
      res.statusCode = 200;
      cb(res);
      const payload = body ?? JSON.stringify({ status: 'success', data: { result: key ? [{ value: [0, String(prometheus[key])] }] : [] } });
      for (let i = 0; i < payload.length && !req.destroyed; i += 65536) res.emit('data', payload.slice(i, i + 65536));
      if (!req.destroyed) res.emit('end');
    });
    return req;
  };
  http.get = get;
  https.get = get;
  delete require.cache[INDEX];
  return { handler: require(INDEX).handler, calls };
}

const metrics = (calls) => Object.fromEntries(calls.filter((c) => c.name === 'PutMetricDataCommand')
  .flatMap((c) => c.input.MetricData).map((m) => [m.MetricName, m.Value]));

// One bad five minutes (99% available against a 99.9% target) used to read
// as -900% budget remaining. The budget is the windowed rule's value.
test('budget remaining is the SLO-window budget, not the last five minutes', async () => {
  const { handler, calls } = load({
    prometheus: { 'job:slo_availability:ratio_rate5m': 0.99, 'job:slo_error_budget:availability_remaining': 0.8 },
  });
  await handler();
  assert.equal(metrics(calls).ErrorBudgetRemaining, 80);
  assert.equal(metrics(calls).AvailabilitySLI, 99);
});

test('burn rate is the error rate over the allowed error rate', async () => {
  const { handler, calls } = load({
    prometheus: { 'job:slo_availability:ratio_rate1h': 0.99, 'job:slo_availability:ratio_rate6h': 0.9995, 'job:slo_error_budget:availability_remaining': 0.5 },
  });
  const body = JSON.parse((await handler()).body);
  assert.ok(Math.abs(metrics(calls).BurnRate1h - 10) < 1e-9);
  assert.ok(Math.abs(metrics(calls).BurnRate6h - 0.5) < 1e-9);
  // Half the budget left at 10x burn: 30 days / 10 * 0.5 = 36 hours.
  assert.ok(Math.abs(body.projectedExhaustionHours - 36) < 1e-9);
});

// A Prometheus outage used to be written as ErrorBudgetRemaining = -1,
// which reads as "budget exhausted" to the deploy gate.
test('Prometheus unreachable is recorded as a failed collection, not as a budget', async () => {
  const { handler, calls } = load({ prometheus: 'unreachable' });
  await handler();
  assert.deepEqual(metrics(calls), { SLOCollectionFailed: 1 });
});

test('a response over the size bound is refused', async () => {
  const { handler, calls } = load({ body: 'x'.repeat(2 * 1024 * 1024) });
  await handler();
  assert.deepEqual(metrics(calls), { SLOCollectionFailed: 1 });
});

test('no budget data publishes no budget', async () => {
  const { handler, calls } = load({ prometheus: { 'job:slo_availability:ratio_rate5m': 0.9999 } });
  await handler();
  assert.ok(!('ErrorBudgetRemaining' in metrics(calls)));
});
