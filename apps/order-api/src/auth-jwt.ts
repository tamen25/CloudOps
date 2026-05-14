// This file contains auth JWT logic for order API src.
// OIDC / JWKS bearer-token verification — closes backlog #7.
//
// Wires `jose` for offline JWT verification against a remote JWKS endpoint
// (Cognito User Pool, Auth0, Okta, generic OIDC). The JWKS is cached in
// memory by jose's createRemoteJWKSet (default 10-min cache, refreshed on
// kid miss). Returns Express middleware.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

type Logger = { warn: (...a: unknown[]) => void; info?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void };

// Parses scopes.
export function parseScopes(claims: { scp?: unknown; scope?: unknown }): Set<string> {
  if (Array.isArray(claims.scp)) return new Set(claims.scp as string[]);
  if (typeof claims.scope === 'string') return new Set(claims.scope.split(/\s+/).filter(Boolean));
  return new Set();
}

// Handles has all scopes.
export function hasAllScopes(present: Set<string>, required: Set<string>): boolean {
  for (const s of required) if (!present.has(s)) return false;
  return true;
}

// Closes backlog #104. Maps a jose JWTVerify error onto a low-cardinality
// outcome label for the jwt_verify_total Prometheus counter. The key
// distinction is `jwks_unreachable` — that's the one a PrometheusRule
// alerts on (Cognito JWKS down ⇒ every auth call fails).
export function classifyJwtError(err: { code?: string; message?: string } | undefined): string {
  if (!err) return 'other';
  const code = (err.code || '').toUpperCase();
  if (code === 'ERR_JWT_EXPIRED') return 'expired';
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('iss')) return 'wrong_issuer';
    if (msg.includes('aud')) return 'wrong_audience';
    return 'invalid_claim';
  }
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'invalid_signature';
  // JWKS fetch errors surface as JWKSNoMatchingKey / JWKSInvalid / generic
  // fetch failures. jose tags fetch failures via the `cause` chain;
  // pattern-match the message for transport failures.
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('fetch') || msg.includes('econn') || msg.includes('jwks') || msg.includes('timeout')) {
    return 'jwks_unreachable';
  }
  return 'other';
}

export interface CreateJwtVerifierArgs {
  issuer: string;
  audience: string;
  jwksUrl: string;
  requiredScopes?: Iterable<string>;
  logger?: Logger;
  jwksOptions?: Record<string, unknown>;
  // Optional Prometheus counter for verify outcomes (#104). Receives the
  // outcome label (`ok`, `jwks_unreachable`, `expired`, ...). Wiring is in
  // createApp via the metrics block; tests can pass a sink for assertions.
  onOutcome?: (outcome: string) => void;
}

// Creates JWT verifier.
export function createJwtVerifier(args: CreateJwtVerifierArgs = {} as CreateJwtVerifierArgs) {
  const {
    issuer,
    audience,
    jwksUrl,
    requiredScopes = [],
    logger = { warn() {}, info() {}, error() {} },
    jwksOptions = {},
    onOutcome = () => {},
  } = args;

  if (!issuer || !audience || !jwksUrl) {
    throw new Error('createJwtVerifier requires issuer, audience, and jwksUrl');
  }

  const jwks = createRemoteJWKSet(new URL(jwksUrl), jwksOptions as Parameters<typeof createRemoteJWKSet>[1]);
  const required = new Set(requiredScopes);

  return async function verify(req: Request & { user?: unknown }, res: Response, next: NextFunction) {
    const header = req.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) {
      // No bearer token — let downstream auth (API key) decide.
      return next();
    }

    const token = m[1].trim();
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience,
        algorithms: ['RS256', 'RS512', 'ES256', 'ES384'],
      });

      if (required.size > 0) {
        const present = parseScopes(payload as { scp?: unknown; scope?: unknown });
        if (!hasAllScopes(present, required)) {
          logger.warn({ sub: payload.sub, present: [...present], required: [...required] }, 'jwt missing required scope');
          onOutcome('missing_scope');
          return res.status(403).json({ error: 'forbidden', detail: 'missing scope' }); /* node:coverage ignore next */
        }
      }

      req.user = payload;
      onOutcome('ok');
      return next();
    } catch (err: any) {
      const outcome = classifyJwtError(err);
      logger.warn({ err: err.code || err.message, outcome }, 'jwt verification failed');
      onOutcome(outcome);
      return res.status(401).json({ error: 'unauthorized', detail: 'invalid token' });
    }
  };
}
