# ADR 030 — East-west mTLS: Istio ambient, after the first AWS run

**Status:** Proposed (needs a decision; nothing built)
**Date:** 2026-10-20
**Relates to:** BACKLOG O01 (old #9), ADR 012 (VPC CNI network policy),
ADR 029 (internal request signature)

## Context

Pod-to-pod traffic in the cluster is plaintext. What protects it today:

- **NetworkPolicy**, enforced by the VPC CNI (ADR 012): who may connect to
  whom, by namespace, IP and port.
- **Request signatures** (ADR 029): internal calls carry an HMAC-SHA256
  over timestamp, tenant and body, checked within a 5-minute window. A
  forged or altered request is refused.

What is missing: confidentiality on the wire, and workload identity. A
process that can read pod traffic on a node (a compromised privileged pod)
sees request bodies and the signature headers; NetworkPolicy matches IPs,
not identities.

ADR 012 kept the VPC CNI and deferred mTLS to a mesh decision. The options
that do not swap the CNI:

| Option | What it takes | Cost on this cluster (defaults) |
|---|---|---|
| **Istio ambient** (GA since 1.24; charts at 1.30.6) | `istio-cni` and `ztunnel` DaemonSets, `istiod`; a namespace label moves its pods into the mesh, no sidecars | requests ≈ 1.4 vCPU and 3.8 GiB across three nodes (istiod 0.5/2 GiB, ztunnel 0.2/512 MiB and CNI 0.1/100 MiB per node), about a quarter of three t3.large nodes' CPU; can be tuned down |
| Linkerd | sidecar per pod, its own CNI plugin | small per pod; stable releases now come from Buoyant, and the open-source project ships edge releases |
| Cilium (chaining or full) | ADR 012 rejected the CNI swap; Cilium's docs list transparent encryption among the features limited when chained with the VPC CNI | — |
| Accept the risk | nothing | none |

## Recommendation

**Istio ambient, off by default, after the first AWS run** (I03, V01).
Ambient gives mTLS and SPIFFE identities without sidecars, without a CNI
swap, and without touching application code. A new `modules/mesh-mtls`
would install the four charts, label the mesh namespace
`istio.io/dataplane-mode=ambient`, and set a `PeerAuthentication` of
`STRICT` there once every caller is in the mesh.

Why not before the first run:

- **It cannot be checked offline.** On the wire, ambient traffic goes to
  the destination pod on port 15008 (HBONE), and kubelet probes arrive
  from a link-local address. Every existing NetworkPolicy that allows only
  an application port would drop mesh traffic until it also allows 15008.
  kind does not enforce NetworkPolicy, so only a live EKS cluster shows
  which policies break.
- **It changes the run the estimate covers.** About a quarter of the
  cluster's CPU goes to the mesh at default requests, and the Argus bench
  would score telemetry from a different data plane than the one it is
  meant to measure first.
- Gatekeeper's no-root and no-privileged constraints must exclude
  `istio-system` (istio-cni and ztunnel need both), as they do for Falco
  and Chaos Mesh. That is a deliberate widening and deserves its own
  review.

## Decision needed

1. Istio ambient (as above), after the first AWS run; or
2. accept the risk: record that the mesh is protected by NetworkPolicy and
   request signatures only, and close O01.

Until then O01 stays open and points here.
