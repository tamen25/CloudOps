// api-gateway process entrypoint. tracing must be imported first so it can
// patch modules before express/http are loaded.
import './tracing';

import pino from 'pino';
import { createApp } from './app';

const PORT = Number(process.env.PORT) || 8080;
const PRICING_URL = process.env.PRICING_URL || 'http://pricing';
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://inventory';
const FRAUD_URL = process.env.FRAUD_URL || 'http://fraud';
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://payment';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.secret'],
    censor: '[redacted]',
  },
});

const app = createApp({
  pricingUrl: PRICING_URL,
  inventoryUrl: INVENTORY_URL,
  fraudUrl: FRAUD_URL,
  paymentUrl: PAYMENT_URL,
  logger,
});

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, pricingUrl: PRICING_URL, inventoryUrl: INVENTORY_URL, fraudUrl: FRAUD_URL, paymentUrl: PAYMENT_URL }, 'api-gateway started');
});

function shutdown(): void {
  logger.info('SIGTERM received, draining');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
