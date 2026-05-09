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

export interface CreateJwtVerifierArgs {
  issuer: string;
  audience: string;
  jwksUrl: string;
  requiredScopes?: Iterable<string>;
  logger?: Logger;
  jwksOptions?: Record<string, unknown>;
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
          return res.status(403).json({ error: 'forbidden', detail: 'missing scope' }); /* node:coverage ignore next */
        }
      }

      req.user = payload;
      return next();
    } catch (err: any) {
      logger.warn({ err: err.code || err.message }, 'jwt verification failed');
      return res.status(401).json({ error: 'unauthorized', detail: 'invalid token' });
    }
  };
}
