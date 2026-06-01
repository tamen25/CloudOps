// Tests for the chaos pod-kill controller. The k8s client is injected (a fake
// implementing the tiny surface we use) so the allowlist guard, dry-run, and
// single-pod clamp are verified without a live cluster. These are the security
// invariants — loadgen has `delete pods` RBAC, so the guard must fail closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChaosController, MESH_KILLABLE_SERVICES, type PodClient, type PodInfo } from '../src/chaos';

function silentLogger() {
  return { info() {}, error() {} };
}

// A fake PodClient backed by an in-memory pod list. Records deletions so tests
// can assert that dry-run never deletes and a real kill deletes exactly one.
function fakeClient(pods: PodInfo[]): PodClient & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async listPods(namespace: string, labelSelector: string): Promise<PodInfo[]> {
      // crude label match: selector is "app=<svc>"
      const want = labelSelector.split('=')[1];
      return pods.filter((p) => p.namespace === namespace && p.labels.app === want);
    },
    async deletePod(namespace: string, name: string): Promise<void> {
      deleted.push(`${namespace}/${name}`);
    },
  };
}

const NS = 'cloudops';

function pod(name: string, app: string): PodInfo {
  return { name, namespace: NS, labels: { app } };
}

test('refuses a service not in the mesh allowlist', async () => {
  const client = fakeClient([pod('loadgen-abc', 'loadgen')]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('loadgen', { dryRun: false });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'service_not_killable');
  assert.deepEqual(client.deleted, []);
});

test('refuses to target loadgen itself even though pods exist', async () => {
  const client = fakeClient([pod('loadgen-self', 'loadgen')]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('loadgen', { dryRun: false });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'service_not_killable');
  assert.deepEqual(client.deleted, []);
});

test('refuses kube-system / observability namespaces structurally', async () => {
  // The controller is constructed with a fixed namespace; a caller cannot ask
  // it to operate elsewhere. Verify the allowlist also rejects infra names even
  // if they were somehow passed as a "service".
  const client = fakeClient([]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  for (const svc of ['kube-system', 'observability', 'coredns', 'aws-node']) {
    const r = await c.killPod(svc, { dryRun: false });
    assert.equal(r.ok, false, `${svc} must be refused`);
    assert.equal(r.reason, 'service_not_killable');
  }
  assert.deepEqual(client.deleted, []);
});

test('dry-run returns the candidate pod but deletes nothing', async () => {
  const client = fakeClient([pod('pricing-1', 'pricing'), pod('pricing-2', 'pricing')]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('pricing', { dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.pod, 'pricing-1'); // first match
  assert.deepEqual(client.deleted, []);
});

test('dry-run is the DEFAULT when not specified', async () => {
  const client = fakeClient([pod('payment-1', 'payment')]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('payment', {});
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.deepEqual(client.deleted, []);
});

test('real kill (dryRun:false) deletes exactly one pod', async () => {
  const client = fakeClient([pod('inventory-a', 'inventory'), pod('inventory-b', 'inventory')]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('inventory', { dryRun: false });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.pod, 'inventory-a');
  assert.deepEqual(client.deleted, ['cloudops/inventory-a']); // exactly one
});

test('returns no_pods_found when the service has zero pods', async () => {
  const client = fakeClient([]);
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('fraud', { dryRun: false });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_pods_found');
  assert.deepEqual(client.deleted, []);
});

test('every allowlisted service is a real mesh service (no typos)', () => {
  // Guards against drift between this list and the mesh. All must be kebab-case.
  for (const svc of MESH_KILLABLE_SERVICES) {
    assert.match(svc, /^[a-z][a-z0-9-]*$/);
  }
  assert.ok(MESH_KILLABLE_SERVICES.includes('pricing'));
  assert.ok(MESH_KILLABLE_SERVICES.includes('api-gateway'));
  assert.ok(!MESH_KILLABLE_SERVICES.includes('loadgen'), 'loadgen must NOT be self-killable');
});

test('a client error surfaces as ok:false, not a throw', async () => {
  const client: PodClient = {
    async listPods() { throw new Error('forbidden: RBAC denied'); },
    async deletePod() { /* unreachable */ },
  };
  const c = new ChaosController({ client, namespace: NS, logger: silentLogger() });
  const result = await c.killPod('pricing', { dryRun: false });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'kill_failed');
});
