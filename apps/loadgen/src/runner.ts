// LoadRunner drives synthetic traffic at the gateway at a target rps for a
// bounded duration. It paces with a simple per-tick budget (rps requests per
// second, fired in 100ms slices) rather than blindly spamming, and tags every
// request as synthetic so traces/metrics stay filterable. fetchImpl + a clock
// are injectable so the runner is testable without real time or network.
import { clampRunParams, type RunParams } from './clamp';
import { pickTemplate, scenarioTemplates, type ScenarioName } from './scenarios';

export interface RunnerDeps {
  targetBaseUrl: string; // ONLY the in-cluster gateway — never user-supplied
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
}

export interface RunStatus {
  running: boolean;
  scenario: ScenarioName | null;
  rps: number;
  sent: number;
  ok: number;
  failed: number;
  startedAt: number | null;
  endsAt: number | null;
}

const TICK_MS = 100; // 10 slices per second

export class LoadRunner {
  private deps: Required<Omit<RunnerDeps, 'logger'>> & { logger: NonNullable<RunnerDeps['logger']> };
  private status: RunStatus = {
    running: false,
    scenario: null,
    rps: 0,
    sent: 0,
    ok: 0,
    failed: 0,
    startedAt: null,
    endsAt: null,
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight = 0;

  constructor(deps: RunnerDeps) {
    this.deps = {
      targetBaseUrl: deps.targetBaseUrl,
      fetchImpl: deps.fetchImpl ?? fetch,
      now: deps.now ?? Date.now,
      logger: deps.logger ?? { info() {}, error() {} },
    };
  }

  getStatus(): RunStatus {
    return { ...this.status, running: this.status.running, rps: this.status.rps };
  }

  getInflight(): number {
    return this.inflight;
  }

  // start kicks off a timed run. Returns the clamped params actually used.
  start(scenario: ScenarioName, rps: unknown, durationSeconds: unknown): RunParams {
    this.stop(); // a new run supersedes any in-flight run
    const params = clampRunParams(rps, durationSeconds);
    const startedAt = this.deps.now();
    this.status = {
      running: true,
      scenario,
      rps: params.rps,
      sent: 0,
      ok: 0,
      failed: 0,
      startedAt,
      endsAt: startedAt + params.durationSeconds * 1000,
    };

    // Fractional token budget: each tick adds rps*tick/1000 tokens and we fire
    // floor(budget) requests, carrying the remainder. This keeps low rps
    // accurate (rps=3 → ~3/s, not 10/s from a per-tick floor of 1).
    const perTickTokens = (params.rps * TICK_MS) / 1000;
    let budget = 0;
    const templates = scenarioTemplates(scenario);

    this.timer = setInterval(() => {
      if (this.deps.now() >= (this.status.endsAt ?? 0)) {
        this.stop();
        return;
      }
      budget += perTickTokens;
      const fire = Math.floor(budget);
      budget -= fire;
      for (let i = 0; i < fire; i++) {
        void this.fireOne(scenario, templates);
      }
    }, TICK_MS);

    // Node-only: don't keep the event loop alive solely for the timer.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }

    return params;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.running = false;
  }

  // fireOne sends a single synthetic request. Exposed for tests.
  async fireOne(scenario: ScenarioName, templates = scenarioTemplates(scenario)): Promise<void> {
    const tpl = pickTemplate(templates);
    const headers: Record<string, string> = { 'x-synthetic': '1' };
    if (tpl.fault) headers['x-chaos'] = '1';
    let body: string | undefined;
    if (tpl.method === 'POST') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(tpl.body ? tpl.body() : {});
    }

    this.inflight++;
    this.status.sent++;
    try {
      const res = await this.deps.fetchImpl(`${this.deps.targetBaseUrl}${tpl.path}`, {
        method: tpl.method,
        headers,
        body,
      });
      // Chaos requests are EXPECTED to fail; count them as ok-by-design so the
      // failure rate reflects unexpected failures only.
      if (res.ok || tpl.fault) this.status.ok++;
      else this.status.failed++;
    } catch {
      this.status.failed++;
    } finally {
      this.inflight--;
    }
  }
}
