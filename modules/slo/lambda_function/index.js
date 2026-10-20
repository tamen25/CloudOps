// This file contains index logic for SLO lambda function.
'use strict';

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const http = require('http');

// ── Environment ──────────────────────────────────────────────────────────────

const REGION                   = process.env.AWS_REGION || 'us-east-1';
const PROMETHEUS_URL            = process.env.PROMETHEUS_URL || '';
const GRAFANA_API_KEY_SECRET_ARN = process.env.GRAFANA_API_KEY_SECRET_ARN || '';
const SLO_AVAILABILITY_TARGET   = parseFloat(process.env.SLO_AVAILABILITY_TARGET || '0.999');
const SLO_LATENCY_TARGET        = parseFloat(process.env.SLO_LATENCY_TARGET || '0.95');
const DYNAMODB_TABLE            = process.env.DYNAMODB_TABLE || 'cloudops-error-budgets';
const ENVIRONMENT               = process.env.ENVIRONMENT || 'dev';

// ── AWS clients — constructed once per container, reused across warm invocations ─

const cwClient  = new CloudWatchClient({ region: REGION });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddb       = DynamoDBDocumentClient.from(ddbClient);
const smClient  = new SecretsManagerClient({ region: REGION });

// ── Module-scope API key cache — survives warm Lambda invocations ─────────────
// Avoids a Secrets Manager round-trip on every 5-minute execution.

let cachedGrafanaApiKey = null;

// Gets grafana API key.
async function getGrafanaApiKey() {
  if (cachedGrafanaApiKey !== null) return cachedGrafanaApiKey;
  if (!GRAFANA_API_KEY_SECRET_ARN) return null;

  const response = await smClient.send(
    new GetSecretValueCommand({ SecretId: GRAFANA_API_KEY_SECRET_ARN }),
  );
  cachedGrafanaApiKey = response.SecretString;
  return cachedGrafanaApiKey;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

// An instant query for one series answers in well under a kilobyte.
const MAX_RESPONSE_BYTES = 1024 * 1024;

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_RESPONSE_BYTES) req.destroy(new Error(`response from ${url} over ${MAX_RESPONSE_BYTES} bytes`));
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse failed: ${e.message}. Body: ${data.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} from ${url}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Request timed out after 10s')));
  });
}

// ── Prometheus query ──────────────────────────────────────────────────────────

async function queryPrometheus(query, apiKey) {
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const body = await httpGet(url, headers);

  if (body.status !== 'success') {
    throw new Error(`Prometheus query failed: ${body.error || JSON.stringify(body)}`);
  }

  const results = body.data && body.data.result;
  if (!results || results.length === 0) return null;

  const val = parseFloat(results[0].value[1]);
  return Number.isFinite(val) ? val : null;
}

// ── Structured logger ─────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler() {
  const timestamp = new Date().toISOString();
  // TTL: 90 days from now in epoch seconds — DynamoDB auto-expires the item
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

  // Fetch Grafana API key from Secrets Manager (cached after first call)
  let apiKey = null;
  try {
    apiKey = await getGrafanaApiKey();
  } catch (err) {
    log('warn', { msg: 'Failed to fetch Grafana API key — proceeding without auth', error: err.message });
  }

  // ── Query Prometheus recording rules ────────────────────────────────────────
  let availability5m, availability1h, availability6h, latency5m, budgetRemaining;

  try {
    [availability5m, availability1h, availability6h, latency5m, budgetRemaining] = await Promise.all([
      queryPrometheus('job:slo_availability:ratio_rate5m{job="order-api"}',  apiKey),
      queryPrometheus('job:slo_availability:ratio_rate1h{job="order-api"}',  apiKey),
      queryPrometheus('job:slo_availability:ratio_rate6h{job="order-api"}',  apiKey),
      queryPrometheus('job:slo_latency:ratio_rate5m{job="order-api"}',       apiKey),
      // The budget over the SLO window, as recorded for the Prometheus budget
      // alerts (modules/observability/slo.tf), so CloudWatch, the deploy gate
      // and the alerts agree.
      queryPrometheus('job:slo_error_budget:availability_remaining{service="order-api"}', apiKey),
    ]);
  } catch (err) {
    log('warn', {
      msg: 'Prometheus unreachable — recording the failed collection and returning',
      prometheusUrl: PROMETHEUS_URL,
      error: err.message,
    });

    // A failed collection is its own metric. It used to be written as -1 into
    // ErrorBudgetRemaining, where it read as "budget exhausted" and would have
    // blocked deploys whenever Prometheus was down.
    await cwClient.send(new PutMetricDataCommand({
      Namespace: 'CloudOps/SLO',
      MetricData: [{
        MetricName: 'SLOCollectionFailed',
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [
          { Name: 'Service',     Value: 'order-api' },
          { Name: 'Environment', Value: ENVIRONMENT },
        ],
      }],
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'prometheus_unreachable', timestamp }),
    };
  }

  // ── Availability error budget calculations ───────────────────────────────────
  // Error budget = allowed error fraction = 1 - SLO target
  const availErrorBudget = 1 - SLO_AVAILABILITY_TARGET;

  const errorRate1h = availability1h != null ? 1 - availability1h : null;
  const errorRate6h = availability6h != null ? 1 - availability6h : null;

  // 1.0 = full budget, 0.0 = exhausted, negative = SLO breached. It used to be
  // computed from the 5-minute error rate, so one bad five minutes read as an
  // exhausted budget and could block deploys.
  const errorBudgetRemainingFraction = budgetRemaining;
  const errorBudgetRemainingPercent = errorBudgetRemainingFraction != null
    ? errorBudgetRemainingFraction * 100
    : null;

  // Burn rate: how fast the error budget is being consumed relative to the allowed rate
  const burnRate1h = errorRate1h != null ? errorRate1h / availErrorBudget : null;
  const burnRate6h = errorRate6h != null ? errorRate6h / availErrorBudget : null;

  // Projected exhaustion: hours until budget runs out at current 1h burn rate
  // Formula: (budget_fraction_remaining / burn_rate) * 30 days * 24 hours
  const projectedExhaustionHours =
    errorBudgetRemainingFraction != null && burnRate1h != null && burnRate1h > 0
      ? (errorBudgetRemainingFraction / burnRate1h) * 30 * 24
      : null;

  const result = {
    slo:                      'availability',
    errorBudgetRemaining:     errorBudgetRemainingPercent,
    burnRate1h,
    burnRate6h,
    projectedExhaustionHours,
    availabilitySLI:          availability5m,
    latencySLI:               latency5m,
    timestamp,
  };

  log('info', result);

  // ── Publish metrics to CloudWatch ────────────────────────────────────────────
  const dimensions = [
    { Name: 'Service',     Value: 'order-api' },
    { Name: 'Environment', Value: ENVIRONMENT },
  ];

  const metricData = [
    availability5m != null && {
      MetricName: 'AvailabilitySLI',
      Value:      availability5m * 100,
      Unit:       'Percent',
    },
    latency5m != null && {
      MetricName: 'LatencySLI',
      Value:      latency5m * 100,
      Unit:       'Percent',
    },
    errorBudgetRemainingPercent != null && {
      MetricName: 'ErrorBudgetRemaining',
      Value:      errorBudgetRemainingPercent,
      Unit:       'Percent',
    },
    burnRate1h != null && {
      MetricName: 'BurnRate1h',
      Value:      burnRate1h,
      Unit:       'None',
    },
    burnRate6h != null && {
      MetricName: 'BurnRate6h',
      Value:      burnRate6h,
      Unit:       'None',
    },
  ]
    .filter(Boolean)
    .map((m) => ({ ...m, Timestamp: new Date(), Dimensions: dimensions }));

  if (metricData.length > 0) {
    await cwClient.send(new PutMetricDataCommand({
      Namespace:  'CloudOps/SLO',
      MetricData: metricData,
    }));
  }

  // ── Store snapshot in DynamoDB ────────────────────────────────────────────────
  await ddb.send(new PutCommand({
    TableName: DYNAMODB_TABLE,
    Item: {
      slo_name:                  'order-api-availability',
      timestamp,
      ttl,
      error_budget_remaining:    errorBudgetRemainingPercent,
      burn_rate_1h:              burnRate1h,
      burn_rate_6h:              burnRate6h,
      projected_exhaustion_hours: projectedExhaustionHours,
      availability_sli:          availability5m,
      latency_sli:               latency5m,
      environment:               ENVIRONMENT,
    },
  }));

  return { statusCode: 200, body: JSON.stringify(result) };
};
