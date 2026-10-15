// payment process entrypoint. tracing imported first.
import './tracing';

import pino from 'pino';
import { createApp } from './app';

const PORT = Number(process.env.PORT) || 8080;
const LEDGER_URL = process.env.LEDGER_URL || 'http://ledger';
const HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || '';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.secret', '*.x-cloudops-hmac'],
    censor: '[redacted]',
  },
});

if (!HMAC_SECRET) {
  logger.error('INTERNAL_HMAC_SECRET not set — ledger calls will be rejected');
}

const app = createApp({ ledgerUrl: LEDGER_URL, hmacSecret: HMAC_SECRET, logger });

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, ledgerUrl: LEDGER_URL }, 'payment started');
});

function shutdown(): void {
  logger.info('SIGTERM received, draining');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
