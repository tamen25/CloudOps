// Chaos pod-kill controller — backlog #143. Real fault injection: delete one
// live mesh pod so self-healing (the Deployment's ReplicaSet) reschedules it and
// the trace map shows the error edge THEN the recovery, not just app-level
// faults.
//
// Security invariants (this code holds `delete pods` RBAC, so it fails closed):
//   1. Allowlist — only the named mesh services can be targeted. loadgen itself
//      and every infra namespace (kube-system, observability, …) are NOT in the
//      list and are refused. This mirrors the SSRF guard's "fixed at
//      construction" principle (guardrail #11): the killable set is a constant,
//      never derived from request input.
//   2. Dry-run default — killPod defaults to dryRun:true. A real delete requires
//      an explicit dryRun:false from an admin-gated, HMAC-signed call.
//   3. Single-pod clamp — at most ONE pod is deleted per call (the first match).
//   4. Namespace is fixed at construction; a caller cannot redirect it.
//
// The k8s client is injected (PodClient) so the guard logic is unit-tested
// without a live cluster; src/k8s.ts provides the real @kubernetes/client-node
// implementation.

export const MESH_KILLABLE_SERVICES = [
  'pricing',
  'inventory',
  'fraud',
  'payment',
  'ledger',
  'projection-worker',
  'api-gateway',
] as const;

export type KillableService = (typeof MESH_KILLABLE_SERVICES)[number];

export function isKillableService(s: string): s is KillableService {
  return (MESH_KILLABLE_SERVICES as readonly string[]).includes(s);
}

export interface PodInfo {
  name: string;
  namespace: string;
  labels: Record<string, string>;
}

// The minimal k8s surface chaos needs. Kept tiny so the fake in tests is trivial
// and the real client (src/k8s.ts) only has to implement these two calls.
export interface PodClient {
  listPods(namespace: string, labelSelector: string): Promise<PodInfo[]>;
  deletePod(namespace: string, name: string): Promise<void>;
}

export interface ChaosLogger {
  info: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

export interface ChaosDeps {
  client: PodClient;
  namespace: string;
  logger: ChaosLogger;
}

export interface KillOptions {
  dryRun?: boolean;
}

export interface KillResult {
  ok: boolean;
  dryRun: boolean;
  service: string;
  pod?: string;
  reason?: string;
}

export class ChaosController {
  constructor(private readonly deps: ChaosDeps) {}

  // killPod selects (and, unless dry-run, deletes) exactly one pod of a mesh
  // service. Never throws on a k8s error — surfaces it as ok:false so the
  // control API can return a clean status.
  async killPod(service: string, opts: KillOptions): Promise<KillResult> {
    // Dry-run is the default: only an explicit `false` performs a real delete.
    const dryRun = opts.dryRun !== false;

    if (!isKillableService(service)) {
      this.deps.logger.error({ service }, 'chaos: service not in mesh kill allowlist');
      return { ok: false, dryRun, service, reason: 'service_not_killable' };
    }

    try {
      const pods = await this.deps.client.listPods(this.deps.namespace, `app=${service}`);
      if (pods.length === 0) {
        return { ok: false, dryRun, service, reason: 'no_pods_found' };
      }

      // Single-pod clamp: first match only. Never a batch.
      const target = pods[0];

      if (dryRun) {
        this.deps.logger.info(
          { service, pod: target.name, candidates: pods.length },
          'chaos: dry-run — would kill pod',
        );
        return { ok: true, dryRun: true, service, pod: target.name };
      }

      await this.deps.client.deletePod(this.deps.namespace, target.name);
      this.deps.logger.info({ service, pod: target.name }, 'chaos: killed pod');
      return { ok: true, dryRun: false, service, pod: target.name };
    } catch (err) {
      this.deps.logger.error({ service, err }, 'chaos: kill failed');
      return { ok: false, dryRun, service, reason: 'kill_failed' };
    }
  }
}
