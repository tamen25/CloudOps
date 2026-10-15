# modules/mesh

Generic single-service module for the polyglot mesh. One instance = one
purpose-built service. Creates a Deployment, ClusterIP Service, ServiceAccount
(IRSA-annotated when `irsa_role_arn` is set), an optional HPA, and an optional
ingress NetworkPolicy.

Designed for the dev/test tier: defaults to 1 replica, ~25m/32Mi requests, HPA
off. Bump `replicas`/`enable_hpa`/limits per env via tfvars.

## Conventions enforced

- Non-root (`run_as_user`, default 65532 for distroless; pass `1001` +
  `needs_tmp_volume = true` for node:alpine images).
- `read_only_root_filesystem = true`, `capabilities.drop = ["ALL"]`,
  `seccompProfile = RuntimeDefault` — matches `apps/order-api`.
- Probes hit `/healthz` (liveness) and `/readyz` (readiness) — every mesh
  service must expose these.
- OTel env wired from `otel_endpoint` + the `otel-auth` Secret. SDK no-ops when
  the endpoint is empty.

## Example

```hcl
module "mesh_pricing" {
  source                   = "../../modules/mesh"
  name                     = "pricing"
  namespace                = var.mesh_namespace
  lang                     = "go"
  image                    = var.pricing_image
  run_as_user              = 65532
  otel_endpoint            = local.otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"
  ingress_from_labels      = { app = "api-gateway" }
}
```

`service_url` / `service_dns` outputs feed the caller's `PRICING_URL`-style env.
