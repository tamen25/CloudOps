'use strict';

// OIDC / JWKS bearer-token verification — closes backlog #7.
//
// Wires `jose` for offline JWT verification against a remote JWKS endpoint
// (Cognito User Pool, Auth0, Okta, generic OIDC). The JWKS is cached in
// memory by jose's createRemoteJWKSet (default 10-min cache, refreshed on
// kid miss). Returns Express middleware.
//
// Token expectations:
//   Authorization: Bearer <jwt>
//   - issuer: must equal the configured issuer (drops cross-tenant tokens)
//   - audience: must equal the configured audience
//   - exp / nbf / iat: standard checks performed by jose.jwtVerify
//   - scope: optional, space-separated. When `requiredScopes` is set, the
//     token must carry every required scope (Cognito + Auth0 expose scopes
//     in either `scope` (space-separated) or `scp` (array)).
//
// The verifier ATTACHES the verified claims to req.user. Downstream
// handlers can read req.user.sub, req.user.tenant_id, etc.

const { createRemoteJWKSet, jwtVerify } = require('jose');

function parseScopes(claims) {
  if (Array.isArray(claims.scp)) return new Set(claims.scp);
  if (typeof claims.scope === 'string') return new Set(claims.scope.split(/\s+/).filter(Boolean));
  return new Set();
}

function hasAllScopes(present, required) {
  for (const s of required) if (!present.has(s)) return false;
  return true;
}

// Build a verifier middleware. Pass:
//   issuer:          required — exact iss value to accept.
//   audience:        required — exact aud value to accept.
//   jwksUrl:         required — full URL to the JWKS document.
//   requiredScopes:  optional Iterable<string>. Empty = no scope check.
//   logger:          optional pino-style logger.
//   jwksOptions:     optional — passed straight to createRemoteJWKSet.
function createJwtVerifier({
  issuer,
  audience,
  jwksUrl,
  requiredScopes = [],
  logger = { warn() {}, info() {}, error() {} },
  jwksOptions = {},
} = {}) {
  if (!issuer || !audience || !jwksUrl) {
    throw new Error('createJwtVerifier requires issuer, audience, and jwksUrl');
  }

  const jwks = createRemoteJWKSet(new URL(jwksUrl), jwksOptions);
  const required = new Set(requiredScopes);

  return async function verify(req, res, next) {
    const header = req.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) {
      // No bearer token — let downstream auth (API key) decide. Returning
      // next() WITHOUT setting req.user lets requireApiKey enforce or open
      // the endpoint per the existing rules.
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
        const present = parseScopes(payload);
        if (!hasAllScopes(present, required)) {
          logger.warn({ sub: payload.sub, present: [...present], required: [...required] }, 'jwt missing required scope');
          return res.status(403).json({ error: 'forbidden', detail: 'missing scope' });
        }
      }

      req.user = payload;
      return next();
    } catch (err) {
      logger.warn({ err: err.code || err.message }, 'jwt verification failed');
      return res.status(401).json({ error: 'unauthorized', detail: 'invalid token' });
    }
  };
}

module.exports = { createJwtVerifier, parseScopes, hasAllScopes };
