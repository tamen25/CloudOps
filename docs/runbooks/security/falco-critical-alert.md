<!-- This document explains falco critical alert for CloudOps. -->
# Runbook: Falco CRITICAL Alert

**Alert:** `FalcoCriticalDetection`
**Severity:** CRITICAL
**Source:** Falco DaemonSet → Falcosidekick → OTel Collector → Loki → Grafana

---

## What fired

Falco detected a runtime threat matching a CRITICAL-severity rule on one or more EKS nodes. Common triggers:

- Container escape attempt (e.g. write below `/proc`, mount of sensitive host paths)
- Privilege escalation inside a container (`setuid`, `setgid`, `CAP_SYS_ADMIN`)
- Unexpected network connection from a container to an external IP
- Shell spawned inside a container that should not have shells
- Sensitive file read (`/etc/shadow`, `/etc/kubernetes/pki/*`, AWS credential files)

---

## Immediate triage (< 5 minutes)

1. **Open Loki in Grafana** — Security Posture dashboard → Falco Events row:

   ```
   {namespace="falco"} | json | priority="CRITICAL"
   ```

   Note: `rule`, `proc.name`, `container.id`, `k8s.pod.name`, `k8s.ns.name`

2. **Identify the affected pod:**

   ```bash
   kubectl get pod <k8s.pod.name> -n <k8s.ns.name> -o wide
   ```

3. **Check if the process is still running:**

   ```bash
   kubectl exec -n <k8s.ns.name> <k8s.pod.name> -- ps aux
   ```

4. **Inspect recent syscalls / audit log:**

   ```bash
   kubectl logs -n falco -l app.kubernetes.io/name=falco --tail=200 | grep -i critical
   ```

---

## Containment

### Option A — Isolate the pod (preferred, non-destructive)

Apply a deny-all NetworkPolicy to cut outbound connections while you investigate:

```bash
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-$(kubectl get pod <POD> -n <NS> -o jsonpath='{.metadata.name}')
  namespace: <NS>
spec:
  podSelector:
    matchLabels: $(kubectl get pod <POD> -n <NS> -o jsonpath='{.metadata.labels}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join(f'      {k}: {v}' for k,v in d.items()))")
  policyTypes: [Ingress, Egress]
EOF
```

### Option B — Delete the pod immediately

If active exfiltration is suspected:

```bash
kubectl delete pod <k8s.pod.name> -n <k8s.ns.name> --grace-period=0 --force
```

The Deployment controller will reschedule a clean pod. Verify the replacement comes up healthy before declaring the incident over.

---

## Investigation

1. **Pull container image and scan:**

   ```bash
   IMAGE=$(kubectl get pod <POD> -n <NS> -o jsonpath='{.spec.containers[0].image}')
   grype "$IMAGE" --fail-on critical
   ```

2. **Check for lateral movement — scan other pods in the namespace:**

   ```bash
   kubectl get pods -n <NS> -o wide
   # Cross-reference IPs with Falco logs for connection attempts
   ```

3. **Review IAM / IRSA permissions** — if the pod had an IRSA role, check CloudTrail for unusual API calls:

   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=Username,AttributeValue=<irsa-role-name> \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
     --output json | jq '.Events[].CloudTrailEvent' | jq -r '.'
   ```

4. **Check auto-remediation** — the compliance Lambda may have already created a GitHub issue:
   Open the [CloudOps repo issues](https://github.com/your-org/your-repo/issues) and filter by label `security`.

---

## Escalation

| Condition | Action |
|-----------|--------|
| Active exfiltration confirmed | Immediately rotate all AWS credentials for the affected IRSA role |
| Host escape confirmed | Cordon the node, drain workloads, terminate the EC2 instance |
| Multiple pods affected | Declare security incident, page the on-call security lead |

---

## Resolution

1. Delete the NetworkPolicy isolation (if applied) once the pod is clean
2. Patch the Falco rule if it was a false positive — open a PR with the override in `falco-rules-override.yaml`
3. Update the GitHub issue created by auto-remediation with the root cause and close it
4. Post an incident summary to the security Slack channel

---

## References

- [Security Posture dashboard](https://grafana.example.com/d/security-posture)
- [Falco rules reference](https://falco.org/docs/rules/)
- [EKS security best practices](https://aws.github.io/aws-eks-best-practices/security/docs/)
