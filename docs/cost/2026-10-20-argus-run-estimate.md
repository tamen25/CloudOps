# Cost and capacity estimate: an Argus run on CloudOps (I03)

**Status:** estimate, for approval before any apply. Nothing in it has been
created. Prices are AWS on-demand list prices for us-east-1 as of this
writing; check them on the day.

## What runs where

| Where | What |
|---|---|
| **AWS (EKS)** | networking (2 AZs, NAT), EKS, the observability stack with Mimir, the mesh (9 services), loadgen, Chaos Mesh |
| **Your machine** | Argus (CLI and engine), its Postgres, the bench agents and the local Ollama server |

Argus reaches Mimir, Loki and Tempo through `kubectl port-forward`, as it does
on kind. Nothing in AWS calls back to your machine, so no tunnel is needed and
the model never leaves it. Argus's bench runs Chaos Mesh experiments through
the same kubeconfig.

Off for this run: database, storefront and its serverless pieces, ingress
(no load balancer, no certificate, no public DNS records), security, FinOps,
self-healing, SLO, compliance, backup.

### tfvars for the run

```hcl
environment                = "dev"
enable_networking          = true
enable_eks                 = true
eks_node_instance_types    = ["t3.large"]
eks_node_desired_size      = 3   # see Capacity
eks_node_min_size          = 3
enable_observability       = true
metrics_long_term_storage  = "mimir"
enable_mesh                = true
enable_loadgen             = true
enable_chaos_mesh          = true
# The API endpoint is public for the run (it is applied from your machine);
# only your address may reach it. Find it with: curl -s https://checkip.amazonaws.com
eks_endpoint_public_access_cidrs = ["<your ip>/32"]
# kubernetes_version stays at its default, 1.35 (see the control-plane line)
# everything else at its default (off)
```

## Hourly cost while it runs

| Item | Count | Price | Per hour |
|---|---|---|---|
| EKS control plane | 1 | $0.10/hr | $0.10 |
| EC2 nodes, t3.large on-demand | 3 | $0.0832/hr | $0.25 |
| NAT gateways | 2 (one per AZ) | $0.045/hr | $0.09 |
| VPC interface endpoints (ECR API, ECR DKR, CloudWatch Logs, Secrets Manager, EKS, STS, ELB, EC2), per AZ | 8 × 2 | $0.01/hr | $0.16 |
| Public IPv4 (NAT elastic IPs) | 2 | $0.005/hr | $0.01 |
| EBS gp3 (node roots + Mimir/Loki/Tempo volumes), ~80 GB | — | $0.08/GB-month | $0.01 |
| **Total** | | | **≈ $0.62/hr** |

The control-plane price holds only while the cluster's Kubernetes version
is in EKS standard support. 1.35, the default, is until 2027-03-27. A
version in extended support (1.32 and older on this date) bills $0.60/hr,
which would raise the total to ≈ $1.12/hr.

Small and usage-based, expected under $1 for a session: S3 requests and
storage for Mimir/Loki/Tempo, NAT data processing ($0.045/GB, mostly image
pulls from public registries, ~10 GB → ~$0.45), interface-endpoint data
($0.01/GB), CloudWatch Logs for the EKS control plane, and data transfer out
through the port-forwards (Argus queries, well under 1 GB → < $0.10).

Images: about 2 GB across the ECR repositories, $0.10/GB-month, deleted with
the foundation stack. Not hourly but worth knowing: the Route 53 hosted zone the foundation stack
creates costs $0.50 for the month unless it is deleted within 12 hours; KMS
keys cost $1/month each, prorated.

## A session

| Phase | Time |
|---|---|
| Apply foundation and cluster (~15 min for EKS) | ~25 min |
| Build and push the mesh images (`scripts/build-and-push.sh`), set the printed `mesh_*_image` lines in tfvars | ~15 min |
| Apply platform | ~15 min |
| Warm-up: services serve traffic until their request metrics exist (Argus gotcha: verify on a warm cluster) | ~30 min |
| Argus score, spend and backtest; bench scenarios | 2–4 h |
| Destroy workflow | ~25 min |
| **Total** | **~4.5–6.5 h** |

**≈ $3–4 in hourly charges + ≈ $1 usage ≈ $4–5 per session.**

If it is not destroyed: ≈ $15/day, ≈ $450/month. The Destroy workflow (#36)
and the AWS-phase check V02 (confirm nothing is left) exist for this.

## Capacity

There is no cluster autoscaler or Karpenter in the modules, so the node count
is whatever `eks_node_desired_size` says. Most resource requests are Helm
chart defaults, not set in this repo, so this is an estimate from typical
chart sizes, to be checked with `kubectl describe nodes` on the first run.

| Workload | Memory requested (approx.) |
|---|---|
| kube-system (CoreDNS, VPC CNI, kube-proxy, EBS CSI) | ~1 GiB |
| Prometheus + Grafana + OTel Collector | ~2.5 GiB |
| Loki (2 write, 2 read) | ~2.5 GiB |
| Tempo | ~1 GiB |
| Mimir (distributor, ingester, querier, query-frontend, store-gateway, compactor, gateway) | ~4 GiB |
| Mesh (9 services) + loadgen | ~1.5 GiB |
| Chaos Mesh (controller + daemon per node) | ~0.5 GiB |
| **Total** | **~13 GiB** |

Two t3.large nodes give ~14 GiB allocatable: too tight, and a chaos experiment
that kills a pod needs room to reschedule it. Three give ~21 GiB. Hence
`eks_node_desired_size = 3`.

## Before saying yes

- This needs your explicit approval (no cloud resources without it).
- The Destroy workflow has not run against AWS yet; the first session ends
  with it, then V02.
- The kill switch stays on (`AWS_DEPLOY_ENABLED` unset); the run is applied
  by hand from your machine, not by CI.
