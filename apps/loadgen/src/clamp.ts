// Safety clamps for load-run parameters. A stuck or malicious "start" must not
// be able to run the cluster (and the bill, #139) away. These ceilings are the
// hard cap; the BFF clamps again before calling us (defence in depth).

export const MAX_RPS = 200;
export const MAX_DURATION_SECONDS = 600; // 10 minutes
export const MIN_RPS = 1;
export const MIN_DURATION_SECONDS = 1;

export interface RunParams {
  rps: number;
  durationSeconds: number;
}

export function clampRps(rps: unknown): number {
  const n = Math.floor(Number(rps));
  if (!Number.isFinite(n)) return MIN_RPS;
  return Math.min(MAX_RPS, Math.max(MIN_RPS, n));
}

export function clampDuration(seconds: unknown): number {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n)) return MIN_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, n));
}

export function clampRunParams(rps: unknown, durationSeconds: unknown): RunParams {
  return { rps: clampRps(rps), durationSeconds: clampDuration(durationSeconds) };
}
