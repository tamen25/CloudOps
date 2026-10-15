# Chaos Mesh

Chaos Mesh injects faults (network delay and partition, pod kill, stress)
for the Argus bench scenarios and for game days. It is off by default:
`enable_chaos_mesh` in the platform stack (`modules/chaos-mesh`).

It is not the loadgen's pod-kill (`loadgen_enable_chaos`,
[security/chaos-pod-kill.md](security/chaos-pod-kill.md)). That kills one mesh
pod through the loadgen API. Chaos Mesh runs experiments described as
Kubernetes objects.

## What turning it on changes

- The `chaos-mesh` namespace: the controller manager, and the chaos daemon
  as a DaemonSet on every node. The daemon runs privileged and as root: it
  enters target pods' network namespaces to shape traffic.
- Gatekeeper: `chaos-mesh` is added to the excluded namespaces of the two
  cluster-wide constraints (no root, no privileged containers). It is
  removed again when the switch is off.
- The application namespaces (`mesh_namespace`, `order_api_namespace`) get
  the annotation `chaos-mesh.org/inject=enabled`. The controller runs with
  namespace filtering, so experiments act there and nowhere else: not on
  `kube-system`, the monitoring stack or the security tooling.
- No dashboard (it can start any experiment) and no DNS server (DNSChaos
  is not used).

## Turn it on

```bash
# stacks/platform tfvars
enable_chaos_mesh = true
```

Apply the platform stack. Check:

```bash
kubectl -n chaos-mesh get pods            # controller-manager and one chaos-daemon per node, Running
kubectl get ns cloudops -o jsonpath='{.metadata.annotations.chaos-mesh\.org/inject}'   # enabled
```

## Run an experiment

Every experiment needs a steady-state check first. Chaos Mesh reports
success even when its selector matches nothing. Before injecting, confirm
that the target pods exist and serve traffic, and that their request metrics
are in Mimir (`count by (__name__) ({job="<service>"})`).

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: checkout-delay
  namespace: cloudops
spec:
  action: delay
  mode: all
  selector:
    namespaces: [cloudops]
    labelSelectors: { app: order-api }
  delay: { latency: 500ms, jitter: 100ms }
  duration: 10m
```

Log every induced fault for backtesting (the Argus `incidents.yaml`
convention). Delete the experiment, or let `duration` end it, and confirm
recovery.

## Watch during the first live run

- **Falco.** The daemon's work inside target pods (traffic control,
  process stress) has not been run against the CloudOps Falco rules yet. If a
  CRITICAL fires on a chaos-daemon action, auto-remediation quarantines the
  target pod. Check `{service_name="falco"}` in Loki after the first
  experiment.
- **Network policies.** Faults act below NetworkPolicy, so a partition looks
  like the real thing to the services. Expect self-healing to react. That
  is part of what the scenarios measure.

## Turn it off

Set `enable_chaos_mesh = false` and apply. Delete running experiments
first (`kubectl delete networkchaos,podchaos,stresschaos -A --all`):
the CRDs go with the chart, and experiments still running when the
controller is removed can leave their finalizers behind.
