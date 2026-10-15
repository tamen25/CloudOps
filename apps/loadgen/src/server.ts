// loadgen process entrypoint. tracing first. The runner targets GATEWAY_URL
// only (SSRF guard). If RUN_ON_START is set (the trickle CronJob path), it
// kicks off a bounded run immediately and exits when done.
import './tracing';

import pino from 'pino';
import { createApp } from './app';
import { LoadRunner } from './runner';
import { isScenario, type ScenarioName } from './scenarios';
import { ChaosController } from './chaos';
import { createInClusterPodClient } from './k8s';

const PORT = Number(process.env.PORT) || 8080;
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://api-gateway';
const HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || '';
const HMAC_SECRET_PREVIOUS = process.env.INTERNAL_HMAC_SECRET_PREVIOUS || '';
// Chaos is OFF unless explicitly enabled AND the RBAC exists (rbac.tf). When
// off, no k8s client is constructed and POST /chaos/kill is a 404.
const CHAOS_ENABLED = process.env.CHAOS_ENABLED === '1';
const MESH_NAMESPACE = process.env.MESH_NAMESPACE || 'cloudops';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.secret', '*.x-cloudops-hmac'],
    censor: '[redacted]',
  },
});

const runner = new LoadRunner({
  targetBaseUrl: GATEWAY_URL,
  logger: { info: (...a) => logger.info(...(a as [object])), error: (...a) => logger.error(...(a as [object])) },
});

// Batch mode: RUN_ON_START fires one bounded run (the trickle CronJob + the
// loadgen.yml workflow path), then the process exits 0 so the Job records
// success — it does NOT start the long-running control API.
const runOnStart = process.env.RUN_ON_START || '';
if (runOnStart && isScenario(runOnStart)) {
  const rps = process.env.RUN_RPS || '3';
  const duration = process.env.RUN_DURATION_SECONDS || '60';
  const params = runner.start(runOnStart as ScenarioName, rps, duration);
  logger.info({ scenario: runOnStart, ...params }, 'loadgen batch run fired');
  setTimeout(() => {
    runner.stop();
    const s = runner.getStatus();
    logger.info({ sent: s.sent, ok: s.ok, failed: s.failed }, 'loadgen batch run complete');
    process.exit(0);
  }, params.durationSeconds * 1000 + 2000);
} else {
  // Construct the chaos controller only when enabled — building it loads
  // in-cluster k8s config, which only works inside the pod with the RBAC token.
  const chaos = CHAOS_ENABLED
    ? new ChaosController({
        client: createInClusterPodClient(),
        namespace: MESH_NAMESPACE,
        logger: {
          info: (...a) => logger.info(...(a as [object])),
          error: (...a) => logger.error(...(a as [object])),
        },
      })
    : undefined;
  if (CHAOS_ENABLED) logger.info({ namespace: MESH_NAMESPACE }, 'chaos pod-kill ENABLED');

  const app = createApp({
    runner,
    hmacSecret: HMAC_SECRET,
    hmacSecretPrevious: HMAC_SECRET_PREVIOUS,
    chaos,
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, gatewayUrl: GATEWAY_URL }, 'loadgen control API started');
  });

  const shutdown = (): void => {
    logger.info('SIGTERM received, stopping run + draining');
    runner.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 30000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
