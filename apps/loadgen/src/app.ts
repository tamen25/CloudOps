// loadgen control API. HMAC-gated POST /run + /stop; open GET /healthz,
// /readyz, /status, /metrics. The traffic TARGET is fixed to the in-cluster
// gateway (injected at construction from GATEWAY_URL) and can NEVER be set from
// a request body — this is the structural SSRF guard. Requests only carry
// {scenario, rps, durationSeconds}.
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { LoadRunner } from './runner';
import { isScenario } from './scenarios';
import { verifyInternalHmac } from './hmac';
import type { ChaosController } from './chaos';

export interface ControlDeps {
  runner: LoadRunner;
  hmacSecret: string;
  hmacSecretPrevious?: string;
  now?: () => number;
  // Present only when chaos is enabled (CHAOS_ENABLED + the RBAC from
  // modules/loadgen/rbac.tf). Absent => POST /chaos/kill returns 404, so the
  // endpoint does not exist at all unless the operator turned chaos on.
  chaos?: ChaosController;
}

export function createApp(deps: ControlDeps): Express {
  const app = express();
  app.use(helmet());
  // Capture the raw body so the HMAC is computed over exactly what was sent.
  app.use(express.json({
    limit: '8kb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  }));

  const now = deps.now ?? Date.now;

  app.get('/healthz', (_req, res) => { res.status(200).json({ status: 'ok' }); });
  app.get('/readyz', (_req, res) => { res.status(200).json({ status: 'ready' }); });

  app.get('/status', (_req, res) => {
    res.status(200).json({ ...deps.runner.getStatus(), inflight: deps.runner.getInflight() });
  });

  app.get('/metrics', (_req, res) => {
    const s = deps.runner.getStatus();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(
      `# TYPE loadgen_requests_total counter\nloadgen_requests_total ${s.sent}\n` +
      `# TYPE loadgen_requests_ok_total counter\nloadgen_requests_ok_total ${s.ok}\n` +
      `# TYPE loadgen_requests_failed_total counter\nloadgen_requests_failed_total ${s.failed}\n` +
      `# TYPE loadgen_inflight gauge\nloadgen_inflight ${deps.runner.getInflight()}\n` +
      `# TYPE loadgen_running gauge\nloadgen_running ${s.running ? 1 : 0}\n`,
    );
  });

  const requireHmac = (req: Request, res: Response): boolean => {
    const raw = (req as Request & { rawBody?: string }).rawBody ?? '';
    const result = verifyInternalHmac(
      {
        hmac: req.get('x-cloudops-hmac'),
        timestamp: req.get('x-cloudops-timestamp'),
        tenant: req.get('x-cloudops-tenant'),
      },
      raw,
      deps.hmacSecret,
      deps.hmacSecretPrevious ?? '',
      now(),
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.reason });
      return false;
    }
    return true;
  };

  app.post('/run', (req, res) => {
    if (!requireHmac(req, res)) return;
    const scenario = String(req.body?.scenario ?? '');
    if (!isScenario(scenario)) {
      res.status(400).json({ error: 'invalid_scenario' });
      return;
    }
    const params = deps.runner.start(scenario, req.body?.rps, req.body?.durationSeconds);
    res.status(202).json({ status: 'started', scenario, ...params });
  });

  app.post('/stop', (req, res) => {
    if (!requireHmac(req, res)) return;
    deps.runner.stop();
    res.status(200).json({ status: 'stopped' });
  });

  // POST /chaos/kill — real pod-kill fault injection (#143). HMAC-gated like
  // /run; the BFF adds the admin Cognito gate. The endpoint only exists when a
  // ChaosController was injected (CHAOS_ENABLED + RBAC). Body: {service,dryRun}.
  // dryRun defaults to true in the controller, so a real kill needs an explicit
  // {"dryRun": false}. The target service is checked against a fixed mesh
  // allowlist — never free-form (structural guard, like the SSRF target).
  app.post('/chaos/kill', async (req, res) => {
    if (!deps.chaos) {
      res.status(404).json({ error: 'chaos_disabled' });
      return;
    }
    if (!requireHmac(req, res)) return;
    const service = String(req.body?.service ?? '');
    // Only an explicit boolean false performs a real kill; anything else (absent,
    // true, "false" string) stays a dry-run.
    const dryRun = req.body?.dryRun === false ? false : true;
    const result = await deps.chaos.killPod(service, { dryRun });
    res.status(result.ok ? 200 : 400).json(result);
  });

  return app;
}
