# Runbook: Compliance CRITICAL Finding

**Alert:** `SecurityCriticalFindingsThresholdExceeded` / CI compliance-scan job failure
**Severity:** CRITICAL
**Source:** Compliance scanner Lambda → DynamoDB `cloudops-security-findings` → CloudWatch → Grafana

---

## What fired

The compliance scanner Lambda detected a CRITICAL misconfiguration in one or more of the following checks:

| Check domain | Example findings |
|---|---|
| **S3** | Public access block disabled, no SSE, versioning off on state bucket |
| **RDS** | Public access enabled, no encryption, no backup retention |
| **EKS** | Outdated Kubernetes version, no envelope encryption for secrets |
| **IAM** | Inline policy with wildcards, role without MFA, `*:*` permissions |
| **Security groups** | SSH (22) or RDP (3389) open to `0.0.0.0/0` |
| **Secrets Manager** | Secret not rotated in > 90 days |

---

## Immediate triage (< 5 minutes)

### From CI (compliance-scan job failure)

The GitHub Actions job output lists every CRITICAL finding with `checkName`, `resource`, and `recommendation`. Read the job log first.

### From Grafana alert

1. Open [Security Posture dashboard](https://grafana.example.com/d/security-posture) → **Findings by Severity** panel
2. Expand the **Compliance Status** row — drill into the failing check category

### From DynamoDB directly

```bash
aws dynamodb query \
  --table-name cloudops-security-findings \
  --index-name severity-timestamp-index \
  --key-condition-expression "severity = :s" \
  --filter-expression "#st = :open" \
  --expression-attribute-names '{"#st":"status"}' \
  --expression-attribute-values '{":s":{"S":"CRITICAL"},":open":{"S":"OPEN"}}' \
  --output json | jq '.Items[] | {check: .checkName.S, resource: .resource.S, desc: .description.S}'
```

---

## Remediation by check type

### S3 — public access block disabled

```bash
aws s3api put-public-access-block \
  --bucket <bucket-name> \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### S3 — encryption not enabled

```bash
aws s3api put-bucket-encryption \
  --bucket <bucket-name> \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"}}]}'
```

### Security group — SSH/RDP open to 0.0.0.0/0

```bash
# Revoke the offending rule
aws ec2 revoke-security-group-ingress \
  --group-id <sg-id> \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0
```

Update `var.allowed_cidr_blocks` in `terraform.tfvars` and re-apply so Terraform tracks the change.

### RDS — publicly accessible

In `terraform.tfvars` set `database_deletion_protection = false` temporarily if needed, then:

```hcl
# modules/database — the module sets publicly_accessible from its variable
# Add to terraform.tfvars:
database_publicly_accessible = false
```

```bash
terraform apply -target=module.database
```

### IAM — wildcard inline policy

1. Identify the policy in the finding's `resource` field
2. Remove wildcard actions and replace with least-privilege equivalents
3. Apply the Terraform change in a PR — do not make manual IAM changes that Terraform will overwrite

### EKS — outdated version

Update `eks_kubernetes_version` in `terraform.tfvars` and apply with `enable_eks=true`. EKS in-place version upgrade will trigger a managed node group rolling update.

### Secrets Manager — rotation overdue

```bash
aws secretsmanager rotate-secret --secret-id <secret-name>
```

For secrets that cannot be auto-rotated, manually update and document the rotation date.

---

## Marking a finding resolved

The Lambda auto-marks findings `RESOLVED` when the next scan passes the same check. To force a re-scan:

```bash
aws lambda invoke \
  --function-name cloudops-compliance-scanner \
  --payload '{}' \
  /tmp/scan-result.json
cat /tmp/scan-result.json
```

---

## False positive suppression

If a finding is a known accepted risk:

1. Update the finding status in DynamoDB to `ACCEPTED`:

   ```bash
   aws dynamodb update-item \
     --table-name cloudops-security-findings \
     --key '{"findingId":{"S":"<id>"},"timestamp":{"S":"<ts>"}}' \
     --update-expression "SET #st = :accepted, acceptedReason = :reason, acceptedBy = :user" \
     --expression-attribute-names '{"#st":"status"}' \
     --expression-attribute-values '{":accepted":{"S":"ACCEPTED"},":reason":{"S":"<justification>"},":user":{"S":"<your-name>"}}'
   ```

2. Open a GitHub issue documenting the accepted risk with an expiry date for re-review

---

## Escalation

| Condition | Action |
|-----------|--------|
| SSH open to internet on a prod security group | Revoke immediately, then investigate if exploited via CloudTrail |
| S3 state bucket public | Revoke access immediately, audit CloudTrail S3 data events for the last 24h |
| > 10 CRITICAL findings after a Terraform apply | Roll back the apply with `terraform apply` from the previous state, open incident |

---

## References

- [Security Posture dashboard](https://grafana.example.com/d/security-posture)
- [AWS Security Hub findings reference](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-findings-format.html)
- [CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)
