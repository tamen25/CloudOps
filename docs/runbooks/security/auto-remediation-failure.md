# Runbook: Auto-Remediation Failure

**Alert:** `SecurityAutoRemediationHighFailureRate`
**Severity:** WARNING
**Source:** Compliance scanner Lambda → CloudWatch `AutoRemediationFailed` / `AutoRemediationSuccess` → PrometheusRule recording rule

---

## What fired

The auto-remediation success rate has dropped below 80% over the last 5 minutes. This means the compliance scanner Lambda is failing to automatically resolve findings — either by applying AWS API fixes or by creating GitHub issues for manual action.

---

## Immediate triage

### Check Lambda logs

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/cloudops-compliance-scanner \
  --start-time $(date -d '30 minutes ago' +%s000) \
  --filter-pattern '"auto_remediation" "failed"' \
  --output json | jq '.events[].message' | python3 -c "import sys; [print(l) for l in sys.stdin]"
```

### Check CloudWatch metrics

```bash
START=$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

for metric in AutoRemediationSuccess AutoRemediationFailed; do
  echo "=== $metric ==="
  aws cloudwatch get-metric-statistics \
    --namespace CloudOps/Security \
    --metric-name "$metric" \
    --start-time "$START" \
    --end-time "$END" \
    --period 300 \
    --statistics Sum \
    --output json | jq '.Datapoints[] | {time: .Timestamp, value: .Sum}'
done
```

---

## Common failure causes

### 1. GitHub token missing or expired

**Symptom:** Lambda logs contain `GitHub API 401` or `secret not found`

**Check:**

```bash
aws secretsmanager get-secret-value \
  --secret-id cloudops-github-token \
  --query SecretString \
  --output text | wc -c
# Should be > 10 characters (non-empty token)
```

**Fix:**

Generate a new GitHub PAT with `repo` scope, then update the secret:

```bash
aws secretsmanager put-secret-value \
  --secret-id cloudops-github-token \
  --secret-string "<new-PAT>"
```

### 2. Lambda execution role missing permissions

**Symptom:** Lambda logs contain `AccessDenied` for a specific AWS API call

**Check the IAM role:**

```bash
ROLE_NAME=$(aws lambda get-function-configuration \
  --function-name cloudops-compliance-scanner \
  --query 'Role' --output text | sed 's|.*/||')

aws iam list-attached-role-policies --role-name "$ROLE_NAME"
aws iam list-role-policies --role-name "$ROLE_NAME"
```

**Fix:** Add the missing permission to the IAM role via Terraform (`modules/security/iam.tf`) and apply.

### 3. Lambda timeout

**Symptom:** Lambda logs show `Task timed out after 300 seconds`

The compliance scanner does a broad AWS API sweep. In large accounts with many resources, it can exceed the 300s timeout.

**Fix:** Increase timeout in `modules/security/lambda.tf` to 600s, or narrow the scan scope by filtering resources by tag.

### 4. DynamoDB write throttling

**Symptom:** Lambda logs contain `ProvisionedThroughputExceededException`

The findings table is PAY_PER_REQUEST and should not throttle under normal load. If it is, there may be a runaway invocation loop.

**Check:**

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name WriteThrottleEvents \
  --dimensions Name=TableName,Value=cloudops-security-findings \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Sum \
  --output json | jq '.Datapoints'
```

**Fix:** Check Lambda EventBridge rule — ensure the schedule is `rate(6 hours)` not `rate(1 minute)`. If a manual invocation loop is running, cancel it.

### 5. SNS topic publish failure

**Symptom:** Lambda logs contain `SNS publish failed`

**Check:**

```bash
aws sns get-topic-attributes \
  --topic-arn $(aws lambda get-function-configuration \
    --function-name cloudops-compliance-scanner \
    --query 'Environment.Variables.SNS_TOPIC_ARN' \
    --output text)
```

Verify the Lambda execution role has `sns:Publish` permission on the topic ARN.

---

## Manual remediation override

If auto-remediation is failing and you need to immediately close a finding:

```bash
FINDING_ID="<uuid>"
TIMESTAMP="<ISO-timestamp>"

aws dynamodb update-item \
  --table-name cloudops-security-findings \
  --key "{\"findingId\":{\"S\":\"$FINDING_ID\"},\"timestamp\":{\"S\":\"$TIMESTAMP\"}}" \
  --update-expression "SET #st = :resolved, resolvedAt = :ts, resolvedBy = :user" \
  --expression-attribute-names '{"#st":"status"}' \
  --expression-attribute-values "{
    \":resolved\":{\"S\":\"RESOLVED\"},
    \":ts\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"},
    \":user\":{\"S\":\"manual-override\"}
  }"
```

---

## Silencing the alert temporarily

If you are in a planned maintenance window and want to suppress the alert for 2 hours:

1. In Grafana → Alerting → Silence rules
2. Add a silence for label `alertname=SecurityAutoRemediationHighFailureRate`
3. Set expiry to end of maintenance window
4. Add a comment referencing this incident

---

## Escalation

| Condition | Action |
|---|---|
| Failure rate = 100% for > 30 min | Page on-call — all new findings are going untracked |
| GitHub token invalid and owner is offboarded | Rotate token under a service account or GitHub App |
| Lambda invocations = 0 (EventBridge rule broken) | Re-enable the trigger: `aws events enable-rule --name cloudops-compliance-scan-schedule` |

---

## References

- [Security Posture dashboard](https://grafana.tamendutta.com/d/security-posture) → SLOs row → Auto-Remediation Success Rate
- [Lambda console](https://console.aws.amazon.com/lambda/home#/functions/cloudops-compliance-scanner)
- [CloudWatch log group](https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fcloudops-compliance-scanner)
