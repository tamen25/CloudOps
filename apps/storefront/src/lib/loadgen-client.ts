// Server-side client for the loadgen control API. Signs requests with the
// internal HMAC scheme (sha256hex(timestamp.tenant.rawBody.secret)) the loadgen
// verifies, and clamps run params again here (defence in depth — the loadgen
// hard-clamps too). Runs only in route handlers; the secret never reaches the
// browser.
import { createHash } from "crypto";

const MAX_RPS = 200;
const MAX_DURATION = 600;

export function clampRps(rps: unknown): number {
  const n = Math.floor(Number(rps));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_RPS, Math.max(1, n));
}

export function clampDuration(seconds: unknown): number {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_DURATION, Math.max(1, n));
}

export const SCENARIOS = ["browse", "place-order", "burst", "mixed", "chaos"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export function isScenario(s: string): s is Scenario {
  return (SCENARIOS as readonly string[]).includes(s);
}

function signHeaders(rawBody: string, tenant: string, secret: string): Record<string, string> {
  const ts = String(Date.now());
  const hmac = createHash("sha256").update(`${ts}.${tenant}.${rawBody}.${secret}`).digest("hex");
  return {
    "content-type": "application/json",
    "x-cloudops-timestamp": ts,
    "x-cloudops-tenant": tenant,
    "x-cloudops-hmac": hmac,
  };
}

export interface LoadgenConfig {
  baseUrl: string; // LOADGEN_URL — fixed in-cluster control API
  secret: string; // INTERNAL_HMAC_SECRET
  tenant?: string;
}

export interface RunRequest {
  scenario: string;
  rps: unknown;
  durationSeconds: unknown;
}

// startRun POSTs a clamped, signed /run to the loadgen. Returns the upstream
// status + body. Throws only on network failure.
export async function startRun(cfg: LoadgenConfig, req: RunRequest): Promise<{ status: number; body: unknown }> {
  if (!isScenario(req.scenario)) {
    return { status: 400, body: { error: "invalid_scenario" } };
  }
  const payload = {
    scenario: req.scenario,
    rps: clampRps(req.rps),
    durationSeconds: clampDuration(req.durationSeconds),
  };
  const raw = JSON.stringify(payload);
  const res = await fetch(`${cfg.baseUrl}/run`, {
    method: "POST",
    headers: signHeaders(raw, cfg.tenant ?? "ops", cfg.secret),
    body: raw,
    signal: AbortSignal.timeout(4000),
  });
  return { status: res.status, body: await safeJson(res) };
}

export async function stopRun(cfg: LoadgenConfig): Promise<{ status: number; body: unknown }> {
  const raw = "{}";
  const res = await fetch(`${cfg.baseUrl}/stop`, {
    method: "POST",
    headers: signHeaders(raw, cfg.tenant ?? "ops", cfg.secret),
    body: raw,
    signal: AbortSignal.timeout(4000),
  });
  return { status: res.status, body: await safeJson(res) };
}

export async function getStatus(cfg: LoadgenConfig): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${cfg.baseUrl}/status`, { signal: AbortSignal.timeout(4000) });
  return { status: res.status, body: await safeJson(res) };
}

// Mesh services the operator may target for a chaos pod-kill. Mirrors the
// allowlist in apps/loadgen/src/chaos.ts — loadgen itself and all infra are
// intentionally absent. The loadgen re-checks server-side; this is the BFF copy
// so the route can reject bad input early.
export const CHAOS_SERVICES = [
  "pricing",
  "inventory",
  "fraud",
  "payment",
  "ledger",
  "projection-worker",
  "api-gateway",
] as const;
export type ChaosService = (typeof CHAOS_SERVICES)[number];

export function isChaosService(s: string): s is ChaosService {
  return (CHAOS_SERVICES as readonly string[]).includes(s);
}

export interface ChaosRequest {
  service: string;
  dryRun: boolean;
}

// triggerChaos POSTs a signed /chaos/kill. dryRun is passed through explicitly;
// only an exact `false` performs a real delete (the loadgen defaults to dry-run
// otherwise). Returns the upstream status + body. Throws only on network failure.
export async function triggerChaos(cfg: LoadgenConfig, req: ChaosRequest): Promise<{ status: number; body: unknown }> {
  if (!isChaosService(req.service)) {
    return { status: 400, body: { error: "service_not_killable" } };
  }
  // Only an explicit dryRun:false from the caller becomes a real kill; anything
  // else stays a dry-run (matches the loadgen's server-side default).
  const payload = { service: req.service, dryRun: req.dryRun === false ? false : true };
  const raw = JSON.stringify(payload);
  const res = await fetch(`${cfg.baseUrl}/chaos/kill`, {
    method: "POST",
    headers: signHeaders(raw, cfg.tenant ?? "ops", cfg.secret),
    body: raw,
    signal: AbortSignal.timeout(4000),
  });
  return { status: res.status, body: await safeJson(res) };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
