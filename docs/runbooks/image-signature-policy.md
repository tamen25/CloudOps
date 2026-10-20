# Image signature policy

The platform can refuse order-api images that this repository's CI did not
sign. Sigstore policy-controller does the check at admission
(`modules/security/image_signature_policy.tf`). It replaced the
cosign-gatekeeper-provider, which was archived in December 2025 and built on
cosign v1.13.

## What is checked

| | |
|---|---|
| **Images** | `<account>.dkr.ecr.<region>.amazonaws.com/<project>/order-api**` |
| **Signed by** | a keyless cosign signature from `https://github.com/<owner>/<repo>/.github/workflows/app.yml@refs/heads/main` |
| **Issuer** | `https://token.actions.githubusercontent.com` |
| **Where** | namespaces labelled `policy.sigstore.dev/include=true`; the application namespace gets the label |
| **Everything else** | admitted (`no-match-policy: allow`): the mesh images are built locally and unsigned |

app.yml signs with cosign v2 (the installer is pinned to it, BACKLOG D02).

## Switches (platform stack)

| Variable | Default | Effect |
|---|---|---|
| `enable_image_signature_policy` | `false` | Installs policy-controller (chart 0.10.8, two webhook replicas), the policy, and the namespace label. |
| `image_signature_policy_mode` | `warn` | `warn` reports unsigned images and admits them; `enforce` refuses them. |

The policy is a `ClusterImagePolicy`, a CRD the chart installs. On a fresh
cluster, the first apply installs the chart; apply again for the policy.

## Roll out

1. Set `enable_image_signature_policy = true` (mode `warn`) and apply the
   platform stack twice.
2. Check the webhook:
   ```bash
   kubectl -n cosign-system get pods
   kubectl get clusterimagepolicy order-api-signed-by-ci -o yaml
   kubectl get ns <application namespace> --show-labels   # policy.sigstore.dev/include=true
   ```
3. Deploy order-api through app.yml. In warn mode, a policy failure shows as
   a warning on the pod create (`kubectl get events -n <ns>`) and in the
   webhook's logs:
   ```bash
   kubectl -n cosign-system logs deploy/policy-controller-webhook --tail=100 | grep -i order-api
   ```
4. Prove a refusal before enforcing: an unsigned image under the order-api
   repository must warn.
   ```bash
   kubectl -n <ns> run sigcheck --image=<registry>/<project>/order-api:unsigned-test --dry-run=server
   ```
5. With a clean deploy or two and the refusal shown, set
   `image_signature_policy_mode = "enforce"` and apply.

## Roll back

Set the mode back to `warn` and apply: pods are admitted again at once. To
remove it, set `enable_image_signature_policy = false`; the webhook's
failure policy is `Fail`, so do not delete its pods by hand while the
webhook configuration exists.

## Moving to cosign v3

cosign v3 signs in the new Sigstore bundle format. Before unpinning cosign in
app.yml (BACKLOG D02), sign one image with v3 and check that the policy
admits it in `enforce` mode.
