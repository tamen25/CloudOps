# Runbook — Chaos pod-kill (real fault injection)

Backlog #143. The loadgen can delete one live mesh pod so self-healing
reschedules it and the trace map shows the error edge **then** the recovery —
not just the app-level faults the `chaos` scenario injects.

This is a deliberately dangerous capability (the loadgen holds `delete pods`
RBAC when enabled). It is OFF by default and guarded in four layers. Read the
guard model before using it.

## Guard model (defence in depth)

1. **RBAC** — `modules/loadgen/rbac.tf` creates a namespace-scoped `Role`
   (`get/list/watch/delete pods`) + `RoleBinding` to the loadgen control SA,
   **only when `enable_chaos = true`**. It is a `Role`, not a `ClusterRole`:
   the token cannot touch `kube-system`, `observability`, or any namespace other
   than the mesh namespace.
2. **App allowlist** — `apps/loadgen/src/chaos.ts` accepts only a fixed set of
   mesh services (`pricing inventory fraud payment ledger projection-worker
   api-gateway`). `loadgen` itself is **not** in the list, so it cannot kill its
   own pod; nor can it target anything outside the mesh. This mirrors the SSRF
   guard (guardrail #11): the killable set is a constant, never request-derived.
3. **Dry-run default** — `POST /chaos/kill` defaults to `dryRun: true`. It
   reports the pod it *would* delete and deletes nothing. A real kill requires an
   explicit `{"dryRun": false}`.
4. **Single-pod clamp** — at most one pod is deleted per call (the first match),
   never a batch.

When `enable_chaos = false`: no RBAC exists, `CHAOS_ENABLED` is unset, and
`POST /chaos/kill` returns `404 chaos_disabled`. The endpoint does not exist.

## Enable

```bash
# Platform stack — turn the capability on (RBAC + env flag).
terraform -chdir=stacks/platform apply -var loadgen_enable_chaos=true
```

This creates `role/loadgen-chaos` + `rolebinding/loadgen-chaos` in the mesh
namespace and sets `CHAOS_ENABLED=1` on the control Deployment, which makes the
loadgen build its in-cluster k8s client and expose `/chaos/kill`.

## Run a chaos kill (operator path)

Always **dry-run first**. The storefront `/load` console (admin-gated) or a
direct signed call:

```bash
# Dry-run: what WOULD be killed (deletes nothing).
curl -sS -X POST "$LOADGEN_URL/chaos/kill" \
  -H "content-type: application/json" \
  -H "x-cloudops-timestamp: $TS" -H "x-cloudops-tenant: ops" \
  -H "x-cloudops-hmac: $SIG" \
  -d '{"service":"pricing"}'
# -> {"ok":true,"dryRun":true,"service":"pricing","pod":"pricing-7c9...-abc"}

# Real kill: explicit dryRun:false.
... -d '{"service":"pricing","dryRun":false}'
# -> {"ok":true,"dryRun":false,"service":"pricing","pod":"pricing-7c9...-abc"}
```

The HMAC scheme is the standard internal one
(`sha256hex(timestamp.tenant.rawBody.secret)`); the storefront BFF
(`/api/load/chaos`, admin-only) signs it for you.

## What recovery looks like (acceptance)

1. Kill a single pod (e.g. `pricing`).
2. Kubernetes detects the missing pod (the Deployment's ReplicaSet) and
   schedules a replacement within seconds. No extra self-healing code is
   involved — this is stock Deployment behaviour.
3. On the console `/console` service map: the `api-gateway → pricing` edge turns
   red for in-flight requests during the gap, then returns to green once the new
   pod is `Ready`. The `/traces` view shows traces with a failed `pricing` hop
   during the window, bracketed by healthy traces before and after.
4. `kubectl get rs -n <mesh-ns> -l app=pricing` shows the ReplicaSet restored
   desired==ready.

If the pod does **not** come back: that is a self-healing failure, not a chaos
failure — escalate via [`auto-remediation-failure.md`](./auto-remediation-failure.md).

## Disable

```bash
terraform -chdir=stacks/platform apply -var loadgen_enable_chaos=false
```

Removes the RBAC and the env flag; `/chaos/kill` reverts to `404`.

## Related

- App-level chaos (malformed payloads / forced downstream 500): the `chaos`
  load scenario in `apps/loadgen/src/scenarios.ts` — no pod deletion.
- Abuse / containment: [`abuse-response.md`](./abuse-response.md).
- SSRF / target guards: guardrail #11 in `CLAUDE.md`.
