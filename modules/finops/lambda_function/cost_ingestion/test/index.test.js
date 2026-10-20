// Cost ingestion turns Cost Explorer data into the FinOps metrics, the
// per-service history and the budget alert. Cost Explorer, DynamoDB,
// CloudWatch and SNS are fakes; the clock is fixed so dates are stable.
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const DIR = path.resolve(__dirname, '..');
const INDEX = path.join(DIR, 'index.js');

const CLIENTS = {
  '@aws-sdk/client-cost-explorer': 'CostExplorerClient',
  '@aws-sdk/lib-dynamodb': 'DynamoDBDocumentClient',
  '@aws-sdk/client-cloudwatch': 'CloudWatchClient',
  '@aws-sdk/client-sns': 'SNSClient',
};

// load fixes the clock at `now` and returns the handler and recorded calls.
//   services: service -> yesterday's cost
//   history:  "service date" -> stored daily cost
function load(t, { now = '2026-10-16T06:00:00Z', services = {}, mtd = 0, forecast = null, history = {}, budget = '100' } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  const calls = [];
  Object.assign(process.env, {
    AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIATESTTESTTESTTEST', AWS_SECRET_ACCESS_KEY: 'test',
    SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:finops', COST_BUDGET_MONTHLY_USD: budget, COST_ANOMALY_THRESHOLD_PERCENT: '20',
  });
  const responders = {
    GetCostAndUsageCommand: (input) => input.Granularity === 'MONTHLY'
      ? { ResultsByTime: [{ Total: { BlendedCost: { Amount: String(mtd) } } }] }
      : { ResultsByTime: [{ Groups: Object.entries(services).map(([k, v]) => ({ Keys: [k], Metrics: { BlendedCost: { Amount: String(v), Unit: 'USD' } } })) }] },
    GetCostForecastCommand: () => {
      if (forecast === null) { const e = new Error('DataUnavailableException'); e.name = 'DataUnavailableException'; throw e; }
      return { Total: { Amount: String(forecast) } };
    },
    GetAnomaliesCommand: () => ({ Anomalies: [] }),
    GetCommand: (input) => {
      const v = history[`${input.Key.service} ${input.Key.date}`];
      return v === undefined ? {} : { Item: { daily_cost: v } };
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

const metric = (calls, name) => calls.filter((c) => c.name === 'PutMetricDataCommand')
  .flatMap((c) => c.input.MetricData).find((m) => m.MetricName === name)?.Value;
const alert = (calls) => calls.find((c) => c.name === 'PublishCommand');
const week = (service, cost, before = '2026-10-15') => Object.fromEntries(
  Array.from({ length: 7 }, (_, i) => [`${service} ${new Date(Date.parse(before) - (i + 1) * 86_400_000).toISOString().slice(0, 10)}`, cost]));

// The forecast covers today to the end of the month. Compared alone to the
// monthly budget, $60 spent plus $50 still to come read as $50 projected.
test('the projection is the month so far plus the forecast for the rest of it', async (t) => {
  const { handler, calls } = load(t, { mtd: 60, forecast: 50 });
  await handler();
  assert.equal(metric(calls, 'ProjectedMonthlyCost'), 110);
  assert.match(JSON.parse(alert(calls).input.Message).anomalies[0].recommendation, /Projected monthly cost \$110\.00 exceeds budget \$100\.00/);
});

test('without a forecast nothing is projected', async (t) => {
  const { handler, calls } = load(t, { mtd: 10 });
  await handler();
  assert.equal(metric(calls, 'ProjectedMonthlyCost'), undefined);
  assert.equal(alert(calls), undefined);
});

test('a service is anomalous only over the threshold, with enough history and enough cost', async (t) => {
  const { handler, calls } = load(t, {
    services: { EC2: 13, S3: 11, Lambda: 0.4, New: 50 },
    history: { ...week('EC2', 10), ...week('S3', 10), ...week('Lambda', 0.1) },
  });
  await handler();
  const found = JSON.parse(alert(calls).input.Message).anomalies.map((a) => a.service);
  // EC2 +30%; S3 +10% is under 20%; Lambda +300% but under $0.50; New has no history.
  assert.deepEqual(found, ['EC2']);
});

test('a budget alert with no anomalies says so in its subject', async (t) => {
  const { handler, calls } = load(t, { mtd: 85 });
  await handler();
  assert.equal(alert(calls).input.Subject, '[WARNING] CloudOps FinOps: Monthly budget at 85.0%');
});

test('on the first of the month there is no month-to-date query', async (t) => {
  const { handler, calls } = load(t, { now: '2026-11-01T06:00:00Z' });
  await handler();
  assert.ok(!calls.some((c) => c.name === 'GetCostAndUsageCommand' && c.input.Granularity === 'MONTHLY'));
  assert.equal(metric(calls, 'MonthToDateCost'), 0);
});
