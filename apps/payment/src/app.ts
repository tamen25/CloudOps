// payment service — authorize a charge, then post a balanced entry to the
// ledger over the internal HMAC channel. The ledger call is injectable
// (fetchImpl) for testing. Authorization is a stub (always approves below the
// decline ceiling) — this exists to make the trace deep, not to move money.
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { signInternal } from './hmac';

export interface PaymentLogger {
  info: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

export interface PaymentDeps {
  ledgerUrl: string;
  hmacSecret: string;
  logger: PaymentLogger;
  fetchImpl?: typeof fetch;
  idGen?: () => string;
  // Ledger call timeout. Without one a hung ledger held the authorization
  // (and the gateway's request) open.
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

// Amounts at or above this (cents) are declined, so the chaos/burst scenarios
// can exercise the decline branch deterministically.
const DECLINE_CEILING_CENTS = 1_000_000;

const FORWARD_HEADERS = ['traceparent', 'tracestate', 'x-synthetic'];

export function createApp(deps: PaymentDeps): Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));
  const doFetch = deps.fetchImpl ?? fetch;
  const idGen = deps.idGen ?? randomUUID;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  app.get('/healthz', (_req: Request, res: Response) => { res.status(200).json({ status: 'ok' }); });
  app.get('/readyz', (_req: Request, res: Response) => { res.status(200).json({ status: 'ready' }); });

  app.post('/authorize', async (req: Request, res: Response) => {
    const amount = Number(req.body?.amount_cents);
    const tenant = typeof req.body?.tenant_id === 'string' && req.body.tenant_id ? req.body.tenant_id : 'default';

    if (!Number.isInteger(amount) || amount <= 0) {
      res.status(400).json({ error: 'invalid_amount' });
      return;
    }
    if (amount >= DECLINE_CEILING_CENTS) {
      res.status(402).json({ status: 'declined', reason: 'amount_exceeds_ceiling' });
      return;
    }

    const authId = idGen();

    // Post the authorized charge to the ledger. A ledger failure fails the
    // authorization (we will not report success for an unrecorded charge).
    const ledgerBody = JSON.stringify({ auth_id: authId, tenant_id: tenant, amount_cents: amount });
    const headers: Record<string, string> = { ...signInternal(tenant, ledgerBody, deps.hmacSecret) };
    for (const h of FORWARD_HEADERS) {
      const v = req.header(h);
      if (v) headers[h] = v;
    }

    try {
      const lr = await doFetch(`${deps.ledgerUrl}/entries`, {
        method: 'POST',
        headers,
        body: ledgerBody,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!lr.ok) {
        deps.logger.error({ status: lr.status }, 'ledger post failed');
        res.status(502).json({ error: 'ledger_failed' });
        return;
      }
      const entry = (await lr.json()) as { entry_id: string };
      res.status(200).json({ status: 'authorized', auth_id: authId, entry_id: entry.entry_id });
    } catch (err) {
      deps.logger.error({ err }, 'ledger unreachable');
      if ((err as Error)?.name === 'TimeoutError') {
        res.status(504).json({ error: 'ledger_timeout' });
        return;
      }
      res.status(502).json({ error: 'ledger_unavailable' });
    }
  });

  return app;
}
