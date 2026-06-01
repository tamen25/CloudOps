# ADR 027 — Mesh services use direct OTel instrumentation, not the `libraries/<lang>/logs` ports

**Status:** Accepted
**Date:** 2026-06-02
**Closes:** backlog #145

## Context

The repo ships first-party structured-logging SDKs under
`libraries/{nodejs,go,python,java,dotnet,cpp}/logs` (the "log ports"). They wrap
OpenTelemetry logs: resolve OTLP config from SSM / env, attach AWS + k8s resource
attributes, and emit log records to the collector's `/v1/logs` endpoint.

The polyglot mesh services (`apps/{api-gateway,payment,loadgen}` Node,
`apps/{pricing,ledger}` Go, `apps/{inventory,projection-worker}` Python,
`apps/fraud` Java) were built with **direct** OTel instrumentation:

- **Node** — `tracing.ts` builds a `NodeSDK` with `getNodeAutoInstrumentations()`
  + an OTLP `BatchLogRecordProcessor`; app logs go through `pino`.
- **Go** — `otelhttp` + a manual tracer in `tracing.go`; logs via stdlib `log`.
- **Python** — FastAPI instrumentor + OTLP exporter; logs via stdlib.
- **Java** — the OpenTelemetry Java agent; logs via Spring Boot / logback.

Backlog #145 (P4) asked: wire the log ports into the mesh services for
structured-log parity, **or** document why direct instrumentation is preferred.

## Decision

**Keep direct instrumentation. Do not wire the `libraries/<lang>/logs` ports into
the mesh services.** Record the rationale and the trigger that would reverse this.

## Rationale

1. **No monorepo linking mechanism exists.** The repo root has no npm/pnpm
   `workspaces`, no Go module replace-directives pointing at `libraries/go/logs`,
   no editable-install path for `libraries/python/logs`, and no Maven
   `<dependency>` on `libraries/java/logs` from the services. `@cloudops/otel-logs`
   is consumed by **zero** apps today. Wiring even one language would require
   either publishing the library to a registry (npm/Go proxy/PyPI/Maven Central
   or a private equivalent) or `file:`-style local deps that then have to be
   vendored into each service's Docker build. That is registry + build-pipeline
   work — disproportionate for a P4 log nicety.

2. **Node logs are already bridged to OTLP — for free.** `auto-instrumentations-node`
   bundles `@opentelemetry/instrumentation-pino` (v0.64.0 after the #146 bump) and
   enables it by default. Every `pino` log line in the gateway / payment / loadgen
   is therefore already trace-correlated (trace_id + span_id injected) and
   exported to `/v1/logs` via the SDK's log processor. The custom Node port would
   *replace* this path with no new capability — strictly redundant.

3. **Traces are the mesh's primary signal, and they already flow.** The mesh
   exists to showcase a distributed trace fanning out across six languages plus
   the async lambda chain. That signal is fully wired and visible on the operator
   console (`/console` service map, `/traces` waterfall after #144). Structured
   *logs* are a secondary signal here; the gap the log ports would close is small.

4. **Each runtime's idiomatic path is already structured + exported.** Go/Python/
   Java emit through their standard loggers, and the OTel SDK/agent in each
   service handles resource attributes + OTLP export. Swapping in a hand-rolled
   cross-language library risks drift from each ecosystem's conventions (e.g. the
   Java agent's log appender vs. a manual SDK logger) for marginal benefit.

5. **The log ports have their own coverage contract and consumers.** They are a
   product surface in their own right (SSM-config resolution, AWS runtime
   detection) validated by `libraries.yml`. They are designed for *external*
   telemetry producers (per #61's SSM distribution contract), not as the only
   sanctioned in-repo logger. Conflating "the library exists" with "every service
   must use it" is not required by any contract.

## What this is NOT

- Not a statement that the log ports are deprecated — they remain the
  recommended path for **new external producers** and any service that needs the
  SSM-driven config resolution they provide.
- Not a regression in observability — mesh logs still reach the collector
  (directly on Node; via stdlib + SDK/agent elsewhere) and remain queryable in
  Loki/Mimir alongside traces.

## Triggers to revisit (wire the ports in)

Reverse this decision and adopt the log ports if any of these become true:

- A monorepo dependency-linking story lands (npm workspaces, a private registry,
  Go replace-directives, editable Python installs) so consuming the library is a
  one-line dep, not a build-pipeline change.
- A concrete need for the ports' SSM-config resolution or AWS-runtime resource
  detection appears in a mesh service (e.g. cross-account telemetry).
- Log-schema divergence across the six services becomes an operational problem
  (inconsistent fields breaking Loki queries) that a shared library would fix.
- The pino auto-instrumentation log bridge is removed or stops correlating logs
  with traces.

## Implementation note

No code change. This ADR is the deliverable for #145; the backlog row points
here. The `libraries/<lang>/logs` ports are unchanged.
