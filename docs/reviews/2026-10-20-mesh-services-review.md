# Mesh services review — 2026-10-20

Scope: the mesh services: api-gateway, payment and loadgen (TypeScript),
fraud (Java), inventory and projection-worker (Python). This is part of R01
in `BACKLOG.md`. The storefront (about 8,700 lines) is not covered here; it
remains in R01.

These services exist to make a deep, observable trace for the platform and
for Argus fault-injection scenarios, not to move money. Findings are judged
by that: a defect that makes the telemetry or the failure behaviour wrong
counts, and a simplification the code states openly (stub authorization,
in-memory stock) does not.

## Fixed in this PR

| ID | Service | Finding |
|---|---|---|
| R01-1 | projection-worker | **Every real record was skipped.** boto3's `get_records` returns `Data` as the record's bytes, already decoded; `decode_record` base64-decoded them again, got garbage, and counted the record as skipped. The tests only fed base64 strings, the Lambda event shape. |
| R01-2 | inventory | **Repeated SKUs were checked one line at a time.** Two lines of 60 against 100 in stock both passed. Lines for the same SKU now draw on the same stock. An unreadable `SEED_STOCK` is logged instead of silently replaced by the default. |
| R01-3 | fraud | **A malformed amount was approved.** An `amount_cents` that was missing or not a number was read as 0, which scores "approve". It is now a 400, as is an `item_count` that is not a number. |
| R01-4 | api-gateway | **No timeout on any hop.** A hung downstream held the request open until the client gave up (about 300 s in the test). Each hop now has a timeout (5 s); a timeout is a 504 naming the hop. |
| R01-5 | payment | **No timeout on the ledger call.** Same defect, same fix: 504 `ledger_timeout`. |

Each fix has a test that fails without it.

## Reviewed, no change

- **loadgen.** The control API checks the internal signature on every
  write route. The traffic target is fixed at construction, never taken
  from a request (the SSRF guard). Chaos pod-kill exists only when enabled
  and holds four guards: a fixed service allowlist, dry run by default, one
  pod per call, and a fixed namespace. A signed request can be replayed
  inside the 5-minute skew window; ADR 024 records that choice. The
  signature itself is BACKLOG S09.

## Open — decisions, not defects

These are behaviours the code chooses, possibly on purpose. They are
listed so the choice is made knowingly.

- **R01-6, fraud fails open.** The gateway proceeds to payment when the
  fraud service errors (`fraud.ok` false). Only an explicit `deny` stops
  an order. For a payment flow this would be fail-closed. For a fault-
  injection bed, "fraud down, orders still flow" may be the intended
  scenario. Decide, then make it explicit in code.
- **R01-7, reservations are neither held nor released.** inventory's
  `/reserve` checks stock without decrementing it, and the gateway does
  not release anything when payment fails. Fine for a trace; wrong if any
  scenario reasons about stock.
- **R01-8, `synthetic-` tenants are trusted by name.** fraud caps the
  score of any tenant starting with `synthetic-` below the deny
  threshold, and the gateway takes `tenant_id` from the request body. The
  gateway is ClusterIP-only (no Ingress routes to it), so only in-cluster
  callers can use this. It needs an authenticated tenant before the
  gateway is ever exposed.
- **R01-9, projection-worker resilience.** Any Kinesis error (throttling,
  an expired iterator) ends the loop and the pod restarts at `LATEST`,
  losing the events in between. A closed shard after resharding is never
  replaced by its children. The read model is in memory. Acceptable for
  the dev tier as stated in its docstring; not for a read model anything
  depends on.
