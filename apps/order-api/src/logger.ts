import pino, { type Logger, type LoggerOptions } from 'pino';

/* Pino redact policy. Any log line that bubbles up an Error with a stack trace
 * or a stringified Express request can leak secrets — DB URLs (password
 * fragment), Authorization headers, Cookie headers, Set-Cookie, the HMAC
 * `x-internal-signature`, OTel bearer tokens, JWTs, etc. Block the fields at
 * source so a logger.error(err) anywhere in the call graph cannot exfiltrate.
 * Paths use pino's dot syntax — `[*]` matches any array index. */
const REDACT_PATHS = [
  // Generic field names — covers nested objects in arbitrary depth-1 contexts.
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'set-cookie',
  // Express req/res shapes (pino-http compatible).
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-internal-signature"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  // Common nested places where these surface in our code.
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.authorization',
  '*.cookie',
];

export function createLogger(opts: LoggerOptions = {}): Logger {
  return pino({
    level: 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...opts,
  });
}

export { REDACT_PATHS };
