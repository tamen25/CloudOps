# In-VPC CI runners (ARC)

GitHub-hosted runners reach the EKS API only while its endpoint is public.
With a private endpoint (the prod shape, ADR 013) the jobs that run kubectl
or plan the platform stack need runners inside the VPC. These are
[Actions Runner Controller](https://github.com/actions/actions-runner-controller)
scale-set runners on the platform cluster: `modules/ci-runner`, switched by
`enable_ci_runner` in the platform stack, off by default. Design: ADR 025.

## What turning it on creates

- `arc-systems`: the ARC controller, and the listener pod it starts, which
  long-polls GitHub for queued jobs.
- `arc-runners`: one runner pod per job, created when a job is queued and
  deleted when it ends (`minRunners = 0`, at most `ci_runner_max_runners`,
  default 3). The scale set is named `cloudops-vpc`.
- A NetworkPolicy on `arc-runners`: nothing may connect in; egress is DNS
  and TCP 443 only (GitHub, the AWS APIs, the EKS endpoint). A job on these
  runners cannot reach Postgres, Grafana or Mimir.
- A Kubernetes Secret with the GitHub App credentials, copied from Secrets
  Manager. The copy is also in Terraform state (encrypted in the state
  bucket).

All pods run as non-root with privilege escalation off, so Gatekeeper's
cluster-wide no-root constraint applies to them unchanged. The runner user
is in sudoers in the upstream image, but sudo cannot work without privilege
escalation; jobs on these runners cannot install packages. There is no
Docker daemon (no `containerMode`; dind would need a privileged container):
image builds stay on GitHub-hosted runners.

AWS credentials work as on a hosted runner: each job assumes its role
through GitHub's OIDC token (`configure-aws-credentials`). The runner pods
have no IRSA role, and the nodes' metadata hop limit of 1 keeps them from
the node role.

## Which jobs move

A job moves only when the `DEPLOY_RUNNER` repository variable is set
(`runs-on: ${{ vars.DEPLOY_RUNNER || 'ubuntu-latest' }}`):

| Workflow | Job |
|---|---|
| `app.yml` | `deploy` |
| `infra.yml` | `plan`, `apply` |
| `drift-detection.yml` | `detect-drift` |
| `storefront.yml` | `deploy` |

None of these run on pull requests. `destroy.yml` always runs on
GitHub-hosted runners: destroying the platform stack removes these runners,
and with them the job that is destroying it.

## Before you turn it on

The repository is public. Any workflow in it, including one changed in a
fork's pull request, can ask for `runs-on: cloudops-vpc`. Set
**Settings → Actions → General → Fork pull request workflows → Require
approval for all external contributors**, and read a fork PR's workflow
changes before approving its run. The NetworkPolicy limits what such a job
could reach, but it would still run inside the VPC.

## Turn it on

1. **GitHub App.** Create a GitHub App owned by the repository owner, with
   repository permissions *Administration: read and write* and *Metadata:
   read*. Install it on this repository only. Note the App ID and the
   installation ID (the number at the end of the installation's settings
   URL), and generate a private key.
2. **Secret.** Store the three values as one JSON secret:

   ```bash
   aws secretsmanager create-secret --name cloudops/ci-runner/github-app \
     --secret-string "$(jq -n --arg id "$APP_ID" --arg inst "$INSTALLATION_ID" \
       --rawfile key app.private-key.pem \
       '{github_app_id: $id, github_app_installation_id: $inst, github_app_private_key: $key}')"
   ```

3. **Image.** Apply the foundation stack (it creates the `ci-runner` ECR
   repository), then run the **Runner Image** workflow. Its summary prints
   the digest-pinned reference.
4. **Platform tfvars:**

   ```hcl
   enable_ci_runner                = true
   security_github_repo            = "<owner>/<repo>"
   ci_runner_image                 = "<account>.dkr.ecr.<region>.amazonaws.com/cloudops/ci-runner@sha256:..."
   ci_runner_github_app_secret_arn = "arn:aws:secretsmanager:..."
   ```

   Apply the platform stack while the EKS endpoint is still reachable
   (public, or through `eks-emergency-access.yml`).
5. **Check:**

   ```bash
   kubectl -n arc-systems get pods     # arc-gha-rs-controller and cloudops-vpc-...-listener, Running
   kubectl -n arc-runners get pods     # empty until a job is queued
   ```

   The repository's **Settings → Actions → Runners** lists `cloudops-vpc`.
6. **Move the jobs:** set the repository variable `DEPLOY_RUNNER` to
   `cloudops-vpc` (the platform output `ci_runner_set_name`). Run the App
   Pipeline once by hand and watch a runner pod appear in `arc-runners`.
7. Only then make the endpoint private.

## Runner image

`ci/runner/Dockerfile`: the GitHub runner image pinned by digest, plus the
AWS CLI, kubectl (same minor as the cluster) and envsubst, each download
pinned by checksum. It also removes the npm bundled with the runner's
node20, which carried a critical CVE and is never called.

To update: change the versions and checksums in the Dockerfile (the
kubectl checksum is published beside the binary; for the AWS CLI, check
the zip's PGP signature against the AWS CLI team key, then pin its
sha256). A PR builds the image without pushing. After merge, run **Runner
Image**, put the new digest in `ci_runner_image`, apply. Running jobs keep
their pod; new jobs get the new image.

## Upgrading ARC

Both charts (`gha-runner-scale-set-controller`, `gha-runner-scale-set`)
are released together; `chart_version` sets both. Read the release notes
for CRD changes: Helm does not upgrade CRDs, so a release that changes them
needs `kubectl apply` of the new CRDs first. Apply the upgrade from a
GitHub-hosted runner (unset `DEPLOY_RUNNER`, open emergency access if the
endpoint is private), not from a runner the upgrade replaces.

## Changes that remove the runner under a job

A job on these runners dies with its pod. Run these from a GitHub-hosted
runner (unset `DEPLOY_RUNNER`; open emergency access if the endpoint is
private):

- applies that replace or roll the node group (cluster stack: AMI,
  instance type, Kubernetes version);
- applies that change `modules/ci-runner` itself;
- destroy (always hosted).

An interrupted apply leaves the state lock held; release it with
`terraform force-unlock` after checking no other apply is running.

## When the runners are down

Jobs queue and wait. To get a cluster job through anyway: unset
`DEPLOY_RUNNER`, run `eks-emergency-access.yml` to open the endpoint to the
runner's address, run the job, close access again. Then look at:

```bash
kubectl -n arc-systems logs deploy/arc-gha-rs-controller
kubectl -n arc-systems logs -l app.kubernetes.io/component=runner-scale-set-listener
```

A listener that logs authentication errors usually means the GitHub App
private key was rotated or the installation was removed: update the secret
and apply the platform stack.

## Turn it off

Unset `DEPLOY_RUNNER` first (or the next cluster job waits for a runner
that never comes), then set `enable_ci_runner = false` and apply from a
GitHub-hosted runner.

## Not verified

The module, image and workflow changes are tested offline (Terraform tests
with mocked providers, a local image build and Trivy scan, actionlint). No
runner has registered with GitHub or run a job on a live cluster yet;
BACKLOG V03 tracks that.
