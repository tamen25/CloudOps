# Runbook — Cosign Gatekeeper Provider Rollout

Closes backlog #98.

## What

The `K8sRequireImageSignature` Gatekeeper constraint denies any Pod whose
container image lacks a valid Cosign keyless signature from this repo's CI.
It relies on a `cosign-gatekeeper-provider` sidecar that Gatekeeper calls
via `external_data` during admission. Without that sidecar, the constraint
reports `system_error` on every Pod admission and **blocks the cluster**.

Default: both toggles OFF.

| Variable | Default | What flipping it does |
|----------|---------|-----------------------|
| `enable_cosign_provider` | `false` | Deploys the sidecar (helm: `sigstore/cosign-gatekeeper-provider`). No enforcement yet. |
| `enable_image_signature_constraint` | `false` | Activates the K8sRequireImageSignature ConstraintTemplate + Constraint. Pods with unsigned images are denied admission. |

A plan-time precondition (`terraform_data.cosign_constraint_guard` in
`modules/security/gatekeeper.tf`) fails plan if the constraint is enabled
without the provider.

## Why

Image signing closes the supply-chain leg of #56 / #98. Cosign verification
already happens in CI (`app.yml` build-and-push). The Gatekeeper constraint
extends the same trust boundary into the cluster — even if someone pushes an
unsigned image to ECR by hand, admission rejects it.

## Pre-flight

1. **CI is signing every push.** Confirm `app.yml` `build-and-push` runs
   `cosign sign --yes <ref>@<digest>`.
2. **`gatekeeper` helm release is healthy.** `kubectl get pods -n gatekeeper-system`
   should show two `controller-manager` replicas and an `audit` pod, all
   Running.
3. **No `K8sRequireImageSignature` constraint exists yet.** This rollout
   creates it; if one exists from a half-completed prior attempt, delete it
   first: `kubectl delete constrainttemplate k8srequireimagesignature`.

## Step 1 — Deploy the provider (no enforcement)

```hcl
# environments/staging.tfvars (or wherever)
enable_cosign_provider              = true
enable_image_signature_constraint   = false   # leave OFF for this step
```

```bash
STACKS=platform bash scripts/terraform-stacks.sh plan
STACKS=platform bash scripts/terraform-stacks.sh apply
```

Verify:

```bash
kubectl get pods -n gatekeeper-system -l app.kubernetes.io/name=cosign-gatekeeper-provider
kubectl logs -n gatekeeper-system -l app.kubernetes.io/name=cosign-gatekeeper-provider --tail=50
```

The pod should be `Running` with no `connection refused` or `provider not
registered` errors.

## Step 2 — Validate the provider can verify a known-good image

Pick a current order-api image (signed by CI):

```bash
ORDER_IMAGE=$(kubectl get deployment order-api -n cloudops -o jsonpath='{.spec.template.spec.containers[0].image}')
echo "Verifying $ORDER_IMAGE"

# Direct cosign check from your workstation — confirms the signature exists
cosign verify \
  --certificate-identity-regexp="https://github\.com/<your-org>/<your-repo>/\.github/workflows/app\.yml@refs/heads/.*" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "$ORDER_IMAGE"
```

If `cosign verify` succeeds locally, the provider sidecar will too.

## Step 3 — Audit-mode dry run (still no enforcement)

The constraint isn't created yet, so audit mode requires creating the
ConstraintTemplate without the Constraint object. Easiest path: enable the
constraint but set its `enforcementAction: dryrun` via the constraint spec
in `gatekeeper_policies.tf` (modify the `spec.enforcementAction` field to
`dryrun` if you want a staged rollout). For a fast cluster + small fleet,
skip this step and go straight to Step 4 — the provider's signature check
is deterministic and an audit pass adds little signal.

## Step 4 — Flip enforcement on

```hcl
enable_cosign_provider              = true
enable_image_signature_constraint   = true   # NOW enforced
```

```bash
STACKS=platform bash scripts/terraform-stacks.sh plan    # plan-time guard verifies both flags align
STACKS=platform bash scripts/terraform-stacks.sh apply
```

Verify:

```bash
# Should report 0 violations for the order-api Deployment (it's signed).
kubectl get k8srequireimagesignature -A

# Try to create an unsigned Pod — should be denied.
kubectl run unsigned-test --image=nginx:latest -n cloudops --dry-run=server
# Expected: Error from server (Forbidden): admission webhook "validation.gatekeeper.sh"
# denied the request: [k8srequireimagesignature] container <unsigned-test> image
# <nginx:latest> failed Cosign signature verification: ...
```

## Step 5 — Watch for drift

- Gatekeeper audit metric `gatekeeper_violations` — should stay at 0 for the
  signature constraint after every running Pod is signed.
- Admission webhook latency: `apiserver_admission_webhook_admission_duration_seconds`
  for `validation.gatekeeper.sh` — should stay under 200ms p95. The provider
  adds a Rekor lookup, which can be cached but is network-bound.

## Rollback

```hcl
enable_image_signature_constraint = false
```

`terraform apply` removes the Constraint and ConstraintTemplate. Admission
returns to default. Leave `enable_cosign_provider = true` running — the
sidecar is harmless when no constraint calls it.

## Known issues

- **First Pod after Karpenter scale-out can hit a Rekor cold-cache miss**
  and add ~500ms to admission. Acceptable for normal rollouts; pre-pull
  signatures in scale-from-zero workloads if it bites.
- **Air-gapped clusters can't reach Rekor.** Out of scope here; would
  require a private Rekor mirror.
