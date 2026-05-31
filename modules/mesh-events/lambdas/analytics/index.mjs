// analytics-lambda — EventBridge-triggered. Emits per-tenant order metrics as
// CloudWatch EMF (Embedded Metric Format) log lines, which CloudWatch turns
// into metrics with no PutMetricData calls. Pure builder is exported for tests;
// the handler logs the EMF document so it lands in the function's log group.

const NAMESPACE = process.env.METRIC_NAMESPACE || "CloudOps/Mesh";

// buildEmf turns an enriched order event into an EMF metric document. Returns
// null when the detail is not a usable order event.
export function buildEmf(detail, nowMillis = Date.now()) {
  if (!detail || typeof detail !== "object") return null;
  const tenant = String(detail.tenantId ?? "default");
  const total = Number(detail.totalCents ?? 0);
  if (!Number.isFinite(total)) return null;

  return {
    _aws: {
      Timestamp: nowMillis,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [["tenantId"], ["tenantId", "riskTier"]],
          Metrics: [
            { Name: "OrdersCount", Unit: "Count" },
            { Name: "OrderValueCents", Unit: "None" },
          ],
        },
      ],
    },
    tenantId: tenant,
    riskTier: String(detail.riskTier ?? "low"),
    OrdersCount: 1,
    OrderValueCents: total,
  };
}

export const handler = async (event) => {
  // EventBridge delivers a single event with `detail`; support a batch shape
  // too for forward-compat.
  const details = Array.isArray(event?.Records)
    ? event.Records.map((r) => r.detail ?? r)
    : [event?.detail ?? event];

  let emitted = 0;
  for (const detail of details) {
    const doc = buildEmf(detail);
    if (!doc) continue;
    // EMF: a structured log line on stdout is ingested by CloudWatch as metrics.
    console.log(JSON.stringify(doc));
    emitted += 1;
  }
  return { emitted };
};
