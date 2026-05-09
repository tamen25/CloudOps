// This file contains index logic for lambda function cost ingestion.
'use strict';

const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand, GetAnomaliesCommand } = require('@aws-sdk/client-cost-explorer');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// ── Environment ───────────────────────────────────────────────────────────────

const REGION             = process.env.AWS_REGION                   || 'us-east-1';
const ENVIRONMENT        = process.env.ENVIRONMENT                  || 'dev';
const PROJECT_NAME       = process.env.PROJECT_NAME                 || 'cloudops';
const DYNAMODB_TABLE     = process.env.DYNAMODB_TABLE               || 'cloudops-cost-data';
const SNS_TOPIC_ARN      = process.env.SNS_TOPIC_ARN                || '';
const ANOMALY_THRESHOLD  = parseFloat(process.env.COST_ANOMALY_THRESHOLD_PERCENT || '20');
const MONTHLY_BUDGET_USD = parseFloat(process.env.COST_BUDGET_MONTHLY_USD        || '50');
const AWS_ACCOUNT_ID     = process.env.AWS_ACCOUNT_ID               || '';

// ── AWS clients — constructed once per container ──────────────────────────────
// Cost Explorer is a global service — always us-east-1 regardless of Lambda region.

const ce        = new CostExplorerClient({ region: 'us-east-1' });
const ddbClient = new DynamoDBClient({ region: REGION });
const ddb       = DynamoDBDocumentClient.from(ddbClient);
const cw        = new CloudWatchClient({ region: REGION });
const sns       = new SNSClient({ region: REGION });

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(level, data) {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...data }));
}

/** Format a Date as YYYY-MM-DD */
function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** Return a date N days before `base` (default: today) */
function daysAgo(n, base = new Date()) {
  return new Date(base.getTime() - n * 86_400_000);
}

// ── Cost Explorer queries ─────────────────────────────────────────────────────

/**
 * Fetch yesterday's blended cost and usage, grouped by SERVICE.
 * Optionally filters to a single linked account to avoid cross-account noise.
 */
async function fetchYesterdayCosts() {
  const yesterday = daysAgo(1);
  const start     = dateStr(yesterday);
  const end       = dateStr(new Date());   // exclusive upper bound

  const params = {
    TimePeriod:  { Start: start, End: end },
    Granularity: 'DAILY',
    GroupBy:     [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    Metrics:     ['BlendedCost', 'UsageQuantity'],
  };

  if (AWS_ACCOUNT_ID) {
    params.Filter = {
      Dimensions: { Key: 'LINKED_ACCOUNT', Values: [AWS_ACCOUNT_ID] },
    };
  }

  const r       = await ce.send(new GetCostAndUsageCommand(params));
  const result  = (r.ResultsByTime || [])[0];
  if (!result) return { date: start, services: [] };

  const services = (result.Groups || []).map(g => ({
    service:        g.Keys[0],
    daily_cost:     parseFloat(g.Metrics.BlendedCost?.Amount   || '0'),
    usage_quantity: parseFloat(g.Metrics.UsageQuantity?.Amount || '0'),
    unit:           g.Metrics.BlendedCost?.Unit || 'USD',
  }));

  return { date: start, services };
}

/** Fetch month-to-date total blended cost (single MONTHLY bucket). */
async function fetchMtdCost() {
  const now            = new Date();
  const firstOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
  const start          = dateStr(firstOfMonth);
  const end            = dateStr(now);

  if (start === end) return 0; // first day of month — no data yet

  const r = await ce.send(new GetCostAndUsageCommand({
    TimePeriod:  { Start: start, End: end },
    Granularity: 'MONTHLY',
    Metrics:     ['BlendedCost'],
  }));

  return parseFloat(r.ResultsByTime?.[0]?.Total?.BlendedCost?.Amount || '0');
}

/**
 * Fetch end-of-month cost forecast.
 * Returns null if today is the last day of the month (no future window).
 */
async function fetchForecast() {
  const now          = new Date();
  const today        = dateStr(now);
  // First day of next month = exclusive end bound for this month's forecast
  const firstOfNext  = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const forecastEnd  = dateStr(firstOfNext);

  if (today >= forecastEnd) return null;

  try {
    const r = await ce.send(new GetCostForecastCommand({
      TimePeriod:  { Start: today, End: forecastEnd },
      Metric:      'BLENDED_COST',
      Granularity: 'MONTHLY',
    }));
    return parseFloat(r.Total?.Amount || '0');
  } catch (err) {
    log('warn', { msg: 'Cost forecast unavailable', error: err.message });
    return null;
  }
}

/** Fetch AWS-native Cost Anomaly Detector anomalies for the last 7 days. */
async function fetchCeAnomalies() {
  try {
    const r = await ce.send(new GetAnomaliesCommand({
      DateInterval: {
        StartDate: dateStr(daysAgo(7)),
        EndDate:   dateStr(new Date()),
      },
    }));
    return r.Anomalies || [];
  } catch (err) {
    log('warn', { msg: 'Failed to fetch CE anomalies', error: err.message });
    return [];
  }
}

// ── DynamoDB helpers ──────────────────────────────────────────────────────────

/**
 * Fetch a single service+date record. Returns the stored daily_cost or null.
 * Used for WoW / MoM comparisons and 7-day average calculation.
 */
async function getHistoricalCost(service, date) {
  try {
    const r = await ddb.send(new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key:       { service, date },
    }));
    return r.Item?.daily_cost ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * Upsert a service cost record.
 * Updates daily_cost and usage_quantity if the record already exists (same-day
 * re-run), otherwise inserts a new item.
 */
async function upsertCostRecord({ service, date, daily_cost, usage_quantity, unit }) {
  const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

  const existing = await ddb.send(new GetCommand({
    TableName: DYNAMODB_TABLE,
    Key:       { service, date },
  }));

  if (existing.Item) {
    await ddb.send(new UpdateCommand({
      TableName:                 DYNAMODB_TABLE,
      Key:                       { service, date },
      UpdateExpression:          'SET daily_cost = :c, usage_quantity = :uq, #ttl = :ttl, updated_at = :ts',
      ExpressionAttributeNames:  { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':c': daily_cost, ':uq': usage_quantity, ':ttl': ttl, ':ts': new Date().toISOString() },
    }));
  } else {
    await ddb.send(new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        service,
        date,
        daily_cost,
        usage_quantity,
        unit,
        ttl,
        created_at:   new Date().toISOString(),
        environment:  ENVIRONMENT,
        project_name: PROJECT_NAME,
      },
    }));
  }
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

/**
 * Detect cost spikes per service by comparing today's cost against the
 * 7-day rolling average stored in DynamoDB.
 * Only reports if the service cost increased more than ANOMALY_THRESHOLD %
 * AND the absolute cost is ≥ $0.50 (avoids noise on fractional-cent services).
 */
async function detectServiceAnomalies(services, yesterday) {
  const anomalies = [];

  for (const svc of services) {
    const historicalCosts = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const d = dateStr(daysAgo(i + 1, new Date(yesterday)));
        return getHistoricalCost(svc.service, d);
      }),
    );

    const valid  = historicalCosts.filter(c => c !== null && c > 0);
    if (valid.length < 3) continue; // Not enough history to establish a baseline

    const avg7d     = valid.reduce((a, b) => a + b, 0) / valid.length;
    const pctChange = ((svc.daily_cost - avg7d) / avg7d) * 100;

    if (pctChange > ANOMALY_THRESHOLD && svc.daily_cost >= 0.50) {
      anomalies.push({
        service:       svc.service,
        currentCost:   svc.daily_cost,
        expectedCost:  avg7d,
        percentChange: pctChange,
        recommendation: `Review recent changes to ${svc.service} — cost increased ${pctChange.toFixed(1)}% vs 7-day average ($${avg7d.toFixed(2)}/day).`,
      });
    }
  }

  return anomalies;
}

// ── CloudWatch metrics ────────────────────────────────────────────────────────

async function publishMetrics({ totalDailyCost, mtdCost, projectedMonthly, budgetUtilization, anomalyCount, topServices }) {
  const dims = [{ Name: 'Environment', Value: ENVIRONMENT }];
  const ts   = new Date();

  const metricData = [
    { MetricName: 'DailyCost',              Value: totalDailyCost,    Unit: 'None',    Dimensions: dims },
    { MetricName: 'MonthToDateCost',         Value: mtdCost,           Unit: 'None',    Dimensions: dims },
    { MetricName: 'BudgetUtilizationPercent', Value: budgetUtilization, Unit: 'Percent', Dimensions: dims },
    { MetricName: 'CostAnomaliesDetected',   Value: anomalyCount,      Unit: 'Count',   Dimensions: dims },
  ];

  if (projectedMonthly !== null) {
    metricData.push({ MetricName: 'ProjectedMonthlyCost', Value: projectedMonthly, Unit: 'None', Dimensions: dims });
  }

  // Per-service cost metrics (CloudWatch dimension values max 256 chars)
  for (const svc of topServices) {
    metricData.push({
      MetricName: 'ServiceDailyCost',
      Value:      svc.daily_cost,
      Unit:       'None',
      Dimensions: [...dims, { Name: 'Service', Value: svc.service.slice(0, 256) }],
    });
  }

  // CloudWatch accepts at most 20 metric data points per PutMetricData call
  for (let i = 0; i < metricData.length; i += 20) {
    await cw.send(new PutMetricDataCommand({
      Namespace:  'CloudOps/FinOps',
      MetricData: metricData.slice(i, i + 20).map(m => ({ ...m, Timestamp: ts })),
    }));
  }
}

// ── SNS alert ─────────────────────────────────────────────────────────────────

async function publishAlert(serviceAnomalies, projectedMonthly, budgetUtilization) {
  if (!SNS_TOPIC_ARN) return;

  const isOverBudget = budgetUtilization >= 100;
  const subject      = isOverBudget
    ? `[CRITICAL] CloudOps FinOps: Monthly budget exceeded (${budgetUtilization.toFixed(1)}%)`
    : `[WARNING] CloudOps FinOps: ${serviceAnomalies.length} cost anomal${serviceAnomalies.length === 1 ? 'y' : 'ies'} detected`;

  await sns.send(new PublishCommand({
    TopicArn: SNS_TOPIC_ARN,
    Subject:  subject,
    Message:  JSON.stringify({
      environment:             ENVIRONMENT,
      projectName:             PROJECT_NAME,
      budgetUtilizationPercent: budgetUtilization,
      monthlyBudgetUsd:        MONTHLY_BUDGET_USD,
      projectedMonthlyCost:    projectedMonthly,
      anomalies:               serviceAnomalies,
      timestamp:               new Date().toISOString(),
    }, null, 2),
    MessageAttributes: {
      severity: {
        DataType:    'String',
        StringValue: isOverBudget ? 'CRITICAL' : 'WARNING',
      },
    },
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function handler() {
  const startTime = Date.now();
  log('info', { msg: 'Cost ingestion started', environment: ENVIRONMENT, projectName: PROJECT_NAME });

  // 1. Fetch all Cost Explorer data in parallel
  const [yesterdayData, mtdCost, projectedMonthly, ceAnomalies] = await Promise.all([
    fetchYesterdayCosts(),
    fetchMtdCost(),
    fetchForecast(),
    fetchCeAnomalies(),
  ]);

  const { date: yesterday, services } = yesterdayData;
  const totalDailyCost = services.reduce((sum, s) => sum + s.daily_cost, 0);

  // 2. Persist per-service records (upsert — idempotent on re-run)
  await Promise.all(
    services.map(s =>
      upsertCostRecord({ ...s, date: yesterday }).catch(err =>
        log('warn', { msg: 'Failed to persist service cost', service: s.service, error: err.message }),
      ),
    ),
  );

  // 3. WoW and MoM change percentages (total daily cost)
  const wowDate  = dateStr(daysAgo(7, new Date(yesterday)));
  // Handles mom date.
  const momDate  = (() => { const d = new Date(yesterday); d.setMonth(d.getMonth() - 1); return dateStr(d); })();

  const [wowCosts, momCosts] = await Promise.all([
    Promise.all(services.map(s => getHistoricalCost(s.service, wowDate).then(c => c || 0))),
    Promise.all(services.map(s => getHistoricalCost(s.service, momDate).then(c => c || 0))),
  ]);

  const totalWow      = wowCosts.reduce((a, b) => a + b, 0);
  const totalMom      = momCosts.reduce((a, b) => a + b, 0);
  const wowChangePct  = totalWow > 0 ? ((totalDailyCost - totalWow) / totalWow) * 100 : null;
  const momChangePct  = totalMom > 0 ? ((totalDailyCost - totalMom) / totalMom) * 100 : null;

  // 4. Detect service-level cost anomalies vs 7-day average
  const serviceAnomalies = await detectServiceAnomalies(services, yesterday);

  // 5. Over-budget projection alert (add synthetic anomaly if projected > budget)
  const budgetUtilization = MONTHLY_BUDGET_USD > 0 ? (mtdCost / MONTHLY_BUDGET_USD) * 100 : 0;

  if (projectedMonthly !== null && projectedMonthly > MONTHLY_BUDGET_USD && serviceAnomalies.length === 0) {
    serviceAnomalies.push({
      service:        'ALL_SERVICES',
      currentCost:    mtdCost,
      expectedCost:   MONTHLY_BUDGET_USD,
      percentChange:  ((projectedMonthly - MONTHLY_BUDGET_USD) / MONTHLY_BUDGET_USD) * 100,
      recommendation: `Projected monthly cost $${projectedMonthly.toFixed(2)} exceeds budget $${MONTHLY_BUDGET_USD.toFixed(2)}. Review and optimize spending.`,
    });
  }

  const totalAnomalyCount = serviceAnomalies.length + ceAnomalies.length;

  // 6. Top 5 services by daily cost
  const top5Services = [...services].sort((a, b) => b.daily_cost - a.daily_cost).slice(0, 5);

  // 7. Publish CloudWatch metrics
  try {
    await publishMetrics({ totalDailyCost, mtdCost, projectedMonthly, budgetUtilization, anomalyCount: totalAnomalyCount, topServices: top5Services });
  } catch (err) {
    log('warn', { msg: 'Failed to publish CloudWatch metrics', error: err.message });
  }

  // 8. Alert if anomalies detected or budget ≥ 80%
  if (serviceAnomalies.length > 0 || budgetUtilization >= 80) {
    try {
      await publishAlert(serviceAnomalies, projectedMonthly, budgetUtilization);
    } catch (err) {
      log('warn', { msg: 'Failed to publish SNS alert', error: err.message });
    }
  }

  // 9. Structured summary log
  const summary = {
    date:                    yesterday,
    totalDailyCost:          totalDailyCost.toFixed(4),
    mtdCost:                 mtdCost.toFixed(4),
    projectedMonthly:        projectedMonthly?.toFixed(4) ?? null,
    budgetUtilizationPercent: budgetUtilization.toFixed(2),
    serviceCount:            services.length,
    anomaliesDetected:       totalAnomalyCount,
    ceAnomaliesFromAws:      ceAnomalies.length,
    top5Services:            top5Services.map(s => ({ service: s.service, dailyCost: s.daily_cost.toFixed(4) })),
    wowChangePercent:        wowChangePct?.toFixed(2)  ?? null,
    momChangePercent:        momChangePct?.toFixed(2)  ?? null,
    durationMs:              Date.now() - startTime,
  };

  log('info', { msg: 'Cost ingestion complete', ...summary });

  return { statusCode: 200, body: JSON.stringify(summary) };
};
