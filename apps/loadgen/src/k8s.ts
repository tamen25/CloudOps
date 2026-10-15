// Real PodClient backed by @kubernetes/client-node. Uses in-cluster config: the
// loadgen pod's mounted ServiceAccount token + the namespace-scoped Role/
// RoleBinding from modules/loadgen/rbac.tf (created only when enable_chaos=true).
// This file is the thin adapter — all guard logic lives in chaos.ts and is
// tested against the PodClient interface with a fake, so this module stays
// untested (like tracing.ts) and is excluded from the coverage gate.
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import type { PodClient, PodInfo } from './chaos';

export function createInClusterPodClient(): PodClient {
  const kc = new KubeConfig();
  kc.loadFromCluster();
  const core = kc.makeApiClient(CoreV1Api);

  return {
    async listPods(namespace: string, labelSelector: string): Promise<PodInfo[]> {
      const resp = await core.listNamespacedPod({ namespace, labelSelector });
      return (resp.items ?? []).map((p) => ({
        name: p.metadata?.name ?? '',
        namespace: p.metadata?.namespace ?? namespace,
        labels: p.metadata?.labels ?? {},
      }));
    },
    async deletePod(namespace: string, name: string): Promise<void> {
      await core.deleteNamespacedPod({ name, namespace });
    },
  };
}
